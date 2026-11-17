import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type { SavedPlaceCategory } from './mapsHelpers';

export const BLUEPRINT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_MAX: 128,
  DISPLAY_NAME_MAX: 100,
  EMAIL_MAX: 160,
  PLACE_ID_MAX: 200,
  TITLE_MAX: 160,
  MAPS_URI_MAX: 500,
  NOTE_MAX: 300,
  BOOKING_ID_MAX: 40,
  APPT_TYPE_MAX: 60,
  CLINICIAN_MAX: 80,
} as const;

export interface SavedPlaceRecord {
  id: string;
  ownerId: string;
  placeId: string;
  title: string;
  mapsUri: string;
  category: SavedPlaceCategory;
  note?: string;
}

export interface SavedAppointmentReceiptRecord {
  id: string;
  ownerId: string;
  bookingId: string;
  appointmentType: string;
  slotDate: string;
  slotTime: string;
  clinicianLabel: string;
  status: 'confirmed' | 'cancelled';
}

export function sanitizeDocId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, BLUEPRINT_LIMITS.ID_MAX);
  return cleaned.length > 0 ? cleaned : `doc_${Date.now()}`;
}

export function isValidBlueprintUid(uid: string): boolean {
  return (
    uid.length >= 1 &&
    uid.length <= BLUEPRINT_LIMITS.ID_MAX &&
    BLUEPRINT_LIMITS.ID_PATTERN.test(uid)
  );
}

export async function ensureUserProfile(user: User): Promise<void> {
  if (!user.emailVerified || !isValidBlueprintUid(user.uid)) return;
  const userPath = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const displayName = (user.displayName || user.email?.split('@')[0] || 'CareSignal Member')
    .trim()
    .slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX);
  const email = (user.email || '').trim().slice(0, BLUEPRINT_LIMITS.EMAIL_MAX);
  if (email.length < 3) return;

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        email,
        workspacePreference: 'operations',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export function subscribeSavedPlaces(
  uid: string,
  onData: (places: SavedPlaceRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/savedPlaces`;
  const q = query(
    collection(db, 'users', uid, 'savedPlaces'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const rows: SavedPlaceRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId ?? uid),
          placeId: String(data.placeId ?? d.id),
          title: String(data.title ?? 'Saved Place'),
          mapsUri: String(data.mapsUri ?? 'https://maps.google.com'),
          category: (data.category as SavedPlaceCategory) ?? 'other',
          note: typeof data.note === 'string' ? data.note : undefined,
        };
      });
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function savePlaceToFirestore(
  uid: string,
  input: {
    placeId: string;
    title: string;
    mapsUri: string;
    category: SavedPlaceCategory;
    note?: string;
  }
): Promise<void> {
  if (!isValidBlueprintUid(uid)) {
    throw new Error('Invalid signed-in user identifier.');
  }
  const safeDocId = sanitizeDocId(input.placeId);
  const path = `users/${uid}/savedPlaces/${safeDocId}`;

  const safeTitle = input.title.trim().slice(0, BLUEPRINT_LIMITS.TITLE_MAX) || 'Saved Clinic';
  const safePlaceId = input.placeId.trim().slice(0, BLUEPRINT_LIMITS.PLACE_ID_MAX) || safeDocId;
  const safeUri = input.mapsUri.trim().startsWith('https://')
    ? input.mapsUri.trim().slice(0, BLUEPRINT_LIMITS.MAPS_URI_MAX)
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeTitle)}`;
  const safeNote = input.note?.trim().slice(0, BLUEPRINT_LIMITS.NOTE_MAX);

  try {
    const ref = doc(db, 'users', uid, 'savedPlaces', safeDocId);
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, {
        title: safeTitle,
        category: input.category,
        ...(safeNote ? { note: safeNote } : {}),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        placeId: safePlaceId,
        title: safeTitle,
        mapsUri: safeUri,
        category: input.category,
        ...(safeNote ? { note: safeNote } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeSavedPlaceFromFirestore(uid: string, docId: string): Promise<void> {
  const safeDocId = sanitizeDocId(docId);
  const path = `users/${uid}/savedPlaces/${safeDocId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'savedPlaces', safeDocId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeSavedAppointments(
  uid: string,
  onData: (items: SavedAppointmentReceiptRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/appointments`;
  const q = query(
    collection(db, 'users', uid, 'appointments'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const rows: SavedAppointmentReceiptRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId ?? uid),
          bookingId: String(data.bookingId ?? d.id),
          appointmentType: String(data.appointmentType ?? 'Routine Visit'),
          slotDate: String(data.slotDate ?? ''),
          slotTime: String(data.slotTime ?? ''),
          clinicianLabel: String(data.clinicianLabel ?? 'Clinic Provider'),
          status: data.status === 'cancelled' ? 'cancelled' : 'confirmed',
        };
      });
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function saveAppointmentReceiptToFirestore(
  uid: string,
  receipt: {
    bookingId: string;
    appointmentType: string;
    slotDate: string;
    slotTime: string;
    clinicianLabel: string;
  }
): Promise<void> {
  if (!isValidBlueprintUid(uid)) return;
  const safeDocId = sanitizeDocId(receipt.bookingId);
  const path = `users/${uid}/appointments/${safeDocId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'appointments', safeDocId), {
      ownerId: uid,
      bookingId: receipt.bookingId.trim().slice(0, BLUEPRINT_LIMITS.BOOKING_ID_MAX),
      appointmentType: receipt.appointmentType.trim().slice(0, BLUEPRINT_LIMITS.APPT_TYPE_MAX),
      slotDate: receipt.slotDate.trim().slice(0, 20),
      slotTime: receipt.slotTime.trim().slice(0, 20),
      clinicianLabel: receipt.clinicianLabel.trim().slice(0, BLUEPRINT_LIMITS.CLINICIAN_MAX),
      status: 'confirmed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

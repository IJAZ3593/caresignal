import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AppointmentSlot,
  AuthUser,
  ClinicSettings,
  DailyUsagePoint,
  InventoryLogEntry,
  MedicineRecord,
} from '../src/lib/types';
import { addDaysIso } from '../src/lib/stockout';
import { hashPassword } from './auth';

export interface StoredUser extends AuthUser {
  passwordHash: string;
}

export interface ClinicDatabase {
  medicines: MedicineRecord[];
  inventoryLogs: InventoryLogEntry[];
  appointmentSlots: AppointmentSlot[];
  users: StoredUser[];
  settings: ClinicSettings;
}

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data');
const DB_PATH = path.join(DATA_DIR, 'clinic-db.json');

function buildHistory(todayIso: string, pattern: number[]): DailyUsagePoint[] {
  const startDate = addDaysIso(todayIso, -(pattern.length - 1));
  return pattern.map((unitsUsed, idx) => ({
    date: addDaysIso(startDate, idx),
    unitsUsed,
  }));
}

function addDaysSigned(baseIso: string, offset: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

export function createSeedDatabase(): ClinicDatabase {
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const medicines: MedicineRecord[] = [
    {
      id: 'med-amox',
      name: 'Amoxicillin 500mg',
      genericName: 'Amoxicillin Trihydrate',
      category: 'Oral Antibiotics',
      unit: 'capsules',
      currentStock: 82,
      reorderThreshold: 120,
      supplierLeadTimeDays: 4,
      dailyUsageHistory: buildHistory(todayIso, [14, 16, 12, 9, 10, 17, 19, 15, 18, 21, 16, 13, 20, 22]),
      updatedAt: nowIso,
    },
    {
      id: 'med-albu',
      name: 'Albuterol Inhaler 90mcg',
      genericName: 'Albuterol Sulfate HFA',
      category: 'Respiratory',
      unit: 'inhalers',
      currentStock: 26,
      reorderThreshold: 22,
      supplierLeadTimeDays: 7,
      dailyUsageHistory: buildHistory(todayIso, [3, 4, 2, 2, 3, 5, 4, 3, 4, 6, 4, 3, 5, 4]),
      updatedAt: nowIso,
    },
    {
      id: 'med-flu',
      name: 'Seasonal Influenza Vaccine',
      genericName: 'Quadrivalent Influenza Vaccine',
      category: 'Immunizations',
      unit: 'doses',
      currentStock: 44,
      reorderThreshold: 40,
      supplierLeadTimeDays: 8,
      dailyUsageHistory: buildHistory(todayIso, [5, 6, 7, 3, 4, 8, 9, 7, 10, 8, 6, 5, 9, 10]),
      updatedAt: nowIso,
    },
    {
      id: 'med-ibup',
      name: 'Ibuprofen 400mg',
      genericName: 'Ibuprofen',
      category: 'Analgesics',
      unit: 'tablets',
      currentStock: 410,
      reorderThreshold: 150,
      supplierLeadTimeDays: 3,
      dailyUsageHistory: buildHistory(todayIso, [18, 22, 19, 11, 14, 20, 24, 21, 19, 22, 16, 13, 23, 20]),
      updatedAt: nowIso,
    },
    {
      id: 'med-metf',
      name: 'Metformin 500mg',
      genericName: 'Metformin Hydrochloride',
      category: 'Chronic Care',
      unit: 'tablets',
      currentStock: 295,
      reorderThreshold: 140,
      supplierLeadTimeDays: 5,
      dailyUsageHistory: buildHistory(todayIso, [14, 15, 16, 9, 10, 15, 14, 16, 15, 17, 13, 11, 16, 15]),
      updatedAt: nowIso,
    },
    {
      id: 'med-azit',
      name: 'Azithromycin 250mg',
      genericName: 'Azithromycin',
      category: 'Oral Antibiotics',
      unit: 'tablets',
      currentStock: 108,
      reorderThreshold: 80,
      supplierLeadTimeDays: 6,
      dailyUsageHistory: buildHistory(todayIso, [7, 8, 9, 4, 5, 10, 11, 8, 9, 12, 7, 6, 11, 10]),
      updatedAt: nowIso,
    },
    {
      id: 'med-ors',
      name: 'Oral Rehydration Salts',
      genericName: 'Sodium Chloride / Glucose ORS',
      category: 'Hydration & Electrolytes',
      unit: 'sachets',
      currentStock: 215,
      reorderThreshold: 90,
      supplierLeadTimeDays: 4,
      dailyUsageHistory: buildHistory(todayIso, [10, 12, 11, 8, 9, 14, 12, 11, 13, 12, 10, 9, 13, 12]),
      updatedAt: nowIso,
    },
    {
      id: 'med-ceti',
      name: 'Cetirizine 10mg',
      genericName: 'Cetirizine Hydrochloride',
      category: 'Antihistamines',
      unit: 'tablets',
      currentStock: 340,
      reorderThreshold: 110,
      supplierLeadTimeDays: 3,
      dailyUsageHistory: buildHistory(todayIso, [12, 14, 13, 8, 9, 15, 14, 12, 13, 16, 11, 10, 14, 13]),
      updatedAt: nowIso,
    },
  ];

  const inventoryLogs: InventoryLogEntry[] = [
    {
      id: 'log-1',
      medicineId: 'med-amox',
      medicineName: 'Amoxicillin 500mg',
      changeDelta: -22,
      previousStock: 104,
      newStock: 82,
      reason: 'Daily outpatient dispensing',
      actorName: 'M. Patel (Clinic Staff)',
      createdAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    },
    {
      id: 'log-2',
      medicineId: 'med-flu',
      medicineName: 'Seasonal Influenza Vaccine',
      changeDelta: -10,
      previousStock: 54,
      newStock: 44,
      reason: 'Afternoon vaccination clinic',
      actorName: 'Dr. L. Gomez',
      createdAt: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
    },
    {
      id: 'log-3',
      medicineId: 'med-ibup',
      medicineName: 'Ibuprofen 400mg',
      changeDelta: 150,
      previousStock: 260,
      newStock: 410,
      reason: 'Supplier delivery #PO-4082',
      actorName: 'M. Patel (Clinic Staff)',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    },
  ];

  const d0 = todayIso;
  const d1 = addDaysSigned(todayIso, 1);
  const d2 = addDaysSigned(todayIso, 2);
  const d3 = addDaysSigned(todayIso, 3);

  const appointmentSlots: AppointmentSlot[] = [
    {
      id: 'slot-101',
      date: d0,
      time: '09:30',
      clinicianLabel: 'Nurse Practitioner S. Lin',
      allowedTypes: ['Routine Visit', 'Vaccination', 'Follow-up'],
      status: 'booked',
      booking: {
        bookingId: 'BK-2041',
        patientDisplayName: 'A. Rivera (Demo)',
        contactMasked: '***-***-0142',
        appointmentType: 'Vaccination',
        bookedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      },
    },
    {
      id: 'slot-102',
      date: d0,
      time: '11:00',
      clinicianLabel: 'Dr. L. Gomez',
      allowedTypes: ['Routine Visit', 'Follow-up', 'Medication Refill Review'],
      status: 'open',
    },
    {
      id: 'slot-103',
      date: d0,
      time: '14:30',
      clinicianLabel: 'Nurse Practitioner S. Lin',
      allowedTypes: ['Vaccination', 'Lab Check-in'],
      status: 'open',
    },
    {
      id: 'slot-104',
      date: d1,
      time: '09:00',
      clinicianLabel: 'Dr. L. Gomez',
      allowedTypes: ['Routine Visit', 'Follow-up', 'Medication Refill Review'],
      status: 'open',
    },
    {
      id: 'slot-105',
      date: d1,
      time: '10:30',
      clinicianLabel: 'Nurse Practitioner S. Lin',
      allowedTypes: ['Vaccination', 'Lab Check-in', 'Routine Visit'],
      status: 'open',
    },
    {
      id: 'slot-106',
      date: d1,
      time: '13:30',
      clinicianLabel: 'Dr. L. Gomez',
      allowedTypes: ['Follow-up', 'Medication Refill Review'],
      status: 'booked',
      booking: {
        bookingId: 'BK-2042',
        patientDisplayName: 'M. Chen (Demo)',
        contactMasked: 'mc***@example.demo',
        appointmentType: 'Follow-up',
        bookedAt: new Date(Date.now() - 1000 * 60 * 340).toISOString(),
      },
    },
    {
      id: 'slot-107',
      date: d1,
      time: '15:15',
      clinicianLabel: 'Nurse Practitioner S. Lin',
      allowedTypes: ['Vaccination', 'Routine Visit'],
      status: 'open',
    },
    {
      id: 'slot-108',
      date: d2,
      time: '09:15',
      clinicianLabel: 'Nurse Practitioner S. Lin',
      allowedTypes: ['Vaccination', 'Lab Check-in', 'Routine Visit'],
      status: 'open',
    },
    {
      id: 'slot-109',
      date: d2,
      time: '11:30',
      clinicianLabel: 'Dr. L. Gomez',
      allowedTypes: ['Routine Visit', 'Follow-up', 'Medication Refill Review'],
      status: 'open',
    },
    {
      id: 'slot-110',
      date: d2,
      time: '14:00',
      clinicianLabel: 'Dr. L. Gomez',
      allowedTypes: ['Follow-up', 'Routine Visit'],
      status: 'open',
    },
    {
      id: 'slot-111',
      date: d3,
      time: '10:00',
      clinicianLabel: 'Nurse Practitioner S. Lin',
      allowedTypes: ['Vaccination', 'Lab Check-in'],
      status: 'open',
    },
    {
      id: 'slot-112',
      date: d3,
      time: '15:00',
      clinicianLabel: 'Dr. L. Gomez',
      allowedTypes: ['Routine Visit', 'Follow-up', 'Medication Refill Review'],
      status: 'open',
    },
  ];

  const users: StoredUser[] = [
    {
      id: 'user-demo-staff',
      name: 'Maya Patel',
      email: 'clinic.staff@caresignal.demo',
      role: 'Clinic Manager',
      createdAt: nowIso,
      passwordHash: hashPassword('CareSignal2026!'),
    },
  ];

  const settings: ClinicSettings = {
    clinicName: 'Oakridge Community Clinic (Demo)',
    phone: '(555) 014-8920',
    email: 'frontdesk@caresignal.demo',
    address: '420 Meadowbrook Ave, Suite 100',
    hours: 'Mon–Fri 8:30 AM – 5:30 PM',
    requireStaffAuthForEdits: false,
  };

  return {
    medicines,
    inventoryLogs,
    appointmentSlots,
    users,
    settings,
  };
}

export function loadDatabase(): ClinicDatabase {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const seeded = createSeedDatabase();
    saveDatabase(seeded);
    return seeded;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ClinicDatabase;
    if (!Array.isArray(parsed.medicines) || !Array.isArray(parsed.appointmentSlots)) {
      throw new Error('Invalid DB structure');
    }
    return parsed;
  } catch {
    const seeded = createSeedDatabase();
    saveDatabase(seeded);
    return seeded;
  }
}

export function saveDatabase(db: ClinicDatabase): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempPath = `${DB_PATH}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tempPath, DB_PATH);
}

export function resetSeedDatabase(): ClinicDatabase {
  const seeded = createSeedDatabase();
  saveDatabase(seeded);
  return seeded;
}

import type {
  AppointmentSlot,
  AppointmentType,
  AssistantReplyPayload,
  ClinicSettings,
  TimeOfDayPreference,
} from './types';

export const APPOINTMENT_TYPES: AppointmentType[] = [
  'Routine Visit',
  'Follow-up',
  'Vaccination',
  'Lab Check-in',
  'Medication Refill Review',
];

const EMERGENCY_KEYWORDS = [
  'chest pain',
  'cant breathe',
  "can't breathe",
  'cannot breathe',
  'shortness of breath',
  'difficulty breathing',
  'severe bleeding',
  'bleeding heavily',
  'unconscious',
  'passed out',
  'overdose',
  'suicide',
  'self harm',
  'stroke',
  'seizure',
  'anaphylaxis',
  'heart attack',
];

const CLINICAL_KEYWORDS = [
  'diagnose',
  'diagnosis',
  'what do i have',
  'what illness',
  'prescribe',
  'prescription',
  'dosage',
  'how many mg',
  'should i take',
  'which medicine',
  'antibiotic',
  'treat my',
  'treatment for',
  'cure',
  'is this serious',
  'rash',
  'fever',
  'infection',
  'painkiller',
  'side effect',
];

export function detectClinicalOrEmergencyQuery(message: string): {
  flagged: boolean;
  category: 'emergency' | 'clinical' | null;
} {
  const normalized = message.toLowerCase().trim();
  if (!normalized) {
    return { flagged: false, category: null };
  }

  for (const kw of EMERGENCY_KEYWORDS) {
    if (normalized.includes(kw)) {
      return { flagged: true, category: 'emergency' };
    }
  }

  for (const kw of CLINICAL_KEYWORDS) {
    if (normalized.includes(kw)) {
      return { flagged: true, category: 'clinical' };
    }
  }

  return { flagged: false, category: null };
}

export function extractAppointmentTypeFromText(text: string): AppointmentType | null {
  const lower = text.toLowerCase();
  if (lower.includes('vaccin') || lower.includes('shot') || lower.includes('immuniz') || lower.includes('flu')) {
    return 'Vaccination';
  }
  if (lower.includes('follow-up') || lower.includes('follow up') || lower.includes('followup')) {
    return 'Follow-up';
  }
  if (lower.includes('lab') || lower.includes('blood draw') || lower.includes('check-in')) {
    return 'Lab Check-in';
  }
  if (lower.includes('refill') || lower.includes('medication review')) {
    return 'Medication Refill Review';
  }
  if (lower.includes('routine') || lower.includes('checkup') || lower.includes('check-up') || lower.includes('annual') || lower.includes('general')) {
    return 'Routine Visit';
  }
  return null;
}

export function extractTimeOfDayFromText(text: string): TimeOfDayPreference {
  const lower = text.toLowerCase();
  if (lower.includes('morning') || lower.includes('am') || lower.includes('early')) {
    return 'morning';
  }
  if (lower.includes('afternoon') || lower.includes('pm') || lower.includes('later')) {
    return 'afternoon';
  }
  return 'any';
}

export function extractIsoDateFromText(
  text: string,
  availableDates: string[]
): string | null {
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    return isoMatch[1];
  }
  const lower = text.toLowerCase();
  if (lower.includes('today') && availableDates.length > 0) {
    return availableDates[0];
  }
  if (lower.includes('tomorrow') && availableDates.length > 1) {
    return availableDates[1];
  }
  return null;
}

export function filterAvailableSlots(
  slots: AppointmentSlot[],
  criteria: {
    appointmentType?: AppointmentType | null;
    preferredDate?: string | null;
    preferredTimeOfDay?: TimeOfDayPreference;
  }
): AppointmentSlot[] {
  const open = slots.filter((slot) => slot.status === 'open');

  return open
    .filter((slot) => {
      if (
        criteria.appointmentType &&
        !slot.allowedTypes.includes(criteria.appointmentType)
      ) {
        return false;
      }
      if (criteria.preferredDate && slot.date !== criteria.preferredDate) {
        return false;
      }
      if (criteria.preferredTimeOfDay === 'morning') {
        const hour = Number(slot.time.split(':')[0]);
        if (hour >= 12) return false;
      }
      if (criteria.preferredTimeOfDay === 'afternoon') {
        const hour = Number(slot.time.split(':')[0]);
        if (hour < 12) return false;
      }
      return true;
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export function maskContact(contact: string): string {
  const trimmed = contact.trim();
  if (trimmed.includes('@')) {
    const [local, domain] = trimmed.split('@');
    const prefix = local.slice(0, 2);
    return `${prefix}***@${domain}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `***-***-${digits.slice(-4)}`;
  }
  return '***';
}

export interface BookingInputPayload {
  slotId: string;
  appointmentType: AppointmentType;
  patientName: string;
  contact: string;
}

export function validateBookingInput(
  input: Partial<BookingInputPayload>
): { valid: true; data: BookingInputPayload } | { valid: false; error: string } {
  const slotId = typeof input.slotId === 'string' ? input.slotId.trim() : '';
  const patientName =
    typeof input.patientName === 'string' ? input.patientName.trim() : '';
  const contact = typeof input.contact === 'string' ? input.contact.trim() : '';
  const appointmentType = input.appointmentType;

  if (!slotId) {
    return { valid: false, error: 'Please select an available appointment slot.' };
  }
  if (!appointmentType || !APPOINTMENT_TYPES.includes(appointmentType)) {
    return { valid: false, error: 'Please choose a valid non-diagnostic appointment type.' };
  }
  if (patientName.length < 2 || patientName.length > 80) {
    return { valid: false, error: 'Please enter a contact name (2–80 characters).' };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneDigits = contact.replace(/\D/g, '');
  if (!emailPattern.test(contact) && phoneDigits.length < 7) {
    return {
      valid: false,
      error: 'Please enter a valid phone number or email address for booking confirmation.',
    };
  }

  return {
    valid: true,
    data: {
      slotId,
      appointmentType,
      patientName,
      contact,
    },
  };
}

export function buildSafetyBoundaryReply(
  category: 'emergency' | 'clinical',
  clinic: ClinicSettings
): AssistantReplyPayload {
  if (category === 'emergency') {
    return {
      reply: `I cannot assess urgent symptoms or emergencies. If this is a medical emergency, please call 911 or go to your nearest emergency department immediately. For non-urgent clinic scheduling questions, contact ${clinic.clinicName} at ${clinic.phone}.`,
      mode: 'safety_boundary',
      suggestedType: null,
      preferredDate: null,
      preferredTimeOfDay: 'any',
      matchedSlots: [],
      needsStaffHelp: true,
      safetyFlag: 'emergency',
    };
  }

  return {
    reply: `I can only help with scheduling non-diagnostic appointments—I cannot evaluate symptoms, recommend medications, or give clinical advice. Please call ${clinic.clinicName} directly at ${clinic.phone} (${clinic.hours}) to speak with clinic staff, or choose a Routine Visit or Follow-up slot if you already know what visit type you need.`,
    mode: 'safety_boundary',
    suggestedType: null,
    preferredDate: null,
    preferredTimeOfDay: 'any',
    matchedSlots: [],
    needsStaffHelp: true,
    safetyFlag: 'clinical',
  };
}

export function deterministicAppointmentReply(
  message: string,
  allSlots: AppointmentSlot[],
  clinic: ClinicSettings,
  context?: {
    currentType?: AppointmentType | null;
    currentDate?: string | null;
    currentTimeOfDay?: TimeOfDayPreference;
  }
): AssistantReplyPayload {
  const safety = detectClinicalOrEmergencyQuery(message);
  if (safety.flagged && safety.category) {
    return buildSafetyBoundaryReply(safety.category, clinic);
  }

  const lower = message.toLowerCase();
  const openSlots = allSlots.filter((s) => s.status === 'open');
  const availableDates = Array.from(new Set(openSlots.map((s) => s.date))).sort();

  const suggestedType =
    extractAppointmentTypeFromText(message) ?? context?.currentType ?? null;
  const extractedTime = extractTimeOfDayFromText(message);
  const preferredTimeOfDay =
    extractedTime !== 'any' ? extractedTime : (context?.currentTimeOfDay ?? 'any');
  const preferredDate =
    extractIsoDateFromText(message, availableDates) ?? context?.currentDate ?? null;

  const unsure =
    lower.includes('not sure') ||
    lower.includes('unsure') ||
    lower.includes('help') ||
    lower.includes("don't know") ||
    lower.includes('talk to someone') ||
    lower.includes('staff');

  if (unsure && !suggestedType) {
    return {
      reply: `No problem—if you are unsure which visit type fits best, you can reach ${clinic.clinicName} staff directly at ${clinic.phone} or ${clinic.email} (${clinic.hours}). For standard scheduling here, you can pick Routine Visit, Follow-up, Vaccination, Lab Check-in, or Medication Refill Review.`,
      mode: 'deterministic_fallback',
      suggestedType: null,
      preferredDate,
      preferredTimeOfDay,
      matchedSlots: openSlots.slice(0, 4),
      needsStaffHelp: true,
      safetyFlag: null,
    };
  }

  let matched = filterAvailableSlots(openSlots, {
    appointmentType: suggestedType,
    preferredDate,
    preferredTimeOfDay,
  });

  let fallbackNote = '';
  if (matched.length === 0 && suggestedType) {
    matched = filterAvailableSlots(openSlots, {
      appointmentType: suggestedType,
      preferredTimeOfDay: 'any',
    });
    if (matched.length > 0) {
      fallbackNote =
        ' No slots matched that exact date/time filter, so here are the nearest open slots for that visit type.';
    }
  }

  if (matched.length === 0) {
    return {
      reply: `I couldn't find open slots matching those exact preferences right now. Please contact ${clinic.clinicName} at ${clinic.phone} for additional schedule assistance, or try another date or visit type.`,
      mode: 'deterministic_fallback',
      suggestedType,
      preferredDate,
      preferredTimeOfDay,
      matchedSlots: openSlots.slice(0, 4),
      needsStaffHelp: true,
      safetyFlag: null,
    };
  }

  const topSlots = matched.slice(0, 4);
  const typeLabel = suggestedType ?? 'open clinic';
  const timeLabel =
    preferredTimeOfDay !== 'any' ? ` (${preferredTimeOfDay})` : '';

  return {
    reply: `Here are ${topSlots.length} available ${typeLabel} slots${timeLabel} from our current clinic schedule.${fallbackNote} Select a slot below and enter your name and phone or email to submit your booking request.`,
    mode: 'deterministic_fallback',
    suggestedType,
    preferredDate,
    preferredTimeOfDay,
    matchedSlots: topSlots,
    needsStaffHelp: false,
    safetyFlag: null,
  };
}

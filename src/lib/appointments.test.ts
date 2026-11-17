import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectClinicalOrEmergencyQuery,
  deterministicAppointmentReply,
  filterAvailableSlots,
  maskContact,
  validateBookingInput,
} from './appointments';
import type { AppointmentSlot, ClinicSettings } from './types';

const CLINIC: ClinicSettings = {
  clinicName: 'Oakridge Community Clinic (Demo)',
  phone: '(555) 014-8920',
  email: 'frontdesk@caresignal.demo',
  address: '420 Meadowbrook Ave',
  hours: 'Mon-Fri 8:30 AM - 5:30 PM',
  requireStaffAuthForEdits: false,
};

const SLOTS: AppointmentSlot[] = [
  {
    id: 's1',
    date: '2026-11-17',
    time: '09:30',
    clinicianLabel: 'NP S. Lin',
    allowedTypes: ['Vaccination', 'Routine Visit'],
    status: 'open',
  },
  {
    id: 's2',
    date: '2026-11-17',
    time: '14:30',
    clinicianLabel: 'Dr. L. Gomez',
    allowedTypes: ['Follow-up', 'Routine Visit'],
    status: 'open',
  },
  {
    id: 's3',
    date: '2026-11-17',
    time: '11:00',
    clinicianLabel: 'Dr. L. Gomez',
    allowedTypes: ['Vaccination'],
    status: 'booked',
  },
];

test('detectClinicalOrEmergencyQuery flags emergency and diagnostic prompts', () => {
  assert.deepEqual(detectClinicalOrEmergencyQuery('I have chest pain and cannot breathe'), {
    flagged: true,
    category: 'emergency',
  });
  assert.deepEqual(detectClinicalOrEmergencyQuery('Can you diagnose my rash and fever?'), {
    flagged: true,
    category: 'clinical',
  });
  assert.deepEqual(detectClinicalOrEmergencyQuery('I need a flu vaccination tomorrow morning'), {
    flagged: false,
    category: null,
  });
});

test('filterAvailableSlots filters only open slots matching criteria', () => {
  const vaxMorning = filterAvailableSlots(SLOTS, {
    appointmentType: 'Vaccination',
    preferredTimeOfDay: 'morning',
  });
  assert.equal(vaxMorning.length, 1);
  assert.equal(vaxMorning[0].id, 's1');
});

test('deterministicAppointmentReply returns safety boundary for clinical questions', () => {
  const reply = deterministicAppointmentReply('What antibiotic dosage should I take?', SLOTS, CLINIC);
  assert.equal(reply.mode, 'safety_boundary');
  assert.equal(reply.safetyFlag, 'clinical');
  assert.equal(reply.matchedSlots.length, 0);
});

test('deterministicAppointmentReply matches real open vaccination slots', () => {
  const reply = deterministicAppointmentReply('I would like a vaccination tomorrow morning', SLOTS, CLINIC);
  assert.equal(reply.suggestedType, 'Vaccination');
  assert.equal(reply.matchedSlots.length, 1);
  assert.equal(reply.matchedSlots[0].id, 's1');
});

test('validateBookingInput enforces required fields and maskContact hides PII', () => {
  const invalid = validateBookingInput({ slotId: '', patientName: 'A', contact: 'bad' });
  assert.equal(invalid.valid, false);

  const valid = validateBookingInput({
    slotId: 's1',
    appointmentType: 'Vaccination',
    patientName: 'Jordan Taylor',
    contact: 'jordan.taylor@example.com',
  });
  assert.equal(valid.valid, true);
  assert.equal(maskContact('jordan.taylor@example.com'), 'jo***@example.com');
  assert.equal(maskContact('555-019-2834'), '***-***-2834');
});

import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, CheckCircle2, PhoneCall, Send, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { APPOINTMENT_TYPES, filterAvailableSlots } from '../lib/appointments';
import type { SavedAppointmentReceiptRecord } from '../lib/firestoreSync';
import type {
  AppointmentSlot,
  AppointmentType,
  AssistantStatusInfo,
  ClinicSettings,
  TimeOfDayPreference,
} from '../lib/types';
import { LiveVoicePanel } from './LiveVoicePanel';

interface ChatItem {
  id: string;
  sender: 'assistant' | 'patient';
  text: string;
  matchedSlots?: AppointmentSlot[];
  needsStaffHelp?: boolean;
  safetyFlag?: 'emergency' | 'clinical' | null;
}

interface AppointmentsViewProps {
  slots: AppointmentSlot[];
  clinic: ClinicSettings;
  assistantStatus: AssistantStatusInfo;
  loading: boolean;
  error: string | null;
  savedReceipts?: SavedAppointmentReceiptRecord[];
  onBookingSaved?: (receipt: {
    bookingId: string;
    appointmentType: AppointmentType;
    slotDate: string;
    slotTime: string;
    clinicianLabel: string;
  }) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function AppointmentsView({
  slots,
  clinic,
  assistantStatus,
  loading,
  error,
  savedReceipts = [],
  onBookingSaved,
  onRefresh,
}: AppointmentsViewProps) {
  const [subView, setSubView] = useState<'assistant' | 'staff'>('assistant');

  // Patient assistant state
  const [selectedType, setSelectedType] = useState<AppointmentType | ''>('');
  const [preferredDate, setPreferredDate] = useState<string>('');
  const [preferredTime, setPreferredTime] = useState<TimeOfDayPreference>('any');
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: 'Hello. I can help you pick a non-diagnostic visit type, check open clinic slots, and submit a booking request. Which type of appointment are you looking for?',
    },
  ]);

  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [patientName, setPatientName] = useState('');
  const [contact, setContact] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<{
    bookingId: string;
    slot: AppointmentSlot;
    appointmentType: AppointmentType;
  } | null>(null);

  // Staff slot creation state
  const openDates = Array.from(
    new Set(slots.filter((s) => s.status === 'open').map((s) => s.date))
  ).sort();
  const defaultNewDate = openDates[0] || new Date().toISOString().slice(0, 10);

  const [newSlotDate, setNewSlotDate] = useState(defaultNewDate);
  const [newSlotTime, setNewSlotTime] = useState('16:00');
  const [newSlotClinician, setNewSlotClinician] = useState('Dr. L. Gomez');
  const [newSlotTypes, setNewSlotTypes] = useState<AppointmentType[]>([
    'Routine Visit',
    'Follow-up',
  ]);
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  const liveFilteredSlots = filterAvailableSlots(slots, {
    appointmentType: selectedType || null,
    preferredDate: preferredDate || null,
    preferredTimeOfDay: preferredTime,
  });

  const selectedSlot = slots.find((s) => s.id === selectedSlotId && s.status === 'open') || null;

  async function sendAssistantMessage(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || chatBusy) return;

    setConfirmedBooking(null);
    setBookingError(null);

    const userMsg: ChatItem = {
      id: `u-${Date.now()}`,
      sender: 'patient',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatBusy(true);

    try {
      const response = await api.chatAssistant({
        message: trimmed,
        context: {
          currentType: selectedType || null,
          currentDate: preferredDate || null,
          currentTimeOfDay: preferredTime,
        },
      });

      if (response.suggestedType) {
        setSelectedType(response.suggestedType);
      }
      if (response.preferredDate) {
        setPreferredDate(response.preferredDate);
      }
      if (response.preferredTimeOfDay) {
        setPreferredTime(response.preferredTimeOfDay);
      }
      if (response.matchedSlots.length > 0 && !selectedSlotId) {
        setSelectedSlotId(response.matchedSlots[0].id);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'assistant',
          text: response.reply,
          matchedSlots: response.matchedSlots,
          needsStaffHelp: response.needsStaffHelp,
          safetyFlag: response.safetyFlag,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text:
            err instanceof Error
              ? err.message
              : `Unable to reach the assistant right now. You can select any open slot below or call ${clinic.phone}.`,
          needsStaffHelp: true,
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  async function handleChatSubmit(e: FormEvent) {
    e.preventDefault();
    await sendAssistantMessage(chatInput);
  }

  async function handleBookSubmit(e: FormEvent) {
    e.preventDefault();
    setBookingError(null);

    if (!selectedSlot) {
      setBookingError('Please choose an available slot from the schedule first.');
      return;
    }

    const effectiveType: AppointmentType =
      selectedType && selectedSlot.allowedTypes.includes(selectedType)
        ? selectedType
        : selectedSlot.allowedTypes[0];

    setBookingBusy(true);
    try {
      const result = await api.bookAppointment({
        slotId: selectedSlot.id,
        appointmentType: effectiveType,
        patientName,
        contact,
      });

      setConfirmedBooking({
        bookingId: result.bookingId,
        slot: result.slot,
        appointmentType: effectiveType,
      });
      await onBookingSaved?.({
        bookingId: result.bookingId,
        appointmentType: effectiveType,
        slotDate: result.slot.date,
        slotTime: result.slot.time,
        clinicianLabel: result.slot.clinicianLabel,
      });
      setSelectedSlotId('');
      setPatientName('');
      setContact('');
      await onRefresh();
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Unable to complete booking.');
    } finally {
      setBookingBusy(false);
    }
  }

  function toggleNewSlotType(type: AppointmentType) {
    setNewSlotTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  async function handleCreateSlot(e: FormEvent) {
    e.preventDefault();
    setStaffError(null);
    setStaffBusy(true);
    try {
      await api.createSlot({
        date: newSlotDate,
        time: newSlotTime,
        clinicianLabel: newSlotClinician,
        allowedTypes: newSlotTypes,
      });
      await onRefresh();
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : 'Unable to add slot.');
    } finally {
      setStaffBusy(false);
    }
  }

  async function handleDeleteSlot(id: string) {
    setStaffError(null);
    setStaffBusy(true);
    try {
      await api.deleteSlot(id);
      await onRefresh();
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : 'Unable to remove slot.');
    } finally {
      setStaffBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Mode switcher */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3.5 sm:flex-row sm:items-center">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setSubView('assistant')}
            className={`relative rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subView === 'assistant'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {subView === 'assistant' && (
              <motion.span
                layoutId="appointments-subview-bg"
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs"
                aria-hidden="true"
              />
            )}
            <span className="relative z-10">Patient Appointment Assistant</span>
          </button>
          <button
            type="button"
            onClick={() => setSubView('staff')}
            className={`relative rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subView === 'staff'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {subView === 'staff' && (
              <motion.span
                layoutId="appointments-subview-bg"
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs"
                aria-hidden="true"
              />
            )}
            <span className="relative z-10">Staff Schedule &amp; Slots</span>
          </button>
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400">
          {assistantStatus.openAiConfigured
            ? `Assistant engine: Server OpenAI (${assistantStatus.modelName})`
            : 'Assistant engine: Deterministic scheduling fallback (no OpenAI key)'}
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-xs text-red-800 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {subView === 'assistant' ? (
        <div className="space-y-6">
          <LiveVoicePanel />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 7 columns: Chat-style assistant */}
            <section className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 lg:col-span-7">
            <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Non-diagnostic appointment assistant
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                For scheduling routine visits, follow-ups, or vaccinations only. Do not enter
                sensitive clinical history. For emergencies, call 911.
              </p>
            </div>

            {/* Quick visit type starter buttons */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 px-5 py-3">
              {APPOINTMENT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedType(type);
                    void sendAssistantMessage(`I would like to schedule a ${type}`);
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    selectedType === type
                      ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/70 text-teal-900 dark:text-teal-200'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {type}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  void sendAssistantMessage("I'm not sure which visit type I need")
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Unsure? Ask staff
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" style={{ maxHeight: '420px' }}>
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className={`flex flex-col ${
                      msg.sender === 'patient' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[90%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.sender === 'patient'
                          ? 'bg-teal-700 text-white'
                          : msg.safetyFlag
                            ? 'border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-100'
                            : 'border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <p>{msg.text}</p>

                    {msg.matchedSlots && msg.matchedSlots.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-2.5">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          Matching open slots from clinic schedule:
                        </p>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {msg.matchedSlots.map((slot) => (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => setSelectedSlotId(slot.id)}
                              className={`rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                                selectedSlotId === slot.id
                                  ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/70 text-teal-950 dark:text-teal-100'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className="font-mono font-semibold tabular-nums">
                                {slot.date} · {slot.time}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                {slot.clinicianLabel}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.needsStaffHelp && (
                      <div className="mt-2.5 flex items-center gap-2 border-t border-slate-200/80 dark:border-slate-800 pt-2 text-xs text-slate-700 dark:text-slate-300">
                        <PhoneCall className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                        <span>
                          Clinic desk: {clinic.phone} · {clinic.hours}
                        </span>
                      </div>
                    )}
                  </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {chatBusy && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-slate-500 dark:text-slate-400"
                  aria-live="polite"
                >
                  Checking open clinic schedule...
                </motion.div>
              )}
            </div>

            {/* Chat input */}
            <form
              onSubmit={handleChatSubmit}
              className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 px-4 py-3"
            >
              <label htmlFor="assistant-chat-input" className="sr-only">
                Ask about appointment availability
              </label>
              <input
                id="assistant-chat-input"
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="e.g., Vaccination tomorrow morning or Routine visit..."
                maxLength={500}
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={chatBusy || !chatInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Send</span>
              </button>
            </form>
          </section>

          {/* Right 5 columns: App Schedule Selection & Booking Confirmation */}
          <section className="space-y-5 lg:col-span-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Available slots &amp; booking request
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Choose a slot directly from the live clinic schedule below.
              </p>

              {/* Preference Filters */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="filter-visit-type" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Visit type
                  </label>
                  <select
                    id="filter-visit-type"
                    value={selectedType}
                    onChange={(e) =>
                      setSelectedType(e.target.value as AppointmentType | '')
                    }
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">All types</option>
                    {APPOINTMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="filter-date" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Preferred date
                  </label>
                  <select
                    id="filter-date"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">Any date</option>
                    {openDates.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="filter-time" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Time of day
                  </label>
                  <select
                    id="filter-time"
                    value={preferredTime}
                    onChange={(e) =>
                      setPreferredTime(e.target.value as TimeOfDayPreference)
                    }
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    <option value="any">Any time</option>
                    <option value="morning">Morning (AM)</option>
                    <option value="afternoon">Afternoon (PM)</option>
                  </select>
                </div>
              </div>

              {/* Open Slots List */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  Open schedule slots ({liveFilteredSlots.length})
                </p>

                {loading && slots.length === 0 ? (
                  <div className="h-28 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                ) : liveFilteredSlots.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 py-5 text-center text-xs text-slate-600 dark:text-slate-400">
                    No open slots match those filters. Reset filters or call {clinic.phone}.
                  </div>
                ) : (
                  <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                    {liveFilteredSlots.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => {
                          setSelectedSlotId(slot.id);
                          setConfirmedBooking(null);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          selectedSlotId === slot.id
                            ? 'border-teal-700 bg-teal-50/80 dark:bg-teal-950/70'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div>
                          <div className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {slot.date} · {slot.time}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {slot.clinicianLabel} · {slot.allowedTypes.join(', ')}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-teal-700 dark:text-teal-400 whitespace-nowrap">
                          {selectedSlotId === slot.id ? 'Selected' : 'Select'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Minimal contact details form */}
              <form onSubmit={handleBookSubmit} className="mt-5 space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
                {bookingError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-xs text-red-800 dark:text-red-300"
                  >
                    {bookingError}
                  </div>
                )}

                <AnimatePresence>
                  {confirmedBooking && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      role="status"
                      className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/50 px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                        <span>
                          Booking saved · Reference {confirmedBooking.bookingId}
                        </span>
                      </div>
                      <p className="mt-1">
                        {confirmedBooking.appointmentType} on{' '}
                        <span className="font-mono tabular-nums">
                          {confirmedBooking.slot.date} at {confirmedBooking.slot.time}
                        </span>{' '}
                        with {confirmedBooking.slot.clinicianLabel}.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <label htmlFor="booking-name" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Contact name (demo booking)
                  </label>
                  <input
                    id="booking-name"
                    type="text"
                    required
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Jordan Taylor"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="booking-contact" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Phone or email (only for booking confirmation)
                  </label>
                  <input
                    id="booking-contact"
                    type="text"
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="jordan@example.demo or 555-019-2834"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={bookingBusy || !selectedSlot}
                  className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
                >
                  {bookingBusy
                    ? 'Saving booking...'
                    : selectedSlot
                      ? `Confirm ${selectedType || selectedSlot.allowedTypes[0]} on ${selectedSlot.date} at ${selectedSlot.time}`
                      : 'Select an open slot above to book'}
                </button>
              </form>
            </div>

            {savedReceipts.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Synced Booking Receipts
                </h3>
                <ul className="mt-3 space-y-2">
                  {savedReceipts.slice(0, 5).map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold text-slate-900 dark:text-slate-100">
                        <span>{r.appointmentType}</span>
                        <span className="font-mono text-[11px] text-teal-700 dark:text-teal-400">
                          {r.bookingId}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {r.slotDate} · {r.slotTime} · {r.clinicianLabel}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
        </div>
      ) : (
        /* Staff Schedule & Slots view */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 lg:col-span-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add open slot</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Publish available clinic slots for the Patient Appointment Assistant.
            </p>

            <form onSubmit={handleCreateSlot} className="mt-4 space-y-4">
              {staffError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-xs text-red-800 dark:text-red-300"
                >
                  {staffError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="slot-date" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Date
                  </label>
                  <input
                    id="slot-date"
                    type="date"
                    required
                    value={newSlotDate}
                    onChange={(e) => setNewSlotDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="slot-time" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Time
                  </label>
                  <input
                    id="slot-time"
                    type="time"
                    required
                    value={newSlotTime}
                    onChange={(e) => setNewSlotTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="slot-clinician" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Clinician / Provider
                </label>
                <input
                  id="slot-clinician"
                  type="text"
                  required
                  value={newSlotClinician}
                  onChange={(e) => setNewSlotClinician(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Allowed visit types
                </span>
                <div className="space-y-1.5">
                  {APPOINTMENT_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={newSlotTypes.includes(type)}
                        onChange={() => toggleNewSlotType(type)}
                        className="rounded border-slate-300 dark:border-slate-600 text-teal-700 focus:ring-teal-700"
                      />
                      <span>{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={staffBusy || newSlotTypes.length === 0}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                <span>{staffBusy ? 'Publishing...' : 'Publish open slot'}</span>
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 lg:col-span-8">
            <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Clinic appointment slots</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Review booked appointments (with masked patient contacts) and manage available time slots.
              </p>
            </div>

            {slots.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                No appointment slots scheduled. Add an open slot on the left.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
                      <th className="px-5 py-3">Date &amp; time</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Status &amp; booking</th>
                      <th className="px-5 py-3 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {slots.map((slot) => (
                      <tr key={slot.id} className="hover:bg-slate-50/90 dark:hover:bg-slate-800/50">
                        <td className="px-5 py-3 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100">
                          {slot.date} · {slot.time}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                            {slot.clinicianLabel}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {slot.allowedTypes.join(', ')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {slot.status === 'booked' && slot.booking ? (
                            <div>
                              <span className="font-semibold text-teal-800 dark:text-teal-400">
                                Booked ({slot.booking.bookingId})
                              </span>
                              <div className="text-slate-600 dark:text-slate-300">
                                {slot.booking.patientDisplayName} · {slot.booking.appointmentType} ·{' '}
                                {slot.booking.contactMasked}
                              </div>
                            </div>
                          ) : (
                            <span className="font-medium text-slate-600 dark:text-slate-400">Open slot</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            disabled={staffBusy}
                            onClick={() => handleDeleteSlot(slot.id)}
                            aria-label={`Remove slot on ${slot.date} at ${slot.time}`}
                            className="rounded border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/60 hover:text-red-700 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

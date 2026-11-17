import type { MapsGroundingResponse } from './mapsHelpers';
import type {
  AppointmentSlot,
  AppointmentType,
  AssistantReplyPayload,
  AssistantStatusInfo,
  AuthUser,
  ClinicSettings,
  InventoryLogEntry,
  MedicineWithPrediction,
  ModelStatusInfo,
  TimeOfDayPreference,
} from './types';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export interface DashboardPayload {
  summary: {
    medicinesTracked: number;
    highRiskCount: number;
    moderateRiskCount: number;
    upcomingAppointmentsCount: number;
    openSlotsCount: number;
  };
  medicines: MedicineWithPrediction[];
  recentLogs: InventoryLogEntry[];
  upcomingAppointments: AppointmentSlot[];
  modelStatus: ModelStatusInfo;
  assistantStatus: AssistantStatusInfo;
  settings: ClinicSettings;
}

export const api = {
  getMe: () => requestJson<{ user: AuthUser | null }>('/api/auth/me'),
  login: (payload: { email: string; password: string }) =>
    requestJson<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  signup: (payload: {
    name: string;
    email: string;
    password: string;
    role: AuthUser['role'];
  }) =>
    requestJson<{ user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () =>
    requestJson<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  getDashboard: () => requestJson<DashboardPayload>('/api/dashboard'),

  getInventory: () =>
    requestJson<{
      items: MedicineWithPrediction[];
      logs: InventoryLogEntry[];
      modelStatus: ModelStatusInfo;
    }>('/api/inventory'),

  createMedicine: (payload: {
    name: string;
    genericName: string;
    category: string;
    unit: string;
    currentStock: number;
    reorderThreshold: number;
    supplierLeadTimeDays: number;
    estimatedDailyUsage: number;
  }) =>
    requestJson<{ item: MedicineWithPrediction }>('/api/inventory', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMedicine: (
    id: string,
    payload: {
      name: string;
      genericName: string;
      category: string;
      unit: string;
      currentStock: number;
      reorderThreshold: number;
      supplierLeadTimeDays: number;
    }
  ) =>
    requestJson<{ item: MedicineWithPrediction }>(`/api/inventory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  adjustStock: (id: string, payload: { delta: number; reason: string }) =>
    requestJson<{ item: MedicineWithPrediction }>(`/api/inventory/${id}/adjust`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteMedicine: (id: string) =>
    requestJson<{ ok: boolean; removedId: string }>(`/api/inventory/${id}`, {
      method: 'DELETE',
    }),

  getAppointments: () =>
    requestJson<{
      slots: AppointmentSlot[];
      appointmentTypes: AppointmentType[];
      clinic: ClinicSettings;
      assistantStatus: AssistantStatusInfo;
    }>('/api/appointments'),

  createSlot: (payload: {
    date: string;
    time: string;
    clinicianLabel: string;
    allowedTypes: AppointmentType[];
  }) =>
    requestJson<{ slot: AppointmentSlot }>('/api/appointments/slots', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteSlot: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/appointments/slots/${id}`, {
      method: 'DELETE',
    }),

  bookAppointment: (payload: {
    slotId: string;
    appointmentType: AppointmentType;
    patientName: string;
    contact: string;
  }) =>
    requestJson<{ slot: AppointmentSlot; bookingId: string }>('/api/appointments/book', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  chatAssistant: (payload: {
    message: string;
    context?: {
      currentType?: AppointmentType | null;
      currentDate?: string | null;
      currentTimeOfDay?: TimeOfDayPreference;
    };
  }) =>
    requestJson<AssistantReplyPayload>('/api/assistant/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSettings: () =>
    requestJson<{
      settings: ClinicSettings;
      modelStatus: ModelStatusInfo;
      assistantStatus: AssistantStatusInfo;
    }>('/api/settings'),

  updateSettings: (payload: ClinicSettings) =>
    requestJson<{ settings: ClinicSettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  resetDemo: () =>
    requestJson<{ ok: boolean }>('/api/demo/reset', {
      method: 'POST',
    }),

  getMapsConfig: () =>
    requestJson<{ apiKeyConfigured: boolean; apiKey: string }>('/api/maps/config'),

  getGeminiStatus: () =>
    requestJson<{ configured: boolean }>('/api/gemini/status'),

  queryMapsGrounding: (payload: { query: string; lat?: number; lng?: number }) =>
    requestJson<MapsGroundingResponse>('/api/maps/grounding', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

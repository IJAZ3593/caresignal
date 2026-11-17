export type RiskLevel = 'high' | 'moderate' | 'low';

export type PredictionSource = 'scikit_learn_model' | 'rule_based_fallback';

export interface DailyUsagePoint {
  date: string; // YYYY-MM-DD
  unitsUsed: number;
}

export interface MedicineRecord {
  id: string;
  name: string;
  genericName: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderThreshold: number;
  supplierLeadTimeDays: number;
  dailyUsageHistory: DailyUsagePoint[];
  updatedAt: string;
}

export interface StockoutFactor {
  label: string;
  impact: 'increases_risk' | 'moderate_signal' | 'stabilizing';
  detail: string;
}

export interface StockoutPrediction {
  medicineId: string;
  recentDailyUsage: number;
  usageStdDev: number;
  usageCvPercent: number;
  estimatedDaysUntilStockout: number;
  suggestedReorderDate: string; // YYYY-MM-DD
  riskLevel: RiskLevel;
  predictionSource: PredictionSource;
  factors: StockoutFactor[];
  disclaimer: string;
}

export interface MedicineWithPrediction extends MedicineRecord {
  prediction: StockoutPrediction;
}

export interface InventoryLogEntry {
  id: string;
  medicineId: string;
  medicineName: string;
  changeDelta: number;
  previousStock: number;
  newStock: number;
  reason: string;
  actorName: string;
  createdAt: string;
}

export type AppointmentType =
  | 'Routine Visit'
  | 'Follow-up'
  | 'Vaccination'
  | 'Lab Check-in'
  | 'Medication Refill Review';

export type TimeOfDayPreference = 'morning' | 'afternoon' | 'any';

export interface AppointmentSlot {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  clinicianLabel: string;
  allowedTypes: AppointmentType[];
  status: 'open' | 'booked';
  booking?: {
    bookingId: string;
    patientDisplayName: string;
    contactMasked: string;
    appointmentType: AppointmentType;
    bookedAt: string;
  };
}

export interface ClinicSettings {
  clinicName: string;
  phone: string;
  email: string;
  address: string;
  hours: string;
  requireStaffAuthForEdits: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'Clinic Staff' | 'Clinic Manager';
  createdAt: string;
}

export interface ModelStatusInfo {
  activeSource: PredictionSource;
  sklearnAvailable: boolean;
  artifactPresent: boolean;
  artifactPath: string;
  syntheticDataLabel: string;
  lastTrainedAt: string | null;
  evaluationNote: string;
  baselineMaeDays: number | null;
  modelMaeDays: number | null;
}

export interface AssistantStatusInfo {
  openAiConfigured: boolean;
  mode: 'openai_server' | 'deterministic_fallback';
  modelName: string | null;
}

export interface AssistantReplyPayload {
  reply: string;
  mode: 'openai_server' | 'deterministic_fallback' | 'safety_boundary';
  suggestedType: AppointmentType | null;
  preferredDate: string | null;
  preferredTimeOfDay: TimeOfDayPreference;
  matchedSlots: AppointmentSlot[];
  needsStaffHelp: boolean;
  safetyFlag: 'emergency' | 'clinical' | null;
}

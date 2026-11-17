import type {
  DailyUsagePoint,
  MedicineRecord,
  RiskLevel,
  StockoutFactor,
  StockoutPrediction,
} from './types';

export const ESTIMATE_DISCLAIMER =
  'Forecasts are operational estimates for clinic staff review, not clinical or automated purchasing directives.';

export function addDaysIso(baseIsoDate: string, daysToAdd: number): string {
  const [year, month, day] = baseIsoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, Math.round(daysToAdd)));
  return dt.toISOString().slice(0, 10);
}

export function computeUsageStats(history: DailyUsagePoint[]): {
  recentAvg: number;
  priorAvg: number;
  stdDev: number;
  cvPercent: number;
} {
  if (!history.length) {
    return { recentAvg: 0, priorAvg: 0, stdDev: 0, cvPercent: 0 };
  }

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const recentWindow = sorted.slice(-7);
  const priorWindow = sorted.slice(-14, -7);

  const recentAvg =
    recentWindow.reduce((sum, item) => sum + Math.max(0, item.unitsUsed), 0) /
    recentWindow.length;

  const priorAvg =
    priorWindow.length > 0
      ? priorWindow.reduce((sum, item) => sum + Math.max(0, item.unitsUsed), 0) /
        priorWindow.length
      : recentAvg;

  const variance =
    recentWindow.reduce((sum, item) => {
      const diff = Math.max(0, item.unitsUsed) - recentAvg;
      return sum + diff * diff;
    }, 0) / recentWindow.length;

  const stdDev = Math.sqrt(variance);
  const cvPercent = recentAvg > 0 ? (stdDev / recentAvg) * 100 : 0;

  return {
    recentAvg: Number(recentAvg.toFixed(1)),
    priorAvg: Number(priorAvg.toFixed(1)),
    stdDev: Number(stdDev.toFixed(2)),
    cvPercent: Number(cvPercent.toFixed(1)),
  };
}

export function computeRuleBasedStockout(
  medicine: MedicineRecord,
  todayIso: string = new Date().toISOString().slice(0, 10)
): StockoutPrediction {
  const { recentAvg, priorAvg, stdDev, cvPercent } = computeUsageStats(
    medicine.dailyUsageHistory
  );

  // Add a modest volatility buffer to reflect clinic demand spikes when computing effective burn rate.
  const trendRatio = priorAvg > 0 ? recentAvg / priorAvg : 1;
  const trendAdjustment = trendRatio > 1.15 ? 1.08 : trendRatio < 0.85 ? 0.95 : 1.0;
  const effectiveDailyRate = Math.max(0.25, recentAvg * trendAdjustment + stdDev * 0.25);

  const rawDays =
    medicine.currentStock <= 0 ? 0 : medicine.currentStock / effectiveDailyRate;
  const estimatedDaysUntilStockout = Math.max(0, Math.round(rawDays * 10) / 10);

  const safetyBufferDays = Math.max(2, Math.round(medicine.supplierLeadTimeDays * 0.4));
  const reorderInDays = Math.max(
    0,
    Math.floor(estimatedDaysUntilStockout - medicine.supplierLeadTimeDays - safetyBufferDays)
  );
  const suggestedReorderDate = addDaysIso(todayIso, reorderInDays);

  let riskLevel: RiskLevel = 'low';
  if (
    medicine.currentStock <= medicine.reorderThreshold ||
    estimatedDaysUntilStockout <= medicine.supplierLeadTimeDays + 3
  ) {
    riskLevel = 'high';
  } else if (
    estimatedDaysUntilStockout <= medicine.supplierLeadTimeDays + 10 ||
    cvPercent >= 35
  ) {
    riskLevel = 'moderate';
  }

  const factors: StockoutFactor[] = [];

  if (medicine.currentStock <= medicine.reorderThreshold) {
    factors.push({
      label: 'Below reorder threshold',
      impact: 'increases_risk',
      detail: `${medicine.currentStock} ${medicine.unit} on hand is at or below the ${medicine.reorderThreshold} ${medicine.unit} threshold.`,
    });
  } else {
    factors.push({
      label: 'Current stock coverage',
      impact:
        estimatedDaysUntilStockout <= medicine.supplierLeadTimeDays + 5
          ? 'increases_risk'
          : 'stabilizing',
      detail: `${medicine.currentStock} ${medicine.unit} remaining at ~${recentAvg} ${medicine.unit}/day recent usage.`,
    });
  }

  if (medicine.supplierLeadTimeDays >= 6) {
    factors.push({
      label: 'Supplier lead time window',
      impact: 'moderate_signal',
      detail: `${medicine.supplierLeadTimeDays}-day delivery lead time requires earlier replenishment.`,
    });
  } else {
    factors.push({
      label: 'Supplier lead time window',
      impact: 'stabilizing',
      detail: `${medicine.supplierLeadTimeDays}-day delivery lead time leaves a manageable reorder buffer.`,
    });
  }

  if (cvPercent >= 30 || trendRatio >= 1.15) {
    factors.push({
      label: trendRatio >= 1.15 ? 'Rising 7-day demand' : 'High daily usage variation',
      impact: 'increases_risk',
      detail:
        trendRatio >= 1.15
          ? `7-day average (${recentAvg}/day) is above prior week (${priorAvg}/day).`
          : `Daily demand varies by ±${stdDev} ${medicine.unit} (${cvPercent}% CV).`,
    });
  } else {
    factors.push({
      label: 'Steady recent usage',
      impact: 'stabilizing',
      detail: `Low day-to-day variation (±${stdDev} ${medicine.unit}, ${cvPercent}% CV).`,
    });
  }

  return {
    medicineId: medicine.id,
    recentDailyUsage: recentAvg,
    usageStdDev: stdDev,
    usageCvPercent: cvPercent,
    estimatedDaysUntilStockout,
    suggestedReorderDate,
    riskLevel,
    predictionSource: 'rule_based_fallback',
    factors: factors.slice(0, 3),
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}

export interface MedicineInputPayload {
  name: string;
  genericName: string;
  category: string;
  unit: string;
  currentStock: number;
  reorderThreshold: number;
  supplierLeadTimeDays: number;
  estimatedDailyUsage?: number;
}

export function validateMedicineInput(
  input: Partial<MedicineInputPayload>
): { valid: true; data: MedicineInputPayload } | { valid: false; error: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const genericName =
    typeof input.genericName === 'string' ? input.genericName.trim() : '';
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  const unit = typeof input.unit === 'string' ? input.unit.trim() : '';
  const currentStock = Number(input.currentStock);
  const reorderThreshold = Number(input.reorderThreshold);
  const supplierLeadTimeDays = Number(input.supplierLeadTimeDays);
  const estimatedDailyUsage =
    input.estimatedDailyUsage !== undefined ? Number(input.estimatedDailyUsage) : 6;

  if (name.length < 2 || name.length > 80) {
    return { valid: false, error: 'Medicine name must be between 2 and 80 characters.' };
  }
  if (!unit || unit.length > 24) {
    return { valid: false, error: 'Unit (e.g., tablets, vials, inhalers) is required.' };
  }
  if (!Number.isFinite(currentStock) || currentStock < 0 || currentStock > 100000) {
    return { valid: false, error: 'Current stock must be a valid non-negative number.' };
  }
  if (!Number.isFinite(reorderThreshold) || reorderThreshold < 0 || reorderThreshold > 50000) {
    return { valid: false, error: 'Reorder threshold must be a valid non-negative number.' };
  }
  if (
    !Number.isFinite(supplierLeadTimeDays) ||
    supplierLeadTimeDays < 1 ||
    supplierLeadTimeDays > 90
  ) {
    return { valid: false, error: 'Supplier lead time must be between 1 and 90 days.' };
  }
  if (
    !Number.isFinite(estimatedDailyUsage) ||
    estimatedDailyUsage < 0 ||
    estimatedDailyUsage > 5000
  ) {
    return { valid: false, error: 'Estimated daily usage must be 0 or greater.' };
  }

  return {
    valid: true,
    data: {
      name,
      genericName: genericName || name,
      category: category || 'General Clinic Supply',
      unit,
      currentStock: Math.round(currentStock),
      reorderThreshold: Math.round(reorderThreshold),
      supplierLeadTimeDays: Math.round(supplierLeadTimeDays),
      estimatedDailyUsage: Number(estimatedDailyUsage.toFixed(1)),
    },
  };
}

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  MedicineRecord,
  MedicineWithPrediction,
  ModelStatusInfo,
  RiskLevel,
} from '../src/lib/types';
import {
  addDaysIso,
  computeRuleBasedStockout,
  computeUsageStats,
} from '../src/lib/stockout';

const execFileAsync = promisify(execFile);

const ARTIFACT_PATH = path.resolve(process.cwd(), 'ml/artifacts/stockout_model.joblib');
const METADATA_PATH = path.resolve(process.cwd(), 'ml/artifacts/model_metadata.json');
const PREDICT_SCRIPT = path.resolve(process.cwd(), 'ml/predict_stockout.py');

let cachedSklearnCheck: { checkedAt: number; available: boolean } | null = null;

async function isSklearnAvailable(): Promise<boolean> {
  if (cachedSklearnCheck && Date.now() - cachedSklearnCheck.checkedAt < 30_000) {
    return cachedSklearnCheck.available;
  }

  try {
    await execFileAsync('python3', ['-c', 'import sklearn, joblib, pandas, numpy'], {
      timeout: 3000,
    });
    cachedSklearnCheck = { checkedAt: Date.now(), available: true };
    return true;
  } catch {
    cachedSklearnCheck = { checkedAt: Date.now(), available: false };
    return false;
  }
}

export async function getModelStatus(): Promise<ModelStatusInfo> {
  const artifactPresent = fs.existsSync(ARTIFACT_PATH);
  const sklearnAvailable = await isSklearnAvailable();

  let lastTrainedAt: string | null = null;
  let baselineMaeDays: number | null = null;
  let modelMaeDays: number | null = null;

  if (fs.existsSync(METADATA_PATH)) {
    try {
      const meta = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8')) as {
        trained_at_utc?: string;
        baseline_recent_avg?: { mae_days?: number };
        gradient_boosting_model?: { mae_days?: number };
      };
      lastTrainedAt = meta.trained_at_utc ?? null;
      baselineMaeDays = meta.baseline_recent_avg?.mae_days ?? null;
      modelMaeDays = meta.gradient_boosting_model?.mae_days ?? null;
    } catch {
      // Ignore malformed metadata
    }
  }

  const activeSource =
    artifactPresent && sklearnAvailable ? 'scikit_learn_model' : 'rule_based_fallback';

  const evaluationNote =
    activeSource === 'scikit_learn_model'
      ? 'Local scikit-learn GradientBoostingRegressor artifact active. Trained on synthetic demo data—not validated clinical performance.'
      : 'Running transparent rule-based fallback because scikit-learn or the trained .joblib artifact is not present in this runtime. Run pip install -r ml/requirements.txt && python3 ml/train_stockout_model.py to activate local ML inference.';

  return {
    activeSource,
    sklearnAvailable,
    artifactPresent,
    artifactPath: 'ml/artifacts/stockout_model.joblib',
    syntheticDataLabel: 'SYNTHETIC_DEMO_ONLY (ml/data/synthetic_clinic_usage.csv)',
    lastTrainedAt,
    evaluationNote,
    baselineMaeDays,
    modelMaeDays,
  };
}

export async function scoreMedicines(
  medicines: MedicineRecord[]
): Promise<{ items: MedicineWithPrediction[]; modelStatus: ModelStatusInfo }> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const modelStatus = await getModelStatus();
  const basePredictions = medicines.map((med) => computeRuleBasedStockout(med, todayIso));

  if (modelStatus.activeSource === 'scikit_learn_model' && medicines.length > 0) {
    try {
      const dow = new Date().getUTCDay();
      const featuresPayload = medicines.map((med) => {
        const stats = computeUsageStats(med.dailyUsageHistory);
        const avg14 =
          med.dailyUsageHistory.length > 0
            ? med.dailyUsageHistory
                .slice(-14)
                .reduce((s, d) => s + Math.max(0, d.unitsUsed), 0) /
              Math.min(14, med.dailyUsageHistory.length)
            : stats.recentAvg;
        const cv = stats.recentAvg > 0 ? stats.stdDev / stats.recentAvg : 0;
        const trend = avg14 > 0 ? stats.recentAvg / avg14 : 1;

        return {
          current_stock: med.currentStock,
          rolling_7d_avg: stats.recentAvg,
          rolling_14d_avg: Number(avg14.toFixed(3)),
          usage_std_7d: stats.stdDev,
          usage_cv_7d: Number(cv.toFixed(4)),
          trend_7d_vs_14d: Number(trend.toFixed(4)),
          supplier_lead_time_days: med.supplierLeadTimeDays,
          day_of_week: (dow + 6) % 7,
        };
      });

      const { stdout } = await execFileAsync(
        'python3',
        [PREDICT_SCRIPT],
        {
          input: JSON.stringify(featuresPayload),
          timeout: 5000,
        } as unknown as Parameters<typeof execFileAsync>[2]
      );

      const parsed = JSON.parse(String(stdout)) as {
        ok?: boolean;
        predictions?: number[];
      };

      if (parsed.ok && Array.isArray(parsed.predictions) && parsed.predictions.length === medicines.length) {
        const items: MedicineWithPrediction[] = medicines.map((med, idx) => {
          const fallback = basePredictions[idx];
          const mlDays = Math.max(0, Number(parsed.predictions![idx].toFixed(1)));
          const safetyBuffer = Math.max(2, Math.round(med.supplierLeadTimeDays * 0.4));
          const reorderInDays = Math.max(
            0,
            Math.floor(mlDays - med.supplierLeadTimeDays - safetyBuffer)
          );
          let riskLevel: RiskLevel = 'low';
          if (
            med.currentStock <= med.reorderThreshold ||
            mlDays <= med.supplierLeadTimeDays + 3
          ) {
            riskLevel = 'high';
          } else if (
            mlDays <= med.supplierLeadTimeDays + 10 ||
            fallback.usageCvPercent >= 35
          ) {
            riskLevel = 'moderate';
          }

          return {
            ...med,
            prediction: {
              ...fallback,
              estimatedDaysUntilStockout: mlDays,
              suggestedReorderDate: addDaysIso(todayIso, reorderInDays),
              riskLevel,
              predictionSource: 'scikit_learn_model',
            },
          };
        });
        return { items, modelStatus };
      }
    } catch {
      // Fall back cleanly to rule-based scoring
    }
  }

  return {
    items: medicines.map((med, idx) => ({
      ...med,
      prediction: basePredictions[idx],
    })),
    modelStatus,
  };
}

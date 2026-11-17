import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Minus, Plus, X } from 'lucide-react';
import type { MedicineWithPrediction } from '../lib/types';
import { RiskBadge } from './RiskBadge';

interface MedicineDetailDrawerProps {
  medicine: MedicineWithPrediction | null;
  onClose: () => void;
  onAdjustStock: (medicineId: string, delta: number, reason: string) => Promise<void>;
}

export function MedicineDetailDrawer({
  medicine,
  onClose,
  onAdjustStock,
}: MedicineDetailDrawerProps) {
  const [deltaAmount, setDeltaAmount] = useState('20');
  const [mode, setMode] = useState<'dispense' | 'restock'>('dispense');
  const [reason, setReason] = useState('Daily outpatient dispensing');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = medicine?.dailyUsageHistory ?? [];
  const maxUsage = Math.max(1, ...history.map((d) => d.unitsUsed));

  async function handleAdjustSubmit(e: FormEvent) {
    e.preventDefault();
    if (!medicine) return;
    setError(null);
    const parsed = Math.abs(Number(deltaAmount));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive quantity.');
      return;
    }
    setSubmitting(true);
    try {
      const signedDelta = mode === 'dispense' ? -parsed : parsed;
      await onAdjustStock(
        medicine.id,
        signedDelta,
        reason.trim() || (mode === 'dispense' ? 'Outpatient dispensing' : 'Supplier restock')
      );
      setDeltaAmount('20');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stock adjustment failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {medicine && (
        <motion.div
          key="drawer-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 dark:bg-slate-950/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-med-title"
        >
          <motion.div
            key="drawer-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="flex h-full w-full max-w-xl flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl"
          >
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {medicine.category} · {medicine.genericName}
            </p>
            <h2 id="drawer-med-title" className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {medicine.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${medicine.name} details`}
            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 pt-5 pb-8">
          {/* Top summary metrics */}
          <div className="grid grid-cols-2 gap-4 border-b border-slate-200 dark:border-slate-800 pb-5 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Current stock</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {medicine.currentStock}{' '}
                <span className="font-sans text-xs font-normal text-slate-500 dark:text-slate-400">
                  {medicine.unit}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Recent daily usage</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {medicine.prediction.recentDailyUsage}{' '}
                <span className="font-sans text-xs font-normal text-slate-500 dark:text-slate-400">/day</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Est. days left</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {medicine.prediction.estimatedDaysUntilStockout}d
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Risk estimate</p>
              <div className="mt-1.5">
                <RiskBadge level={medicine.prediction.riskLevel} />
              </div>
            </div>
          </div>

          {/* 14-day usage history SVG bar chart */}
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                14-day daily usage history
              </h3>
              <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                Lead time: {medicine.supplierLeadTimeDays}d · Threshold: {medicine.reorderThreshold}
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4">
              <svg
                viewBox="0 0 420 120"
                className="h-32 w-full"
                role="img"
                aria-label={`Daily usage bar chart for ${medicine.name} over the last 14 days`}
              >
                {history.map((point, idx) => {
                  const barWidth = 20;
                  const gap = 9;
                  const x = 10 + idx * (barWidth + gap);
                  const barHeight = Math.max(4, Math.round((point.unitsUsed / maxUsage) * 86));
                  const y = 96 - barHeight;
                  const isRecent = idx >= history.length - 7;
                  return (
                    <g key={point.date}>
                      <motion.rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx={3}
                        fill={isRecent ? '#0d9488' : '#64748b'}
                        initial={{ scaleY: 0, opacity: 0.4 }}
                        animate={{ scaleY: 1, opacity: 1 }}
                        transition={{
                          duration: 0.24,
                          delay: idx * 0.018,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        style={{ transformOrigin: 'center bottom', transformBox: 'fill-box' }}
                      />
                      <title>{`${point.date}: ${point.unitsUsed} ${medicine.unit}`}</title>
                    </g>
                  );
                })}
                <line x1="8" y1="98" x2="412" y2="98" stroke="#64748b" strokeOpacity="0.4" strokeWidth="1" />
              </svg>
              <div className="mt-1 flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                <span>{history[0]?.date ?? ''}</span>
                <span>Teal = last 7 days</span>
                <span>{history[history.length - 1]?.date ?? ''}</span>
              </div>
            </div>
          </div>

          {/* Prediction factors & transparency */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Prediction factors</h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {medicine.prediction.predictionSource === 'scikit_learn_model'
                  ? 'Source: Local scikit-learn model'
                  : 'Source: Transparent rule-based fallback'}
              </span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40">
              {medicine.prediction.factors.map((factor) => (
                <div key={factor.label} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{factor.label}</span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {factor.impact === 'increases_risk'
                        ? 'Risk driver'
                        : factor.impact === 'moderate_signal'
                          ? 'Watch signal'
                          : 'Stabilizing'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{factor.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Suggested reorder date:{' '}
              <span className="font-mono font-medium tabular-nums text-slate-800 dark:text-slate-200">
                {medicine.prediction.suggestedReorderDate}
              </span>
              . {medicine.prediction.disclaimer}
            </p>
          </div>

          {/* Quick stock adjustment */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Record stock change</h3>
            <form onSubmit={handleAdjustSubmit} className="mt-3 space-y-3">
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-xs text-red-800 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('dispense');
                    setReason('Daily outpatient dispensing');
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === 'dispense'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Dispense / Deduct</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('restock');
                    setReason('Supplier replenishment delivery');
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === 'restock'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Restock / Receive</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="drawer-qty" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Quantity ({medicine.unit})
                  </label>
                  <input
                    id="drawer-qty"
                    type="number"
                    min={1}
                    required
                    value={deltaAmount}
                    onChange={(e) => setDeltaAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="drawer-reason" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Update note
                  </label>
                  <input
                    id="drawer-reason"
                    type="text"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors"
              >
                {submitting
                  ? 'Updating inventory...'
                  : mode === 'dispense'
                    ? `Deduct ${deltaAmount || 0} ${medicine.unit}`
                    : `Add ${deltaAmount || 0} ${medicine.unit}`}
              </button>
            </form>
          </div>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

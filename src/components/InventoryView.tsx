import { useState } from 'react';
import { motion } from 'motion/react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { MedicineWithPrediction, ModelStatusInfo, RiskLevel } from '../lib/types';
import { RiskBadge } from './RiskBadge';

interface InventoryViewProps {
  medicines: MedicineWithPrediction[];
  modelStatus: ModelStatusInfo | null;
  loading: boolean;
  error: string | null;
  onAddNew: () => void;
  onEdit: (medicine: MedicineWithPrediction) => void;
  onInspect: (medicine: MedicineWithPrediction) => void;
  onQuickAdjust: (medicineId: string, delta: number, reason: string) => Promise<void>;
  onDelete: (medicineId: string) => Promise<void>;
}

export function InventoryView({
  medicines,
  modelStatus,
  loading,
  error,
  onAddNew,
  onEdit,
  onInspect,
  onQuickAdjust,
  onDelete,
}: InventoryViewProps) {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | RiskLevel>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = medicines.filter((med) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      med.name.toLowerCase().includes(q) ||
      med.genericName.toLowerCase().includes(q) ||
      med.category.toLowerCase().includes(q);
    const matchesRisk = riskFilter === 'all' || med.prediction.riskLevel === riskFilter;
    return matchesSearch && matchesRisk;
  });

  async function handleQuickDelta(med: MedicineWithPrediction, delta: number, reason: string) {
    setBusyId(med.id);
    setActionError(null);
    try {
      await onQuickAdjust(med.id, delta, reason);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to adjust stock.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(med: MedicineWithPrediction) {
    setBusyId(med.id);
    setActionError(null);
    try {
      await onDelete(med.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete medicine.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search medicines"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine or category..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 py-2 pr-3 pl-9 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
            role="group"
            aria-label="Filter by stockout risk level"
          >
            {(['all', 'high', 'moderate', 'low'] as const).map((level) => {
              const active = riskFilter === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setRiskFilter(level)}
                  className={`relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="inventory-risk-filter-bg"
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 rounded-md bg-white dark:bg-slate-900 shadow-xs"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">
                    {level === 'all'
                      ? 'All'
                      : level === 'high'
                        ? 'High risk'
                        : level === 'moderate'
                          ? 'Moderate'
                          : 'Low risk'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onAddNew}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Add medicine</span>
        </motion.button>
      </div>

      {(error || actionError) && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-xs text-red-800 dark:text-red-300"
        >
          {error || actionError}
        </div>
      )}

      {/* Main table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-5 py-3.5">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Showing <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">{filtered.length}</span> of{' '}
            <span className="font-mono tabular-nums">{medicines.length}</span> tracked items · Stockout predictions are staff estimates only.
          </p>
          {modelStatus && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {modelStatus.activeSource === 'scikit_learn_model'
                ? 'Model: Local scikit-learn artifact'
                : 'Model: Transparent rule-based fallback'}
            </span>
          )}
        </div>

        {loading && medicines.length === 0 ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No matching inventory records</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Try clearing your search or filter, or add a new clinic medicine record.
            </p>
            <button
              type="button"
              onClick={onAddNew}
              className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
            >
              Add medicine
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <th className="px-5 py-3">Medicine</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Threshold</th>
                  <th className="px-4 py-3 text-right">Daily usage</th>
                  <th className="px-4 py-3 text-right">Est. days left</th>
                  <th className="px-4 py-3">Risk level</th>
                  <th className="px-4 py-3">Reorder by</th>
                  <th className="px-5 py-3 text-right">Quick stock &amp; actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((med) => {
                  const isBusy = busyId === med.id;
                  return (
                    <tr key={med.id} className="hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => onInspect(med)}
                          className="text-left font-medium text-slate-900 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-400 hover:underline"
                        >
                          {med.name}
                        </button>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {med.category} · Lead {med.supplierLeadTimeDays}d
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {med.currentStock}{' '}
                        <span className="font-sans font-normal text-slate-500 dark:text-slate-400">{med.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {med.reorderThreshold}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {med.prediction.recentDailyUsage}/day
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {med.prediction.estimatedDaysUntilStockout}d
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge level={med.prediction.riskLevel} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {med.prediction.suggestedReorderDate}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.94 }}
                            disabled={isBusy || med.currentStock === 0}
                            onClick={() =>
                              handleQuickDelta(med, -10, 'Quick outpatient dispensing (-10)')
                            }
                            aria-label={`Dispense 10 units of ${med.name}`}
                            className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1 font-mono text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                          >
                            -10
                          </motion.button>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.94 }}
                            disabled={isBusy}
                            onClick={() =>
                              handleQuickDelta(med, 50, 'Quick supplier restock (+50)')
                            }
                            aria-label={`Restock 50 units of ${med.name}`}
                            className="rounded border border-slate-200 dark:border-slate-700 px-2 py-1 font-mono text-xs text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/60 disabled:opacity-40 transition-colors"
                          >
                            +50
                          </motion.button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onEdit(med)}
                            aria-label={`Edit ${med.name}`}
                            className="rounded border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDelete(med)}
                            aria-label={`Delete ${med.name}`}
                            className="rounded border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/60 hover:text-red-700 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

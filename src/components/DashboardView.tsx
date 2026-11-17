import { motion } from 'motion/react';
import { ArrowRight, CalendarClock, PackageCheck, ShieldAlert } from 'lucide-react';
import type { DashboardPayload } from '../lib/api';
import type { MedicineWithPrediction } from '../lib/types';
import { RiskBadge } from './RiskBadge';

interface DashboardViewProps {
  data: DashboardPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectMedicine: (medicine: MedicineWithPrediction) => void;
  onNavigate: (tab: 'dashboard' | 'inventory' | 'appointments' | 'settings') => void;
}

export function DashboardView({
  data,
  loading,
  error,
  onRetry,
  onSelectMedicine,
  onNavigate,
}: DashboardViewProps) {
  if (loading && !data) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((k) => (
            <div key={k} className="h-28 animate-pulse rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 p-6 text-sm text-red-900 dark:text-red-200"
      >
        <p className="font-semibold">Unable to load clinic dashboard</p>
        <p className="mt-1 text-red-700 dark:text-red-300">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800"
        >
          Retry loading
        </button>
      </div>
    );
  }

  if (!data) return null;

  const sortedMedicines = [...data.medicines].sort((a, b) => {
    const rank = { high: 0, moderate: 1, low: 2 };
    const diff = rank[a.prediction.riskLevel] - rank[b.prediction.riskLevel];
    if (diff !== 0) return diff;
    return a.prediction.estimatedDaysUntilStockout - b.prediction.estimatedDaysUntilStockout;
  });

  return (
    <div className="space-y-6">
      {/* Prototype & Estimate Disclaimer Banner */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3.5 sm:flex-row sm:items-center">
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-slate-100">Prototype demo notice:</span> All records
          are fictional demo data. Stockout forecasts are operational estimates for staff review,
          not clinical or automated purchasing directives.
        </p>
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
          {data.modelStatus.activeSource === 'scikit_learn_model'
            ? 'Forecast engine: scikit-learn'
            : 'Forecast engine: Rule-based fallback'}
        </span>
      </div>

      {/* Summary Cards */}
      <section aria-label="Clinic summary metrics" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: 0.02, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Medicines tracked</span>
            <PackageCheck className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          </div>
          <p className="mt-3 font-mono text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {data.summary.medicinesTracked}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Active clinic formulary SKUs monitored
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>High stockout risks</span>
            <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
          </div>
          <p className="mt-3 font-mono text-3xl font-semibold tabular-nums text-red-700 dark:text-red-400">
            {data.summary.highRiskCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {data.summary.moderateRiskCount} additional items at moderate watch
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Upcoming appointments</span>
            <CalendarClock className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          </div>
          <p className="mt-3 font-mono text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {data.summary.upcomingAppointmentsCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {data.summary.openSlotsCount} open slots available for patient booking
          </p>
        </motion.div>
      </section>

      {/* Inventory Stockout Forecast Table */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Medicine stockout forecast (Staff estimate)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Select any medicine row to inspect 14-day usage trends, prediction factors, or record a stock change.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 whitespace-nowrap shrink-0"
          >
            <span>Manage inventory</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {sortedMedicines.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No medicines tracked yet</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Add your first clinic supply item in Inventory to generate stockout estimates.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
            >
              Go to Inventory
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <th className="px-5 py-3">Medicine</th>
                  <th className="px-4 py-3 text-right">Current stock</th>
                  <th className="px-4 py-3 text-right">Recent daily usage</th>
                  <th className="px-4 py-3 text-right">Est. days to stockout</th>
                  <th className="px-4 py-3">Risk level</th>
                  <th className="px-4 py-3">Suggested reorder</th>
                  <th className="px-5 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sortedMedicines.map((med) => (
                  <tr
                    key={med.id}
                    className="hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{med.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {med.category} · Lead {med.supplierLeadTimeDays}d
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100">
                      {med.currentStock}{' '}
                      <span className="font-sans text-slate-500 dark:text-slate-400">{med.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {med.prediction.recentDailyUsage}/day
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {med.prediction.estimatedDaysUntilStockout} days
                    </td>
                    <td className="px-4 py-3">
                      <RiskBadge level={med.prediction.riskLevel} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {med.prediction.suggestedReorderDate}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => onSelectMedicine(med)}
                        aria-label={`Inspect ${med.name} forecast`}
                        className="rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap transition-colors"
                      >
                        Inspect
                      </motion.button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bottom 2-column row: Recent inventory updates & Upcoming appointments */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Recent inventory updates</h2>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 whitespace-nowrap"
            >
              Adjust stock
            </button>
          </div>
          {data.recentLogs.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No inventory adjustments recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.recentLogs.slice(0, 5).map((log) => (
                <li key={log.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{log.medicineName}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {log.reason} · {log.actorName}
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs tabular-nums shrink-0">
                    <span
                      className={
                        log.changeDelta >= 0
                          ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                          : 'font-semibold text-slate-900 dark:text-slate-100'
                      }
                    >
                      {log.changeDelta >= 0 ? `+${log.changeDelta}` : log.changeDelta}
                    </span>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Stock: {log.newStock}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Upcoming appointments</h2>
            <button
              type="button"
              onClick={() => onNavigate('appointments')}
              className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 whitespace-nowrap"
            >
              Open schedule
            </button>
          </div>
          {data.upcomingAppointments.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No upcoming bookings yet. Open the Patient Assistant to test booking a slot.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.upcomingAppointments.slice(0, 5).map((slot) => (
                <li key={slot.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {slot.booking?.patientDisplayName ?? 'Booked Patient'} ·{' '}
                      {slot.booking?.appointmentType}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {slot.clinicianLabel} · {slot.booking?.contactMasked}
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                    <div>{slot.date}</div>
                    <div className="mt-0.5 text-slate-500 dark:text-slate-400">{slot.time}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Moon, RotateCcw, Sun } from 'lucide-react';
import type { AssistantStatusInfo, ClinicSettings, ModelStatusInfo } from '../lib/types';

interface SettingsViewProps {
  settings: ClinicSettings;
  modelStatus: ModelStatusInfo;
  assistantStatus: AssistantStatusInfo;
  theme: 'light' | 'dark';
  onThemeChange: (nextTheme: 'light' | 'dark') => void;
  onSaveSettings: (next: ClinicSettings) => Promise<void>;
  onResetDemo: () => Promise<void>;
}

export function SettingsView({
  settings,
  modelStatus,
  assistantStatus,
  theme,
  onThemeChange,
  onSaveSettings,
  onResetDemo,
}: SettingsViewProps) {
  const [form, setForm] = useState<ClinicSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      await onSaveSettings(form);
      setStatusMessage('Clinic settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setError(null);
    setStatusMessage(null);
    try {
      await onResetDemo();
      setStatusMessage('Demo inventory and appointment seed data restored.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset demo data.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Clinic configuration form */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 lg:col-span-7">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Clinic profile &amp; access controls
        </h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Contact details shown to patients when the Appointment Assistant escalates to clinic staff.
        </p>

        {/* Appearance / Theme Mode */}
        <div className="mt-5 flex flex-col justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 py-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Interface theme
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose light or dark surfaces across all clinic views.
            </p>
          </div>
          <div
            className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-1 shrink-0"
            role="group"
            aria-label="Interface theme mode"
          >
            <button
              type="button"
              onClick={() => onThemeChange('light')}
              className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                theme === 'light'
                  ? 'text-slate-900'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {theme === 'light' && (
                <motion.span
                  layoutId="settings-theme-active-bg"
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 rounded-md bg-white shadow-xs"
                  aria-hidden="true"
                />
              )}
              <Sun className="relative z-10 h-3.5 w-3.5" aria-hidden="true" />
              <span className="relative z-10">Light</span>
            </button>
            <button
              type="button"
              onClick={() => onThemeChange('dark')}
              className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                theme === 'dark'
                  ? 'text-slate-100'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {theme === 'dark' && (
                <motion.span
                  layoutId="settings-theme-active-bg"
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 rounded-md bg-slate-900 shadow-xs"
                  aria-hidden="true"
                />
              )}
              <Moon className="relative z-10 h-3.5 w-3.5" aria-hidden="true" />
              <span className="relative z-10">Dark</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <AnimatePresence>
            {statusMessage && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                role="status"
                className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/50 px-3.5 py-2.5 text-xs text-emerald-900 dark:text-emerald-300"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span>{statusMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="set-clinic-name" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Clinic name
              </label>
              <input
                id="set-clinic-name"
                type="text"
                required
                value={form.clinicName}
                onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-phone" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Front desk phone
              </label>
              <input
                id="set-phone"
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="set-email" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Contact email
              </label>
              <input
                id="set-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-hours" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Clinic hours
              </label>
              <input
                id="set-hours"
                type="text"
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="set-address" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Clinic address
            </label>
            <input
              id="set-address"
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.requireStaffAuthForEdits}
              onChange={(e) =>
                setForm({ ...form, requireStaffAuthForEdits: e.target.checked })
              }
              className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-teal-700 focus:ring-teal-700"
            />
            <span>
              <span className="block font-semibold text-slate-900 dark:text-slate-100">
                Require staff sign-in for inventory and schedule edits
              </span>
              When enabled, unauthenticated visitors can still view forecasts and book patient
              appointments, while staff changes require signing in.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{resetting ? 'Restoring...' : 'Restore demo seed data'}</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </form>
      </section>

      {/* ML & AI Integration Status + Privacy Notice */}
      <div className="space-y-6 lg:col-span-5">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Forecasting &amp; Assistant runtime status
          </h2>
          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-2">
              <dt className="text-slate-500 dark:text-slate-400">Stockout engine</dt>
              <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">
                {modelStatus.activeSource === 'scikit_learn_model'
                  ? 'Local scikit-learn (.joblib)'
                  : 'Rule-based fallback'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-2">
              <dt className="text-slate-500 dark:text-slate-400">Training dataset</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-300">SYNTHETIC_DEMO_ONLY</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-2">
              <dt className="text-slate-500 dark:text-slate-400">OpenAI appointment API</dt>
              <dd className="font-mono font-medium text-slate-900 dark:text-slate-100">
                {assistantStatus.openAiConfigured
                  ? `Configured (${assistantStatus.modelName})`
                  : 'Not configured (fallback active)'}
              </dd>
            </div>
            {modelStatus.modelMaeDays !== null && modelStatus.baselineMaeDays !== null && (
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                <dt className="text-slate-500 dark:text-slate-400">Synthetic eval MAE</dt>
                <dd className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  Model {modelStatus.modelMaeDays}d vs Baseline {modelStatus.baselineMaeDays}d
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {modelStatus.evaluationNote}
          </p>
          <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-900 dark:bg-slate-950 border border-slate-800 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-100">
            pip install -r ml/requirements.txt &amp;&amp; python3 ml/train_stockout_model.py
          </pre>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Privacy notice &amp; prototype boundaries
          </h2>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <li>
              • This hackathon prototype uses fictional demo inventory and sample appointment records
              only—do not enter real patient health records.
            </li>
            <li>
              • Patient bookings collect only a contact name and phone or email, and store masked
              contact summaries in the staff schedule.
            </li>
            <li>
              • The Appointment Assistant is strictly non-diagnostic and never evaluates symptoms,
              prescribes treatments, or invents schedule availability.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import type { MedicineWithPrediction } from '../lib/types';

interface MedicineFormModalProps {
  open: boolean;
  editingMedicine: MedicineWithPrediction | null;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    genericName: string;
    category: string;
    unit: string;
    currentStock: number;
    reorderThreshold: number;
    supplierLeadTimeDays: number;
    estimatedDailyUsage: number;
  }) => Promise<void>;
}

export function MedicineFormModal({
  open,
  editingMedicine,
  onClose,
  onSave,
}: MedicineFormModalProps) {
  const [name, setName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [category, setCategory] = useState('Oral Antibiotics');
  const [unit, setUnit] = useState('tablets');
  const [currentStock, setCurrentStock] = useState('120');
  const [reorderThreshold, setReorderThreshold] = useState('50');
  const [supplierLeadTimeDays, setSupplierLeadTimeDays] = useState('4');
  const [estimatedDailyUsage, setEstimatedDailyUsage] = useState('8');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingMedicine) {
      setName(editingMedicine.name);
      setGenericName(editingMedicine.genericName);
      setCategory(editingMedicine.category);
      setUnit(editingMedicine.unit);
      setCurrentStock(String(editingMedicine.currentStock));
      setReorderThreshold(String(editingMedicine.reorderThreshold));
      setSupplierLeadTimeDays(String(editingMedicine.supplierLeadTimeDays));
      setEstimatedDailyUsage(String(editingMedicine.prediction.recentDailyUsage));
    } else {
      setName('');
      setGenericName('');
      setCategory('Oral Antibiotics');
      setUnit('tablets');
      setCurrentStock('120');
      setReorderThreshold('50');
      setSupplierLeadTimeDays('4');
      setEstimatedDailyUsage('8');
    }
    setError(null);
  }, [editingMedicine, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSave({
        name,
        genericName,
        category,
        unit,
        currentStock: Number(currentStock),
        reorderThreshold: Number(reorderThreshold),
        supplierLeadTimeDays: Number(supplierLeadTimeDays),
        estimatedDailyUsage: Number(estimatedDailyUsage),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save medicine record.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="med-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="med-form-title"
        >
          <motion.div
            key="med-modal-panel"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg"
          >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <h2 id="med-form-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {editingMedicine ? `Edit ${editingMedicine.name}` : 'Add medicine record'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close medicine form"
            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="med-name" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Medicine name
              </label>
              <input
                id="med-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cefalexin 500mg"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="med-generic" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Generic name
              </label>
              <input
                id="med-generic"
                type="text"
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
                placeholder="Cephalexin"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="med-category" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Supply category
              </label>
              <input
                id="med-category"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Oral Antibiotics"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="med-unit" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Unit
              </label>
              <input
                id="med-unit"
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="capsules, tablets, doses"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="med-stock" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Current stock
              </label>
              <input
                id="med-stock"
                type="number"
                min={0}
                required
                value={currentStock}
                onChange={(e) => setCurrentStock(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="med-threshold" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Reorder threshold
              </label>
              <input
                id="med-threshold"
                type="number"
                min={0}
                required
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="med-lead" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Lead time (days)
              </label>
              <input
                id="med-lead"
                type="number"
                min={1}
                max={90}
                required
                value={supplierLeadTimeDays}
                onChange={(e) => setSupplierLeadTimeDays(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          {!editingMedicine && (
            <div>
              <label htmlFor="med-usage" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Baseline estimated daily usage ({unit || 'units'}/day)
              </label>
              <input
                id="med-usage"
                type="number"
                min={0}
                step="0.5"
                value={estimatedDailyUsage}
                onChange={(e) => setEstimatedDailyUsage(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : editingMedicine ? 'Save changes' : 'Add medicine'}
            </button>
          </div>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

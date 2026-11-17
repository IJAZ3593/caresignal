import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysIso,
  computeRuleBasedStockout,
  computeUsageStats,
  validateMedicineInput,
} from './stockout';
import type { MedicineRecord } from './types';

function makeMedicine(overrides: Partial<MedicineRecord> = {}): MedicineRecord {
  return {
    id: 'med-test',
    name: 'Amoxicillin 500mg',
    genericName: 'Amoxicillin',
    category: 'Oral Antibiotics',
    unit: 'capsules',
    currentStock: 100,
    reorderThreshold: 80,
    supplierLeadTimeDays: 5,
    dailyUsageHistory: [
      { date: '2026-11-10', unitsUsed: 10 },
      { date: '2026-11-11', unitsUsed: 12 },
      { date: '2026-11-12', unitsUsed: 8 },
      { date: '2026-11-13', unitsUsed: 10 },
      { date: '2026-11-14', unitsUsed: 10 },
      { date: '2026-11-15', unitsUsed: 10 },
      { date: '2026-11-16', unitsUsed: 10 },
    ],
    updatedAt: '2026-11-16T00:00:00.000Z',
    ...overrides,
  };
}

test('computeUsageStats computes 7-day average and non-negative stdDev', () => {
  const stats = computeUsageStats([
    { date: '2026-11-10', unitsUsed: 10 },
    { date: '2026-11-11', unitsUsed: 14 },
    { date: '2026-11-12', unitsUsed: 6 },
    { date: '2026-11-13', unitsUsed: 10 },
  ]);
  assert.equal(stats.recentAvg, 10);
  assert.ok(stats.stdDev > 2.5);
  assert.ok(stats.cvPercent > 25);
});

test('computeRuleBasedStockout flags high risk when stock is below threshold or lead time buffer', () => {
  const lowMed = makeMedicine({ currentStock: 40, reorderThreshold: 80 });
  const pred = computeRuleBasedStockout(lowMed, '2026-11-16');
  assert.equal(pred.riskLevel, 'high');
  assert.equal(pred.predictionSource, 'rule_based_fallback');
  assert.ok(pred.estimatedDaysUntilStockout < 5);
  assert.equal(pred.suggestedReorderDate, '2026-11-16');
  assert.ok(pred.factors.length >= 2);
});

test('computeRuleBasedStockout classifies healthy stock as low risk', () => {
  const healthyMed = makeMedicine({
    currentStock: 400,
    reorderThreshold: 80,
    supplierLeadTimeDays: 3,
  });
  const pred = computeRuleBasedStockout(healthyMed, '2026-11-16');
  assert.equal(pred.riskLevel, 'low');
  assert.ok(pred.estimatedDaysUntilStockout > 30);
  assert.equal(pred.suggestedReorderDate, addDaysIso('2026-11-16', Math.floor(pred.estimatedDaysUntilStockout - 3 - 2)));
});

test('validateMedicineInput rejects invalid values and accepts clean payload', () => {
  const bad = validateMedicineInput({ name: 'A', unit: '', currentStock: -5 });
  assert.equal(bad.valid, false);

  const good = validateMedicineInput({
    name: 'Cefalexin 500mg',
    genericName: 'Cefalexin',
    category: 'Oral Antibiotics',
    unit: 'capsules',
    currentStock: 120,
    reorderThreshold: 40,
    supplierLeadTimeDays: 4,
    estimatedDailyUsage: 8,
  });
  assert.equal(good.valid, true);
  if (good.valid) {
    assert.equal(good.data.name, 'Cefalexin 500mg');
    assert.equal(good.data.currentStock, 120);
  }
});

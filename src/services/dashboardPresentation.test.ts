import assert from 'node:assert/strict';
import test from 'node:test';
import * as dashboardModule from '../screens/DashboardScreen';

test('formats an unavailable fixation duration as not estimable', () => {
  const formatter = (dashboardModule as unknown as {
    formatEstimatedMilliseconds?: (value: number | null) => string;
  }).formatEstimatedMilliseconds;

  assert.equal(typeof formatter, 'function');
  assert.equal(formatter?.(null), 'não estimável');
  assert.equal(formatter?.(420), '420 ms');
});

test('preserves the complete device-aware group label in the selected badge', () => {
  const formatter = (dashboardModule as unknown as {
    formatOcularGroupSummary?: (label: string, count: number) => string;
  }).formatOcularGroupSummary;

  assert.equal(typeof formatter, 'function');
  assert.equal(
    formatter?.('Tablet · Retrato · ≥45 Hz · Calibrado', 2),
    'Tablet · Retrato · ≥45 Hz · Calibrado · 2 registros',
  );
});

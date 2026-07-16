import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSampleRateHz } from './sampleRatePresentation';

test('formatSampleRateHz keeps clean integers and one decimal for fractional evidence', () => {
  assert.equal(formatSampleRateHz(45), '45 Hz');
  assert.equal(formatSampleRateHz(44.5), '44.5 Hz');
  assert.equal(formatSampleRateHz(23.99), '24.0 Hz');
});

test('formatSampleRateHz uses the caller fallback for unavailable evidence', () => {
  for (const value of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(formatSampleRateHz(value, 'não medida'), 'não medida');
  }
});

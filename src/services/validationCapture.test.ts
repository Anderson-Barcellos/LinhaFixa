import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeAxisSignal, serializeValidationExport } from './validationCapture';
import { GazeSample, ValidationCapture } from '@/types';

test('summarizeAxisSignal returns zeroed dispersion for an empty signal', () => {
  const axis = summarizeAxisSignal([]);
  assert.deepEqual(axis, { hStd: 0, hRange: 0, vStd: 0, vRange: 0 });
});

test('summarizeAxisSignal separates a wide horizontal sweep from a steady vertical', () => {
  const samples: GazeSample[] = [
    { t: 0, h: 0.2, v: 0.5 },
    { t: 1, h: 0.8, v: 0.5 },
    { t: 2, h: 0.2, v: 0.5 },
    { t: 3, h: 0.8, v: 0.5 },
  ];
  const axis = summarizeAxisSignal(samples);

  assert.equal(axis.hRange, 0.6);
  assert.equal(axis.vRange, 0);
  assert.ok(axis.hStd > axis.vStd, 'horizontal dispersion should exceed vertical');
  assert.equal(axis.vStd, 0);
});

test('serializeValidationExport produces a self-describing, parseable payload', () => {
  const capture = { id: 'c1', timestamp: 10, samples: [] } as unknown as ValidationCapture;
  const json = serializeValidationExport([capture], 12345);
  const parsed = JSON.parse(json);

  assert.equal(parsed.app, 'linhafixa');
  assert.equal(parsed.kind, 'validation-captures');
  assert.equal(parsed.exportedAt, 12345);
  assert.equal(parsed.count, 1);
  assert.equal(parsed.captures[0].id, 'c1');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeAxisSignal, serializeValidationExport, selectCaptureSeries } from './validationCapture';
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

const sample = (t: number, h = 0.5, v = 0.5): GazeSample => ({ t, h, v });

test('selectCaptureSeries returns unavailable when both buffers are empty', () => {
  const sel = selectCaptureSeries([], []);
  assert.equal(sel.signalSource, 'unavailable');
  assert.deepEqual(sel.samples, []);
  assert.equal(sel.calibratedSampleCount, 0);
  assert.equal(sel.rawSampleCount, 0);
});

test('selectCaptureSeries uses the calibrated buffer when it is the only source', () => {
  const cal = [sample(0), sample(16)];
  const sel = selectCaptureSeries(cal, []);
  assert.equal(sel.signalSource, 'calibrated-mediapipe');
  assert.equal(sel.samples, cal);
});

test('selectCaptureSeries uses the raw buffer when it is the only source', () => {
  const raw = [sample(0), sample(16)];
  const sel = selectCaptureSeries([], raw);
  assert.equal(sel.signalSource, 'raw-mediapipe');
  assert.equal(sel.samples, raw);
});

test('selectCaptureSeries never mixes: a few calibrated samples do not label a mostly-raw capture', () => {
  const cal = [sample(0), sample(16), sample(32)];
  const raw = Array.from({ length: 900 }, (_, i) => sample(48 + i * 16));
  const sel = selectCaptureSeries(cal, raw);
  assert.equal(sel.signalSource, 'raw-mediapipe');
  assert.equal(sel.samples, raw);
  assert.equal(sel.calibratedSampleCount, 3);
  assert.equal(sel.rawSampleCount, 900);
});

test('selectCaptureSeries picks the calibrated majority and reports the dropped raw count', () => {
  const cal = Array.from({ length: 800 }, (_, i) => sample(i * 16));
  const raw = Array.from({ length: 100 }, (_, i) => sample(12800 + i * 16));
  const sel = selectCaptureSeries(cal, raw);
  assert.equal(sel.signalSource, 'calibrated-mediapipe');
  assert.equal(sel.samples, cal);
  assert.equal(sel.rawSampleCount, 100);
});

test('selectCaptureSeries breaks a tie in favor of the calibrated buffer', () => {
  const cal = [sample(0)];
  const raw = [sample(16)];
  const sel = selectCaptureSeries(cal, raw);
  assert.equal(sel.signalSource, 'calibrated-mediapipe');
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reprocessCapture, needsReprocessing, GAZE_ANALYZER_VERSION } from './captureReprocess';
import { analyzeSaccades } from '@/exercises/saccadeAnalysis';
import type { GazeSample, SaccadeMetrics, ValidationCapture } from '@/types';

const STEP_MS = 20;
const PLATEAU_MS = 240;

function plateau(t0: number, h: number, v = 0.5): GazeSample[] {
  const out: GazeSample[] = [];
  for (let t = 0; t <= PLATEAU_MS; t += STEP_MS) out.push({ t: t0 + t, h, v });
  return out;
}

const SAMPLES: GazeSample[] = [
  ...plateau(0, 0.20),
  ...plateau(260, 0.45),
  ...plateau(520, 0.70),
];

// A capture as persisted by the old velocity detector: no analyzerVersion, and
// metrics that do not match what the current analyser produces from the samples.
function legacyCapture(overrides: Partial<ValidationCapture> = {}): ValidationCapture {
  const staleMetrics = {
    trackingAvailable: true,
    samplesValid: SAMPLES.length,
    signalSource: 'calibrated-mediapipe',
    sampleRateHz: 50,
    saccadeCount: 99,
    regressionCount: 7,
    lineReturnCount: 3,
    meanSaccadeAmplitude: 0.123,
    meanFixationMs: 42,
  } as SaccadeMetrics;

  return {
    id: 'cap-1',
    timestamp: 1_700_000_000_000,
    conditions: {} as ValidationCapture['conditions'],
    coverage: 95,
    calibrated: true,
    metrics: staleMetrics,
    postural: {} as ValidationCapture['postural'],
    axis: {} as ValidationCapture['axis'],
    sampleCount: SAMPLES.length,
    samples: SAMPLES,
    ...overrides,
  };
}

test('uma captura legada precisa de reprocessamento', () => {
  assert.equal(needsReprocessing(legacyCapture()), true);
});

test('reprocessar recalcula as métricas a partir do sinal bruto', () => {
  const reprocessed = reprocessCapture(legacyCapture());
  const expected = analyzeSaccades(SAMPLES, { signalSource: 'calibrated-mediapipe' });

  assert.equal(reprocessed.metrics.saccadeCount, expected.saccadeCount);
  assert.equal(reprocessed.metrics.regressionCount, expected.regressionCount);
  assert.equal(reprocessed.metrics.meanFixationMs, expected.meanFixationMs);
  assert.notEqual(reprocessed.metrics.saccadeCount, 99); // não é mais o valor legado
});

test('reprocessar carimba a versão do analisador', () => {
  const reprocessed = reprocessCapture(legacyCapture());
  assert.equal(reprocessed.metrics.analyzerVersion, GAZE_ANALYZER_VERSION);
});

test('reprocessar preserva as métricas originais em legacyMetrics', () => {
  const reprocessed = reprocessCapture(legacyCapture());
  assert.ok(reprocessed.legacyMetrics);
  assert.equal(reprocessed.legacyMetrics.saccadeCount, 99);
  assert.equal(reprocessed.legacyMetrics.meanFixationMs, 42);
});

test('a fonte do sinal original é preservada no recálculo', () => {
  const raw = legacyCapture();
  raw.metrics = { ...raw.metrics, signalSource: 'raw-mediapipe' };
  const reprocessed = reprocessCapture(raw);
  assert.equal(reprocessed.metrics.signalSource, 'raw-mediapipe');
});

test('reprocessar é idempotente: a segunda passada não muda nada nem re-arquiva', () => {
  const once = reprocessCapture(legacyCapture());
  const twice = reprocessCapture(once);

  assert.deepEqual(twice, once);
  // legacyMetrics continua sendo o ORIGINAL, nunca a versão já reprocessada.
  assert.equal(twice.legacyMetrics?.saccadeCount, 99);
  assert.equal(needsReprocessing(once), false);
});

test('captura sem sinal bruto não é reprocessável e fica intacta', () => {
  const noSamples = legacyCapture({ samples: [] });
  assert.equal(needsReprocessing(noSamples), false);
  assert.deepEqual(reprocessCapture(noSamples), noSamples);
});

test('captura sem o campo samples (legado antigo) fica intacta', () => {
  const capture = legacyCapture();
  delete (capture as Partial<ValidationCapture>).samples;
  assert.equal(needsReprocessing(capture), false);
  assert.deepEqual(reprocessCapture(capture), capture);
});

test('reprocessar não toca em nenhum outro campo da captura', () => {
  const original = legacyCapture({
    distanceEstimatedCm: 47,
    pxPerDegAtCapture: 31.2,
    orientation: 'landscape',
  });
  const reprocessed = reprocessCapture(original);

  assert.equal(reprocessed.id, original.id);
  assert.equal(reprocessed.timestamp, original.timestamp);
  assert.equal(reprocessed.coverage, original.coverage);
  assert.equal(reprocessed.distanceEstimatedCm, 47);
  assert.equal(reprocessed.pxPerDegAtCapture, 31.2);
  assert.equal(reprocessed.orientation, 'landscape');
  assert.deepEqual(reprocessed.samples, original.samples); // sinal bruto intocado
});

test('uma captura já na versão corrente não precisa de reprocessamento', () => {
  const current = legacyCapture();
  current.metrics = { ...current.metrics, analyzerVersion: GAZE_ANALYZER_VERSION };
  assert.equal(needsReprocessing(current), false);
});

test('reprocessamento v3 usa a geometria persistida (thresholdSource angular)', () => {
  const capture = legacyCapture({ pxPerDegAtCapture: 40, canvasWidthPx: 800 });
  const reprocessed = reprocessCapture(capture);
  assert.equal(reprocessed.metrics.analyzerVersion, GAZE_ANALYZER_VERSION);
  assert.equal(reprocessed.metrics.thresholdSource, 'angular');
  // legacyCapture() has no analyzerVersion at all (pre-versioning), so this just
  // confirms the preserved snapshot never picks up the new stamp.
  assert.notEqual(reprocessed.legacyMetrics?.analyzerVersion, GAZE_ANALYZER_VERSION);
});

test('captura legada sem geometria reprocessa como relative-fallback carimbado', () => {
  const capture = legacyCapture();
  const reprocessed = reprocessCapture(capture);
  assert.equal(reprocessed.metrics.analyzerVersion, GAZE_ANALYZER_VERSION);
  assert.equal(reprocessed.metrics.thresholdSource, 'relative-fallback');
});

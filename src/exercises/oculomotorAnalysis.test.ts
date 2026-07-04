import assert from 'node:assert/strict';
import test from 'node:test';
import { OcSample, analyzeFixation, analyzeSaccadeTask, analyzePursuit } from './oculomotorAnalysis';

const PX_PER_DEG = 40;
const DT = 20; // 50Hz synthetic sampling for tight latency resolution
const CENTER = { x: 400, y: 300 };

function fixationRun(gazeAt: (t: number) => { x: number; y: number } | null, durationMs = 2000): OcSample[] {
  const samples: OcSample[] = [];
  for (let t = 0; t <= durationMs; t += DT) {
    samples.push({ t, gaze: gazeAt(t), target: CENTER });
  }
  return samples;
}

// Target holds A, jumps to B at each boundary; gaze repeats the same schedule
// shifted by latencyMs. Boundaries land exactly on the DT grid.
function saccadeRun(positions: { x: number; y: number }[], boundaryMs: number, latencyMs: number): OcSample[] {
  const durationMs = positions.length * boundaryMs;
  const at = (t: number) => positions[Math.min(positions.length - 1, Math.floor(t / boundaryMs))];
  const samples: OcSample[] = [];
  for (let t = 0; t <= durationMs; t += DT) {
    samples.push({ t, gaze: at(Math.max(0, t - latencyMs)), target: at(t) });
  }
  return samples;
}

// --- analyzeFixation ---

test('analyzeFixation reports a rock-steady gaze as fully on target', () => {
  const metrics = analyzeFixation(fixationRun(() => ({ ...CENTER })), CENTER, PX_PER_DEG);

  assert.equal(metrics.trackingAvailable, true);
  assert.equal(metrics.meanDispersionDeg, 0);
  assert.equal(metrics.rmsDispersionDeg, 0);
  assert.equal(metrics.percentWithinThreshold, 100);
  assert.equal(metrics.fixationBreaks, 0);
});

test('analyzeFixation measures a constant angular offset and counts it off target', () => {
  // 3° to the right of center — beyond the 2° threshold on every sample.
  const offset = { x: CENTER.x + 3 * PX_PER_DEG, y: CENTER.y };
  const metrics = analyzeFixation(fixationRun(() => ({ ...offset })), CENTER, PX_PER_DEG);

  assert.equal(metrics.trackingAvailable, true);
  assert.ok(Math.abs(metrics.meanDispersionDeg - 3) < 1e-9);
  assert.equal(metrics.percentWithinThreshold, 0);
});

test('analyzeFixation counts each excursion beyond threshold as one break', () => {
  // On target except for two separate 100ms excursions to 4°.
  const away = { x: CENTER.x + 4 * PX_PER_DEG, y: CENTER.y };
  const excursion = (t: number) => (t >= 500 && t < 600) || (t >= 1200 && t < 1300);
  const metrics = analyzeFixation(fixationRun(t => (excursion(t) ? { ...away } : { ...CENTER })), CENTER, PX_PER_DEG);

  assert.equal(metrics.fixationBreaks, 2);
  assert.ok(metrics.percentWithinThreshold > 80);
});

test('analyzeFixation refuses to report with too few valid samples', () => {
  const metrics = analyzeFixation(fixationRun(t => (t < 80 ? { ...CENTER } : null)), CENTER, PX_PER_DEG);

  assert.equal(metrics.trackingAvailable, false);
  assert.equal(metrics.samplesValid, 4);
});

// --- analyzeSaccadeTask ---

const A = { x: 200, y: 300 };
const B = { x: 600, y: 300 };

test('analyzeSaccadeTask recovers a known latency, perfect landing and unit gain', () => {
  const metrics = analyzeSaccadeTask(saccadeRun([A, B], 1000, 200), PX_PER_DEG);

  assert.equal(metrics.trackingAvailable, true);
  assert.equal(metrics.validSaccades, 1);
  assert.equal(metrics.validLatencyCount, 1);
  assert.equal(metrics.meanLatencyMs, 200);
  assert.ok(metrics.meanAccuracyDeg < 0.1);
  assert.ok(Math.abs(metrics.meanGain - 1) < 0.05);
});

test('analyzeSaccadeTask averages latencies across jumps', () => {
  // Same 240ms latency on both jumps; two windows must both contribute.
  const metrics = analyzeSaccadeTask(saccadeRun([A, B, A], 1000, 240), PX_PER_DEG);

  assert.equal(metrics.validSaccades, 2);
  assert.equal(metrics.validLatencyCount, 2);
  assert.equal(metrics.meanLatencyMs, 240);
});

test('analyzeSaccadeTask measures hypometric landing as gain below 1 and angular error', () => {
  // Gaze responds at 200ms but lands only halfway toward B.
  const half = { x: (A.x + B.x) / 2, y: A.y };
  const samples = saccadeRun([A, B], 1000, 200).map(s => ({
    ...s,
    gaze: s.gaze && s.gaze.x === B.x ? { ...half } : s.gaze,
  }));
  const metrics = analyzeSaccadeTask(samples, PX_PER_DEG);

  assert.equal(metrics.validSaccades, 1);
  assert.ok(Math.abs(metrics.meanGain - 0.5) < 0.05);
  // Landing error: half the 400px amplitude = 200px = 5° at 40 px/deg.
  assert.ok(Math.abs(metrics.meanAccuracyDeg - 5) < 0.25);
});

test('analyzeSaccadeTask reports null latency — not 0ms — when no latency is physiologically valid', () => {
  // Gaze follows at 40ms, below the 60ms plausibility floor: the landing is
  // usable (accuracy/gain) but no latency survives the window. A mean of an
  // empty list must surface as "no measurement", never as a perfect 0ms.
  const metrics = analyzeSaccadeTask(saccadeRun([A, B], 1000, 40), PX_PER_DEG);

  assert.equal(metrics.trackingAvailable, true);
  assert.equal(metrics.validSaccades, 1);
  assert.equal(metrics.validLatencyCount, 0);
  assert.equal(metrics.meanLatencyMs, null);
});

test('analyzeSaccadeTask stays unavailable without enough valid samples', () => {
  const metrics = analyzeSaccadeTask(saccadeRun([A, B], 1000, 200).map(s => ({ ...s, gaze: null })), PX_PER_DEG);

  assert.equal(metrics.trackingAvailable, false);
  assert.equal(metrics.validSaccades, 0);
  assert.equal(metrics.meanLatencyMs, null);
  assert.equal(metrics.validLatencyCount, 0);
});

// --- analyzePursuit ---

function pursuitRun(gazeAmplitudePx: number, targetAmplitudePx = 100, durationMs = 4000): OcSample[] {
  const samples: OcSample[] = [];
  for (let t = 0; t <= durationMs; t += DT) {
    const phase = Math.sin((2 * Math.PI * t) / 2000);
    samples.push({
      t,
      gaze: { x: CENTER.x + gazeAmplitudePx * phase, y: CENTER.y },
      target: { x: CENTER.x + targetAmplitudePx * phase, y: CENTER.y },
    });
  }
  return samples;
}

test('analyzePursuit reports unit gain and zero error for perfect tracking', () => {
  const metrics = analyzePursuit(pursuitRun(100), PX_PER_DEG);

  assert.equal(metrics.trackingAvailable, true);
  assert.ok(Math.abs(metrics.gain - 1) < 1e-9);
  assert.equal(metrics.rmsErrorDeg, 0);
  assert.equal(metrics.percentOnTarget, 100);
});

test('analyzePursuit reports reduced gain when gaze undershoots the target sweep', () => {
  const metrics = analyzePursuit(pursuitRun(50), PX_PER_DEG);

  assert.ok(Math.abs(metrics.gain - 0.5) < 0.02);
  assert.ok(metrics.rmsErrorDeg > 0);
});

test('analyzePursuit refuses to report with too few valid samples', () => {
  const metrics = analyzePursuit(pursuitRun(100, 100, 100), PX_PER_DEG);

  assert.equal(metrics.trackingAvailable, false);
});

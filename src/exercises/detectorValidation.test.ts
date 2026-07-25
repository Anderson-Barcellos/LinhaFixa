import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ocSamplesToGazeSamples,
  extractTargetJumps,
  validateSaccadeDetector,
} from './detectorValidation';
import { OcSample } from './oculomotorAnalysis';

const WIDTH = 1000;
const HEIGHT = 600;
const DT = 40; // 25Hz synthetic sampling
const LEFT_X = 300;
const RIGHT_X = 700;

// Target alternates sides every 1500ms starting at t=1500 (mirrors the saccade
// exercise). Returns the target x for a given time.
function targetX(t: number): number {
  const phase = Math.floor(t / 1500);
  return phase % 2 === 0 ? LEFT_X : RIGHT_X;
}

// Gaze follows the target with a fixed response latency.
function buildFollowingRun(durationMs: number, gazeLatencyMs: number): OcSample[] {
  const samples: OcSample[] = [];
  for (let t = 0; t < durationMs; t += DT) {
    samples.push({
      t,
      gaze: { x: targetX(Math.max(0, t - gazeLatencyMs)), y: HEIGHT / 2 },
      target: { x: targetX(t), y: HEIGHT / 2 },
    });
  }
  return samples;
}

test('ocSamplesToGazeSamples normalizes canvas gaze and drops samples without gaze', () => {
  const samples: OcSample[] = [
    { t: 0, gaze: { x: 250, y: 300 }, target: { x: 500, y: 300 } },
    { t: 40, gaze: null, target: { x: 500, y: 300 } },
    { t: 80, gaze: { x: 750, y: 150 }, target: { x: 500, y: 300 } },
  ];

  const gaze = ocSamplesToGazeSamples(samples, WIDTH, HEIGHT);

  assert.equal(gaze.length, 2);
  assert.deepEqual(gaze[0], { t: 0, h: 0.25, v: 0.5 });
  assert.deepEqual(gaze[1], { t: 80, h: 0.75, v: 0.25 });
});

test('extractTargetJumps finds every side switch with signed normalized amplitude', () => {
  const samples = buildFollowingRun(6000, 160);
  const jumps = extractTargetJumps(samples, WIDTH);

  assert.equal(jumps.length, 3); // t=1520, 3000, 4520 grid-aligned switches
  assert.ok(Math.abs(jumps[0].dhNorm - 0.4) < 1e-9);
  assert.ok(Math.abs(jumps[1].dhNorm + 0.4) < 1e-9);
  assert.ok(Math.abs(jumps[2].dhNorm - 0.4) < 1e-9);
});

test('validateSaccadeDetector matches every jump on a clean following run', () => {
  const samples = buildFollowingRun(6000, 160);
  const metrics = validateSaccadeDetector(samples, WIDTH, HEIGHT);

  assert.equal(metrics.trackingAvailable, true);
  assert.equal(metrics.targetJumps, 3);
  assert.equal(metrics.matchedJumps, 3);
  assert.equal(metrics.detectionRate, 1);
  assert.equal(metrics.falsePositives, 0);
  assert.equal(metrics.falsePositivesPerMin, 0);
  // Gaze steps one DT after (t - 160) crosses the switch; detector tStart is the
  // sample before the step, so latency lands within [gazeLatency - DT, gazeLatency + DT].
  assert.ok(metrics.medianLatencyMs !== null);
  assert.ok(metrics.meanAmplitudeGain !== null);
  assert.ok(metrics.medianLatencyMs >= 160 - DT && metrics.medianLatencyMs <= 160 + DT,
    `median latency ${metrics.medianLatencyMs} outside expected window`);
  assert.ok(Math.abs(metrics.meanAmplitudeGain - 1) < 0.05);
});

test('validateSaccadeDetector reports zero detection when gaze never responds', () => {
  const samples: OcSample[] = [];
  for (let t = 0; t < 6000; t += DT) {
    samples.push({
      t,
      gaze: { x: WIDTH / 2, y: HEIGHT / 2 },
      target: { x: targetX(t), y: HEIGHT / 2 },
    });
  }

  const metrics = validateSaccadeDetector(samples, WIDTH, HEIGHT);

  assert.equal(metrics.trackingAvailable, true);
  assert.equal(metrics.targetJumps, 3);
  assert.equal(metrics.matchedJumps, 0);
  assert.equal(metrics.detectionRate, 0);
  assert.equal(metrics.falsePositives, 0);
  assert.equal(metrics.medianLatencyMs, null);
  assert.equal(metrics.latencyIqrMs, null);
  assert.equal(metrics.meanAmplitudeGain, null);
});

test('validateSaccadeDetector counts spurious gaze movement as false positives', () => {
  const samples = buildFollowingRun(6000, 160);
  // Inject a spurious flick between jumps: gaze darts +100px and back around
  // t=2200. The detour must last long enough to read as a rest of its own
  // (>= the 100ms minimum fixation), otherwise it is the eye passing through
  // rather than landing, and the fixation-first detector correctly ignores it.
  // At 25Hz that means six samples, not three.
  for (const s of samples) {
    if (s.gaze && s.t >= 2200 && s.t < 2440) s.gaze = { x: s.gaze.x + 100, y: s.gaze.y };
  }

  const metrics = validateSaccadeDetector(samples, WIDTH, HEIGHT);

  assert.equal(metrics.matchedJumps, 3);
  assert.equal(metrics.falsePositives, 2); // the flick out and the flick back
  assert.ok(metrics.falsePositivesPerMin > 0);
});

test('validateSaccadeDetector reports unavailable on insufficient data', () => {
  const noJumps: OcSample[] = Array.from({ length: 10 }, (_, i) => ({
    t: i * DT,
    gaze: { x: 500, y: 300 },
    target: { x: 500, y: 300 },
  }));

  const metrics = validateSaccadeDetector(noJumps, WIDTH, HEIGHT);
  assert.equal(metrics.trackingAvailable, false);
  assert.equal(metrics.targetJumps, 0);
  assert.equal(metrics.detectionRate, 0);
  assert.equal(metrics.medianLatencyMs, null);
  assert.equal(metrics.latencyIqrMs, null);
  assert.equal(metrics.meanAmplitudeGain, null);

  const empty = validateSaccadeDetector([], WIDTH, HEIGHT);
  assert.equal(empty.trackingAvailable, false);
  assert.equal(empty.samplesValid, 0);
  assert.equal(empty.detectionRate, 0);
  assert.equal(empty.medianLatencyMs, null);
  assert.equal(empty.latencyIqrMs, null);
  assert.equal(empty.meanAmplitudeGain, null);
});

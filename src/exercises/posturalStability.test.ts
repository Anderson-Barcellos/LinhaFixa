import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getPosturalBaseline,
  resetPosturalBaseline,
  setPosturalBaseline,
  summarizePosturalBaseline,
  summarizePosturalStability,
  PosturalSample,
} from './posturalStability';

// Build a window of head-pose samples with small alternating jitter so the std is
// deterministic and tiny, then let the caller bias yaw/roll to provoke each status.
function buildSamples(
  count: number,
  shape: (i: number) => Partial<PosturalSample>,
): PosturalSample[] {
  return Array.from({ length: count }, (_, i) => ({
    yaw: 0, pitch: 0, roll: 0, ...shape(i),
  }));
}

test('summarizePosturalStability reports a steady head hold as stable with high confidence', () => {
  const samples = buildSamples(200, i => ({
    yaw: i % 2 === 0 ? 0.5 : -0.5,
    pitch: i % 2 === 0 ? 0.5 : -0.5,
  }));
  const m = summarizePosturalStability(samples);

  assert.equal(m.status, 'stable');
  assert.equal(m.confidence, 'high');
  assert.equal(m.cervicalStability, 100);
  assert.equal(m.highMovement, false);
  assert.match(m.label, /estável/);
});

test('summarizePosturalStability detects a sustained head tilt from roll offset', () => {
  const samples = buildSamples(200, () => ({ roll: 12 }));
  const m = summarizePosturalStability(samples);

  assert.equal(m.status, 'sustained-tilt');
  assert.equal(m.sustainedTiltDeg, 12);
  assert.match(m.label, /Inclinação/);
});

test('summarizePosturalStability applies calibration baseline before reporting sustained tilt', () => {
  const baselineSamples = buildSamples(80, () => ({ yaw: 4, pitch: -2, roll: 10 }));
  const baseline = summarizePosturalBaseline(baselineSamples);
  const samples = buildSamples(200, () => ({ yaw: 4.5, pitch: -1.5, roll: 11 }));

  const m = summarizePosturalStability(samples, { baseline });

  assert.equal(m.status, 'stable');
  assert.equal(m.baselineApplied, true);
  assert.equal(m.sustainedTiltDeg, 1);
  assert.equal(m.yawOffset, 0.5);
  assert.equal(m.pitchOffset, 0.5);
});

test('summarizePosturalStability marks Motion Assist moved state without calling it shaking', () => {
  const samples = buildSamples(200, () => ({}));
  const m = summarizePosturalStability(samples, {
    motionStatus: 'moved',
    motionDeltaDeg: 8.5,
    motionConfidence: 'medium',
  });

  assert.equal(m.status, 'position-changed');
  assert.equal(m.highMovement, false);
  assert.equal(m.motionStatus, 'moved');
  assert.equal(m.motionDeltaDeg, 8.5);
  assert.equal(m.confidence, 'medium');
  assert.match(m.label, /Posição mudou/);
});

test('postural baseline helpers store defensive copies and can reset session state', () => {
  const baseline = summarizePosturalBaseline(buildSamples(20, () => ({ yaw: 2, pitch: 3, roll: 4 })));

  setPosturalBaseline(baseline);
  const stored = getPosturalBaseline();
  assert.deepEqual(stored, baseline);

  baseline.roll = 99;
  assert.equal(getPosturalBaseline()?.roll, 4);

  resetPosturalBaseline();
  assert.equal(getPosturalBaseline(), null);
});

test('summarizePosturalStability detects lateral head rotation from yaw range', () => {
  // Slow yaw sweep 0..14: peak-to-peak >= ROTATION_RANGE but jitter stays below MAX.
  const samples = buildSamples(200, i => ({ yaw: (i / 199) * 14 }));
  const m = summarizePosturalStability(samples);

  assert.equal(m.status, 'rotating');
  assert.ok(m.rotationRange >= 12);
  assert.equal(m.highMovement, false);
});

test('summarizePosturalStability flags Motion Assist shaking as high movement', () => {
  const samples = buildSamples(200, () => ({}));
  const m = summarizePosturalStability(samples, { motionHighMovement: true });

  assert.equal(m.status, 'high-movement');
  assert.equal(m.highMovement, true);
  assert.equal(m.confidence, 'low');
});

test('summarizePosturalStability reports insufficient signal with too few samples', () => {
  const m = summarizePosturalStability([{ yaw: 0, pitch: 0, roll: 0 }]);

  assert.equal(m.status, 'insufficient');
  assert.equal(m.samples, 1);
  assert.match(m.insight, /amostras de cabeça suficientes/);
});

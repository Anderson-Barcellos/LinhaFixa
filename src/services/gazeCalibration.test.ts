import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addCalibrationSample,
  fitCalibration,
  getCalibrationSignature,
  isCalibrated,
  predictNorm,
  resetCalibration,
  setCalibrationSignature,
} from './gazeCalibration';
import { GAZE_FEATURE_LENGTH } from './faceTracking';
import type { CalibrationSignature } from './ocularSignalContract';

test('calibration signature is stored defensively and reset with calibration', () => {
  const signature: CalibrationSignature = {
    viewportWidth: 932,
    viewportHeight: 430,
    orientation: 'landscape',
    devicePixelRatio: 3,
    surfaceRect: { left: 0, top: 0, width: 932, height: 430 },
    videoWidth: 1280,
    videoHeight: 720,
    trackFrameRate: 60,
  };

  setCalibrationSignature(signature);
  signature.surfaceRect.width = 10;

  assert.equal(getCalibrationSignature()?.surfaceRect.width, 932);

  resetCalibration();
  assert.equal(getCalibrationSignature(), null);
});

test('ridge recovers a linear mapping despite a feature on a 100x scale (z-score)', () => {
  resetCalibration();

  // True linear relationship target = bias + Σ w·feature. Feature index 2 is on a ×100
  // scale (mimicking the head-yaw slot in the real layout), which would mis-condition the
  // normal equations without standardization.
  const wx = Array.from({ length: GAZE_FEATURE_LENGTH }, (_, i) => (i === 2 ? 0.0008 : 0.01 * ((i % 3) - 1)));
  const wy = Array.from({ length: GAZE_FEATURE_LENGTH }, (_, i) => (i === 2 ? -0.0006 : 0.01 * ((i % 2) ? 1 : -1)));
  const biasX = 0.5;
  const biasY = 0.4;

  // Deterministic LCG so the test is reproducible (no Math.random).
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const built: { features: number[]; target: { x: number; y: number } }[] = [];
  for (let n = 0; n < 40; n++) {
    const features = Array.from({ length: GAZE_FEATURE_LENGTH }, (_, i) =>
      i === 2 ? (rand() - 0.5) * 40 : rand() // index 2 ranges ~±20 (×100-style), others [0,1]
    );
    let tx = biasX, ty = biasY;
    for (let i = 0; i < GAZE_FEATURE_LENGTH; i++) {
      tx += wx[i] * features[i];
      ty += wy[i] * features[i];
    }
    const target = { x: clamp01(tx), y: clamp01(ty) };
    built.push({ features, target });
    addCalibrationSample(features, target);
  }

  assert.equal(fitCalibration(), true);
  assert.equal(isCalibrated(), true);

  // Predictions on the training points should recover the targets with small error.
  let sumErr = 0;
  for (const { features, target } of built) {
    const pred = predictNorm(features);
    assert.ok(pred, 'expected a prediction');
    assert.ok(Number.isFinite(pred!.x) && Number.isFinite(pred!.y), 'prediction must be finite');
    assert.ok(pred!.x >= 0 && pred!.x <= 1 && pred!.y >= 0 && pred!.y <= 1, 'prediction must be clamped to [0,1]');
    sumErr += Math.hypot(pred!.x - target.x, pred!.y - target.y);
  }
  const meanErr = sumErr / built.length;
  assert.ok(meanErr < 0.02, `mean recovery error too high: ${meanErr}`);

  resetCalibration();
  assert.equal(predictNorm(built[0].features), null);
});

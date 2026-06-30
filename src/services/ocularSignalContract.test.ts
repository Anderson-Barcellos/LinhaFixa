import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calibrationSignatureMatches,
  viewportNormToRectPoint,
  type CalibrationSignature,
  type SurfaceRect,
} from './ocularSignalContract';

test('viewportNormToRectPoint converts viewport-normalized gaze into canvas-local CSS pixels', () => {
  const rect: SurfaceRect = { left: 100, top: 50, width: 400, height: 300 };

  const point = viewportNormToRectPoint(
    { x: 0.5, y: 0.5 },
    rect,
    { width: 1000, height: 700 }
  );

  assert.deepEqual(point, { x: 400, y: 300, inBounds: true });
});

test('viewportNormToRectPoint preserves out-of-bounds evidence instead of silently clamping', () => {
  const rect: SurfaceRect = { left: 300, top: 200, width: 200, height: 100 };

  const point = viewportNormToRectPoint(
    { x: 0.1, y: 0.1 },
    rect,
    { width: 1000, height: 700 }
  );

  assert.equal(point.inBounds, false);
  assert.equal(point.x < 0, true);
  assert.equal(point.y < 0, true);
});

test('calibrationSignatureMatches rejects orientation and viewport aspect drift', () => {
  const signature: CalibrationSignature = {
    viewportWidth: 932,
    viewportHeight: 430,
    orientation: 'landscape',
    devicePixelRatio: 3,
    surfaceRect: { left: 0, top: 0, width: 650, height: 430 },
    videoWidth: 1280,
    videoHeight: 720,
  };

  assert.equal(calibrationSignatureMatches(signature, {
    viewportWidth: 932,
    viewportHeight: 430,
    orientation: 'landscape',
    devicePixelRatio: 3,
    surfaceRect: { left: 0, top: 0, width: 650, height: 430 },
    videoWidth: 1280,
    videoHeight: 720,
  }).matches, true);

  assert.equal(calibrationSignatureMatches(signature, {
    viewportWidth: 430,
    viewportHeight: 932,
    orientation: 'portrait',
    devicePixelRatio: 3,
    surfaceRect: { left: 0, top: 0, width: 430, height: 540 },
    videoWidth: 1280,
    videoHeight: 720,
  }).matches, false);
});

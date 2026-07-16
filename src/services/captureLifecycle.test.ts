import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canBeginCaptureCalibration } from './captureLifecycle';

test('canBeginCaptureCalibration blocks every recalibration path during an active capture', () => {
  assert.equal(canBeginCaptureCalibration({ capturing: true, cameraState: 'running' }), false);
  assert.equal(canBeginCaptureCalibration({ capturing: true, cameraState: 'idle' }), false);
});

test('canBeginCaptureCalibration preserves the existing idle/running camera policy outside capture', () => {
  assert.equal(canBeginCaptureCalibration({ capturing: false, cameraState: 'running' }), true);
  assert.equal(canBeginCaptureCalibration({ capturing: false, cameraState: 'idle' }), true);
  assert.equal(canBeginCaptureCalibration({ capturing: false, cameraState: 'starting' }), false);
  assert.equal(canBeginCaptureCalibration({ capturing: false, cameraState: 'unavailable' }), false);
});

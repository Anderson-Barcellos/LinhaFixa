import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getCalibrationSignature,
  resetCalibration,
  setCalibrationSignature,
} from './gazeCalibration';
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

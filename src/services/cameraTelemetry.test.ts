import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCameraPipelineTelemetry } from './cameraTelemetry';

test('readCameraPipelineTelemetry separates negotiated camera, video and measured rates', () => {
  const track = {
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }),
    getCapabilities: () => ({
      width: { min: 640, max: 1920 },
      height: { min: 480, max: 1080 },
      frameRate: { min: 15, max: 60 },
    }),
  };
  const video = {
    videoWidth: 1280,
    videoHeight: 720,
    srcObject: {
      getVideoTracks: () => [track],
    },
  } as unknown as HTMLVideoElement;

  const telemetry = readCameraPipelineTelemetry(video, {
    detectionFps: 31,
    ocularSampleRateHz: 30,
  });

  assert.deepEqual(telemetry.negotiated, { width: 1280, height: 720, frameRate: 30 });
  assert.deepEqual(telemetry.capabilities?.frameRate, { min: 15, max: 60 });
  assert.deepEqual(telemetry.video, { width: 1280, height: 720 });
  assert.deepEqual(telemetry.measured, { detectionFps: 31, ocularSampleRateHz: 30 });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFrontCameraConstraints, isReusableStream } from './cameraStream';

test('buildFrontCameraConstraints targets front camera at 30fps landscape-friendly resolution', () => {
  assert.deepEqual(buildFrontCameraConstraints(), {
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  });
});

test('isReusableStream only accepts streams with at least one live video track', () => {
  const liveTrack = { kind: 'video', readyState: 'live' };
  const endedTrack = { kind: 'video', readyState: 'ended' };
  const audioTrack = { kind: 'audio', readyState: 'live' };

  assert.equal(isReusableStream({ getTracks: () => [liveTrack] } as MediaStream), true);
  assert.equal(isReusableStream({ getTracks: () => [endedTrack] } as MediaStream), false);
  assert.equal(isReusableStream({ getTracks: () => [audioTrack] } as MediaStream), false);
  assert.equal(isReusableStream(null), false);
});

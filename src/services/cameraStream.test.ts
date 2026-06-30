import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachStream, buildFrontCameraConstraints, isReusableStream } from './cameraStream';

test('buildFrontCameraConstraints targets front camera at high temporal resolution', () => {
  assert.deepEqual(buildFrontCameraConstraints(), {
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60, max: 120 },
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

test('attachStream does not replay a stream that is already attached and playing', async () => {
  let playCalls = 0;
  const stream = { id: 'same-stream' } as MediaStream;
  const video = {
    srcObject: stream,
    muted: false,
    playsInline: false,
    paused: false,
    play: async () => {
      playCalls += 1;
    },
  } as HTMLVideoElement;

  await attachStream(video, stream);

  assert.equal(video.srcObject, stream);
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
  assert.equal(playCalls, 0);
});

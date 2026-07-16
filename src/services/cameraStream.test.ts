import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attachStream,
  buildFrontCameraConstraints,
  discardFrontCameraRequest,
  isReusableStream,
  requestFrontCameraStream,
  stopCameraStream,
} from './cameraStream';

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

test('a stale sole camera request stops exactly its newly resolved stream', async () => {
  stopCameraStream();
  let resolveStream!: (stream: MediaStream) => void;
  const originalNavigator = globalThis.navigator;
  const stopped: string[] = [];
  const stream = {
    getTracks: () => [{ kind: 'video', readyState: 'live', stop: () => stopped.push('stale') }],
  } as unknown as MediaStream;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => new Promise<MediaStream>(resolve => { resolveStream = resolve; }) } },
  });
  try {
    const request = requestFrontCameraStream();
    resolveStream(stream);
    assert.equal(await request.promise, stream);
    assert.equal(discardFrontCameraRequest(request, stream), true);
    assert.deepEqual(stopped, ['stale']);
  } finally {
    stopCameraStream();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
});

test('a stale request cannot stop a pending stream claimed by a newer consumer', async () => {
  stopCameraStream();
  let resolveStream!: (stream: MediaStream) => void;
  const originalNavigator = globalThis.navigator;
  let stopCalls = 0;
  const stream = {
    getTracks: () => [{ kind: 'video', readyState: 'live', stop: () => { stopCalls += 1; } }],
  } as unknown as MediaStream;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => new Promise<MediaStream>(resolve => { resolveStream = resolve; }) } },
  });
  try {
    const stale = requestFrontCameraStream();
    const newer = requestFrontCameraStream();
    resolveStream(stream);
    assert.equal(await stale.promise, stream);
    assert.equal(await newer.promise, stream);
    assert.equal(discardFrontCameraRequest(stale, stream), false);
    assert.equal(stopCalls, 0);
  } finally {
    stopCameraStream();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
});

test('a revoked acquisition cannot overwrite or clear a newer camera acquisition', async () => {
  stopCameraStream();
  const resolvers: Array<(stream: MediaStream) => void> = [];
  const originalNavigator = globalThis.navigator;
  let staleStops = 0;
  let currentStops = 0;
  const staleStream = {
    getTracks: () => [{ kind: 'video', readyState: 'live', stop: () => { staleStops += 1; } }],
  } as unknown as MediaStream;
  const currentStream = {
    getTracks: () => [{ kind: 'video', readyState: 'live', stop: () => { currentStops += 1; } }],
  } as unknown as MediaStream;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => new Promise<MediaStream>(resolve => { resolvers.push(resolve); }) } },
  });
  try {
    const stale = requestFrontCameraStream();
    stopCameraStream();
    const current = requestFrontCameraStream();
    resolvers[0](staleStream);
    assert.equal(await stale.promise, staleStream);
    assert.equal(staleStops, 1, 'revoked stream is released on resolution');
    resolvers[1](currentStream);
    assert.equal(await current.promise, currentStream);
    assert.equal(discardFrontCameraRequest(stale, staleStream), false, 'already discarded stream is not stopped twice');
    assert.equal(currentStops, 0);
  } finally {
    stopCameraStream();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
});

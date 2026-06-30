import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startVideoFrameLoop } from './videoFrameLoop';

test('startVideoFrameLoop prefers requestVideoFrameCallback so work follows video frames', () => {
  const scheduled: Array<(now: number, metadata: { expectedDisplayTime?: number; mediaTime?: number }) => void> = [];
  const video = {
    requestVideoFrameCallback(cb: (now: number, metadata: { expectedDisplayTime?: number; mediaTime?: number }) => void) {
      scheduled.push(cb);
      return scheduled.length;
    },
    cancelVideoFrameCallback() {},
  } as unknown as HTMLVideoElement;

  const seen: number[] = [];
  const loop = startVideoFrameLoop(video, ts => {
    seen.push(ts);
  });

  assert.equal(scheduled.length, 1);
  scheduled[0](10, { expectedDisplayTime: 12 });
  assert.deepEqual(seen, [12]);
  assert.equal(scheduled.length, 2);

  loop.stop();
});

test('startVideoFrameLoop falls back to requestAnimationFrame when video callbacks are unavailable', () => {
  const scheduled: Array<(ts: number) => void> = [];
  const callbackTs: number[] = [];
  const canceled: number[] = [];
  const video = {} as HTMLVideoElement;

  const loop = startVideoFrameLoop(
    video,
    ts => {
      callbackTs.push(ts);
    },
    {
      requestAnimationFrame: cb => {
        scheduled.push(cb);
        return scheduled.length;
      },
      cancelAnimationFrame: id => {
        canceled.push(id);
      },
    }
  );

  assert.equal(scheduled.length, 1);
  scheduled[0](33);
  assert.deepEqual(callbackTs, [33]);
  assert.equal(scheduled.length, 2);

  loop.stop();
  assert.deepEqual(canceled, [2]);
});

test('startVideoFrameLoop fallback only emits work when the video frame advances', () => {
  const scheduled: Array<(ts: number) => void> = [];
  const callbackTs: number[] = [];
  const video = {
    currentTime: 0,
    getVideoPlaybackQuality: () => ({ totalVideoFrames: 1 }),
  } as unknown as HTMLVideoElement;

  const loop = startVideoFrameLoop(
    video,
    ts => {
      callbackTs.push(ts);
    },
    {
      requestAnimationFrame: cb => {
        scheduled.push(cb);
        return scheduled.length;
      },
      cancelAnimationFrame: () => {},
    }
  );

  scheduled[0](10);
  scheduled[1](20);
  (video as unknown as { currentTime: number }).currentTime = 0.033;
  scheduled[2](30);

  assert.deepEqual(callbackTs, [10, 30]);
  loop.stop();
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateFrameWindow, updateCoverageWindow, readNegotiatedTrackFps, type CoverageEntry } from './useCameraPipeline';

test('updateFrameWindow counts only frames inside the 1s window', () => {
  const times: number[] = [];
  assert.equal(updateFrameWindow(times, 0), 1);
  assert.equal(updateFrameWindow(times, 500), 2);
  assert.equal(updateFrameWindow(times, 1000), 3); // boundary: exactly 1000ms old stays
  assert.equal(updateFrameWindow(times, 1001), 3); // ts=0 dropped (1001 > 1000)
  assert.deepEqual(times, [500, 1000, 1001]);
});

test('updateFrameWindow mutates the caller-owned array in place', () => {
  const times = [10, 20];
  updateFrameWindow(times, 30);
  assert.deepEqual(times, [10, 20, 30]);
});

test('updateCoverageWindow returns the % of recent frames with a face', () => {
  const entries: CoverageEntry[] = [];
  assert.equal(updateCoverageWindow(entries, 0, true), 100);
  assert.equal(updateCoverageWindow(entries, 100, false), 50);
  assert.equal(updateCoverageWindow(entries, 200, false), (1 / 3) * 100);
});

test('updateCoverageWindow drops entries older than the 2s window', () => {
  const entries: CoverageEntry[] = [];
  updateCoverageWindow(entries, 0, false);
  updateCoverageWindow(entries, 1000, false);
  // ts=0 (false) leaves the window at 2001; only 1000(false) + 2001(true) remain.
  assert.equal(updateCoverageWindow(entries, 2001, true), 50);
  assert.equal(entries.length, 2);
});

test('readNegotiatedTrackFps returns the finite negotiated frameRate', () => {
  const video = {
    srcObject: {
      getVideoTracks: () => [{ getSettings: () => ({ frameRate: 30 }) }],
    },
  } as unknown as HTMLVideoElement;
  assert.equal(readNegotiatedTrackFps(video), 30);
});

test('readNegotiatedTrackFps returns null without a stream or with a non-finite rate', () => {
  assert.equal(readNegotiatedTrackFps({ srcObject: null } as unknown as HTMLVideoElement), null);
  const nanVideo = {
    srcObject: {
      getVideoTracks: () => [{ getSettings: () => ({ frameRate: Number.NaN }) }],
    },
  } as unknown as HTMLVideoElement;
  assert.equal(readNegotiatedTrackFps(nanVideo), null);
  const noSettingsVideo = {
    srcObject: { getVideoTracks: () => [{}] },
  } as unknown as HTMLVideoElement;
  assert.equal(readNegotiatedTrackFps(noSettingsVideo), null);
});

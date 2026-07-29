import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  lockExposure,
  readExposureCapabilities,
  unlockExposure,
} from './cameraExposure';

interface FakeTrackOptions {
  capabilities?: Record<string, unknown> | 'throws' | 'absent';
  settings?: Record<string, unknown>;
  applyBehavior?: (constraints: MediaTrackConstraints) => Promise<void>;
}

function fakeTrack(options: FakeTrackOptions = {}) {
  const applied: MediaTrackConstraints[] = [];
  let settingsReads = 0;
  const track = {
    kind: 'video',
    applied,
    settingsReads: () => settingsReads,
    getCapabilities:
      options.capabilities === 'absent'
        ? undefined
        : () => {
            if (options.capabilities === 'throws') throw new Error('boom');
            return options.capabilities ?? {};
          },
    getSettings: () => {
      settingsReads += 1;
      return options.settings ?? {};
    },
    applyConstraints: async (constraints: MediaTrackConstraints) => {
      applied.push(constraints);
      if (options.applyBehavior) await options.applyBehavior(constraints);
    },
  };
  return track as unknown as MediaStreamTrack & {
    applied: MediaTrackConstraints[];
    settingsReads: () => number;
  };
}

const MANUAL_CAPS = {
  exposureMode: ['continuous', 'manual'],
  exposureTime: { min: 10, max: 10000 },
};

test('readExposureCapabilities reports manual support with time range and current settings', () => {
  const track = fakeTrack({
    capabilities: MANUAL_CAPS,
    settings: { exposureMode: 'continuous', exposureTime: 312 },
  });

  const caps = readExposureCapabilities(track);

  assert.equal(caps.manualSupported, true);
  assert.deepEqual(caps.modes, ['continuous', 'manual']);
  assert.deepEqual(caps.exposureTime, { min: 10, max: 10000 });
  assert.deepEqual(caps.current, { exposureMode: 'continuous', exposureTime: 312 });
});

test('readExposureCapabilities is unsupported without manual mode or without exposureTime', () => {
  const noManual = readExposureCapabilities(fakeTrack({
    capabilities: { exposureMode: ['continuous'], exposureTime: { min: 1, max: 100 } },
  }));
  assert.equal(noManual.manualSupported, false);
  assert.deepEqual(noManual.modes, ['continuous']);

  const noTime = readExposureCapabilities(fakeTrack({
    capabilities: { exposureMode: ['continuous', 'manual'] },
  }));
  assert.equal(noTime.manualSupported, false);
});

test('readExposureCapabilities skips the settings read when manual mode is unsupported', () => {
  const track = fakeTrack({ capabilities: { exposureMode: ['continuous'] } });

  readExposureCapabilities(track);

  assert.equal(track.settingsReads(), 0);
});

test('readExposureCapabilities tolerates tracks without getCapabilities, throwing, or absent track', () => {
  assert.equal(readExposureCapabilities(fakeTrack({ capabilities: 'absent' })).manualSupported, false);
  assert.equal(readExposureCapabilities(fakeTrack({ capabilities: 'throws' })).manualSupported, false);
  assert.equal(readExposureCapabilities(null).manualSupported, false);
  assert.equal(readExposureCapabilities(undefined).manualSupported, false);
});

test('lockExposure applies manual mode and exposureTime in two separate calls, in order', async () => {
  const track = fakeTrack({
    capabilities: MANUAL_CAPS,
    settings: { exposureMode: 'continuous', exposureTime: 312 },
  });

  const result = await lockExposure(track);

  assert.equal(result.locked, true);
  assert.equal(track.applied.length, 2);
  assert.deepEqual(track.applied[0], { advanced: [{ exposureMode: 'manual' }] });
  assert.deepEqual(track.applied[1], { advanced: [{ exposureTime: 312 }] });
  assert.equal(result.locked && result.exposureTime, 312);
});

test('lockExposure reuses precomputed capabilities without re-reading the track', async () => {
  const track = fakeTrack({
    capabilities: MANUAL_CAPS,
    settings: { exposureTime: 312 },
  });
  const caps = readExposureCapabilities(track);
  const readsAfterCaps = track.settingsReads();

  const result = await lockExposure(track, caps);

  assert.equal(result.locked, true);
  assert.equal(track.settingsReads(), readsAfterCaps);
});

test('lockExposure clamps the current exposureTime into the supported range', async () => {
  const track = fakeTrack({
    capabilities: { exposureMode: ['manual'], exposureTime: { min: 100, max: 500 } },
    settings: { exposureTime: 9999 },
  });

  const result = await lockExposure(track);

  assert.equal(result.locked, true);
  assert.deepEqual(track.applied[1], { advanced: [{ exposureTime: 500 }] });
});

test('lockExposure falls back to the range midpoint when no current exposureTime exists', async () => {
  const track = fakeTrack({
    capabilities: { exposureMode: ['manual'], exposureTime: { min: 100, max: 500 } },
    settings: {},
  });

  const result = await lockExposure(track);

  assert.equal(result.locked, true);
  assert.deepEqual(track.applied[1], { advanced: [{ exposureTime: 300 }] });
});

test('lockExposure refuses unsupported tracks without touching constraints', async () => {
  const track = fakeTrack({ capabilities: { exposureMode: ['continuous'] } });

  const result = await lockExposure(track);

  assert.equal(result.locked, false);
  assert.equal(!result.locked && result.reason, 'unsupported');
  assert.equal(track.applied.length, 0);
});

test('lockExposure reports failure and restores continuous mode when applyConstraints rejects', async () => {
  let calls = 0;
  const track = fakeTrack({
    capabilities: MANUAL_CAPS,
    settings: { exposureTime: 312 },
    applyBehavior: async () => {
      calls += 1;
      if (calls === 2) throw new Error('constraint rejected');
    },
  });

  const result = await lockExposure(track);

  assert.equal(result.locked, false);
  assert.equal(!result.locked && result.reason, 'apply-failed');
  // manual → exposureTime (falha) → restauração para continuous
  assert.deepEqual(track.applied[2], { advanced: [{ exposureMode: 'continuous' }] });
});

test('unlockExposure restores continuous mode and swallows failures from dead tracks', async () => {
  const track = fakeTrack({ capabilities: MANUAL_CAPS, settings: { exposureTime: 312 } });
  await unlockExposure(track);
  assert.deepEqual(track.applied.at(-1), { advanced: [{ exposureMode: 'continuous' }] });

  const deadTrack = fakeTrack({
    capabilities: MANUAL_CAPS,
    applyBehavior: async () => { throw new Error('track ended'); },
  });
  await assert.doesNotReject(unlockExposure(deadTrack));
});

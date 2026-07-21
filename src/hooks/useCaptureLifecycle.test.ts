import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAPTURE_SAFETY_CAP_MS,
  captureCoveragePct,
  captureDeviceClassConfirmed,
  captureTickAction,
  medianCaptureDistanceCm,
  routeCaptureSample,
} from './useCaptureLifecycle';

test('only an explicitly confirmed frozen environment is validity-eligible', () => {
  assert.equal(captureDeviceClassConfirmed({ deviceClassSource: 'confirmed' }), true);
  assert.equal(captureDeviceClassConfirmed({ deviceClassSource: 'suggested' }), false);
  assert.equal(captureDeviceClassConfirmed({ deviceClassSource: 'legacy-inferred' }), false);
  assert.equal(captureDeviceClassConfirmed({}), false);
});

test('routeCaptureSample drops blinking frames entirely (no buffer, no extrapolation count)', () => {
  const routing = routeCaptureSample({
    blinking: true,
    dotCalibrated: true,
    hasDot: true,
    hasGaze: true,
    dotExtrapolated: true,
  });
  assert.deepEqual(routing, { countExtrapolated: false, target: null });
});

test('routeCaptureSample sends a calibrated dot to the calibrated buffer', () => {
  const routing = routeCaptureSample({
    blinking: false,
    dotCalibrated: true,
    hasDot: true,
    hasGaze: true,
    dotExtrapolated: false,
  });
  assert.deepEqual(routing, { countExtrapolated: false, target: 'calibrated' });
});

test('routeCaptureSample falls back to the raw buffer when the dot is uncalibrated', () => {
  const routing = routeCaptureSample({
    blinking: false,
    dotCalibrated: false,
    hasDot: true,
    hasGaze: true,
    dotExtrapolated: false,
  });
  assert.equal(routing.target, 'raw');
});

test('routeCaptureSample counts extrapolation rejections and still feeds raw gaze', () => {
  const routing = routeCaptureSample({
    blinking: false,
    dotCalibrated: false,
    hasDot: false,
    hasGaze: true,
    dotExtrapolated: true,
  });
  assert.deepEqual(routing, { countExtrapolated: true, target: 'raw' });
});

test('routeCaptureSample yields no target without dot or gaze', () => {
  const routing = routeCaptureSample({
    blinking: false,
    dotCalibrated: false,
    hasDot: false,
    hasGaze: false,
    dotExtrapolated: false,
  });
  assert.equal(routing.target, null);
});

test('captureTickAction finishes exactly at the safety cap, ignoring the elapsed throttle', () => {
  assert.equal(captureTickAction(CAPTURE_SAFETY_CAP_MS, false), 'finish');
  assert.equal(captureTickAction(CAPTURE_SAFETY_CAP_MS + 1, true), 'finish');
});

test('captureTickAction below the cap follows the caller UI throttle', () => {
  assert.equal(captureTickAction(CAPTURE_SAFETY_CAP_MS - 1, true), 'elapsed');
  assert.equal(captureTickAction(CAPTURE_SAFETY_CAP_MS - 1, false), 'none');
});

test('captureTickAction honors a custom cap', () => {
  assert.equal(captureTickAction(50, false, 50), 'finish');
  assert.equal(captureTickAction(49, true, 50), 'elapsed');
});

test('captureCoveragePct is 0 without frames and the face ratio otherwise', () => {
  assert.equal(captureCoveragePct(3, 0), 0);
  assert.equal(captureCoveragePct(3, 4), 75);
  assert.equal(captureCoveragePct(0, 4), 0);
});

test('medianCaptureDistanceCm is undefined without samples', () => {
  assert.equal(medianCaptureDistanceCm([]), undefined);
});

test('medianCaptureDistanceCm sorts numerically and takes the middle sample', () => {
  assert.equal(medianCaptureDistanceCm([40, 35, 100]), 40);
  // Numeric (not lexicographic) sort: 9 < 40 < 100.
  assert.equal(medianCaptureDistanceCm([100, 9, 40]), 40);
});

test('medianCaptureDistanceCm takes the upper middle for even lengths (original indexing)', () => {
  assert.equal(medianCaptureDistanceCm([30, 40, 50, 60]), 50);
});

test('medianCaptureDistanceCm does not mutate the caller buffer', () => {
  const samples = [50, 30, 40];
  medianCaptureDistanceCm(samples);
  assert.deepEqual(samples, [50, 30, 40]);
});

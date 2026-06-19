import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyMotionQuality,
  computeOrientationDeltaDeg,
  normalizeAngleDeltaDeg,
} from './motionSensor';

test('normalizeAngleDeltaDeg returns the shortest signed angle delta', () => {
  assert.equal(normalizeAngleDeltaDeg(10, 350), 20);
  assert.equal(normalizeAngleDeltaDeg(350, 10), -20);
  assert.equal(normalizeAngleDeltaDeg(180, 0), 180);
  assert.equal(normalizeAngleDeltaDeg(0, 180), -180);
});

test('computeOrientationDeltaDeg combines alpha wraparound with beta and gamma deltas', () => {
  const delta = computeOrientationDeltaDeg(
    { alpha: 350, beta: 12, gamma: -3 },
    { alpha: 10, beta: 9, gamma: 1 },
  );

  assert.equal(delta?.toFixed(1), '20.6');
});

test('classifyMotionQuality marks missing or denied sensors as unavailable', () => {
  const quality = classifyMotionQuality({
    supported: true,
    permission: 'denied',
    active: false,
    current: null,
    baseline: null,
    recentAcceleration: null,
    recentRotationRate: null,
  });

  assert.deepEqual(quality, {
    status: 'unavailable',
    confidence: 'low',
    deltaDeg: null,
  });
});

test('classifyMotionQuality reports stable, moved, and shaking states', () => {
  const baseline = { alpha: 10, beta: 0, gamma: 0 };

  assert.deepEqual(classifyMotionQuality({
    supported: true,
    permission: 'granted',
    active: true,
    current: { alpha: 12, beta: 1, gamma: 1 },
    baseline,
    recentAcceleration: 0.02,
    recentRotationRate: 2,
  }), {
    status: 'stable',
    confidence: 'high',
    deltaDeg: 2.4,
  });

  assert.deepEqual(classifyMotionQuality({
    supported: true,
    permission: 'granted',
    active: true,
    current: { alpha: 25, beta: 2, gamma: 1 },
    baseline,
    recentAcceleration: 0.04,
    recentRotationRate: 4,
  }), {
    status: 'moved',
    confidence: 'low',
    deltaDeg: 15.2,
  });

  assert.deepEqual(classifyMotionQuality({
    supported: true,
    permission: 'granted',
    active: true,
    current: { alpha: 11, beta: 1, gamma: 1 },
    baseline,
    recentAcceleration: 0.45,
    recentRotationRate: 7,
  }), {
    status: 'shaking',
    confidence: 'low',
    deltaDeg: 1.7,
  });
});

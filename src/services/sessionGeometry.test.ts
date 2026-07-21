import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionGeometryInterruption } from './sessionGeometry';

const frozen = {
  orientation: 'portrait' as const,
  surfaceRect: { left: 0, top: 64, width: 390, height: 700 },
};

test('identical and subpixel geometry remains valid', () => {
  assert.equal(sessionGeometryInterruption(frozen, frozen), null);
  assert.equal(sessionGeometryInterruption(frozen, {
    ...frozen,
    surfaceRect: { left: 0.4, top: 63.6, width: 390.4, height: 699.6 },
  }), null);
});

test('orientation changes win over generic geometry changes', () => {
  assert.equal(sessionGeometryInterruption(frozen, {
    orientation: 'landscape',
    surfaceRect: { left: 0, top: 40, width: 844, height: 330 },
  }), 'orientation-changed-during-capture');
});

test('surface movement above one CSS pixel interrupts the run', () => {
  assert.equal(sessionGeometryInterruption(frozen, {
    ...frozen,
    surfaceRect: { ...frozen.surfaceRect, width: 388 },
  }), 'geometry-changed-during-capture');
});

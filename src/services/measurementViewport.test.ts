import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  measurementViewportSnapshot,
  requiresPhonePortrait,
} from './measurementViewport';

test('measurement viewport uses the visible height without exceeding the layout viewport', () => {
  assert.deepEqual(
    measurementViewportSnapshot({
      innerWidth: 390,
      innerHeight: 844,
      visualViewportHeight: 780,
    }),
    { height: 780, orientation: 'portrait' },
  );
  assert.deepEqual(
    measurementViewportSnapshot({
      innerWidth: 844,
      innerHeight: 390,
      visualViewportHeight: 780,
    }),
    { height: 390, orientation: 'landscape' },
  );
});

test('only a phone-sized touch device in landscape requires portrait measurement', () => {
  assert.equal(requiresPhonePortrait({
    width: 844,
    height: 390,
    maxTouchPoints: 5,
    coarsePointer: true,
  }), true);
  assert.equal(requiresPhonePortrait({
    width: 390,
    height: 844,
    maxTouchPoints: 5,
    coarsePointer: true,
  }), false);
  assert.equal(requiresPhonePortrait({
    width: 1194,
    height: 834,
    maxTouchPoints: 5,
    coarsePointer: true,
  }), false);
  assert.equal(requiresPhonePortrait({
    width: 844,
    height: 390,
    maxTouchPoints: 0,
    coarsePointer: false,
  }), false);
});

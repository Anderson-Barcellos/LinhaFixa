import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBlinking, BLINK_REJECT_THRESHOLD } from './faceTracking';

test('isBlinking treats a null score as "cannot tell" and does not reject', () => {
  assert.equal(isBlinking(null), false);
});

test('isBlinking rejects only scores strictly above the threshold', () => {
  assert.equal(isBlinking(0), false);
  assert.equal(isBlinking(BLINK_REJECT_THRESHOLD), false); // boundary is not a blink
  assert.equal(isBlinking(BLINK_REJECT_THRESHOLD + 0.01), true);
  assert.equal(isBlinking(0.95), true);
});

test('isBlinking honors a custom threshold', () => {
  assert.equal(isBlinking(0.4, 0.3), true);
  assert.equal(isBlinking(0.4, 0.8), false);
});

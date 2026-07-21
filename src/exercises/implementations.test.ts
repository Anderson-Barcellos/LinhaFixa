import assert from 'node:assert/strict';
import test from 'node:test';
import { registry } from './implementations';

test('backend-first redesign preserves every registered exercise', () => {
  assert.deepEqual(Object.keys(registry).sort(), [
    'assistedReading',
    'fixation',
    'saccades',
    'smooth_pursuit',
  ]);
});

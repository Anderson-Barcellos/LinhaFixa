import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultPreTestContextDraft,
  shouldRequestPreTestContext,
} from './usePreTestContext';

test('defaultPreTestContextDraft is the neutral middle of every scale, no medication', () => {
  assert.deepEqual(defaultPreTestContextDraft(), {
    venvanseTakenAt: null,
    sleepHours: 7,
    mood: 3,
    feeling: 3,
  });
});

test('defaultPreTestContextDraft returns a fresh object each call', () => {
  const a = defaultPreTestContextDraft();
  const b = defaultPreTestContextDraft();
  assert.notEqual(a, b);
  a.mood = 5;
  assert.equal(b.mood, 3);
});

test('shouldRequestPreTestContext asks on the first capture of the session', () => {
  assert.equal(
    shouldRequestPreTestContext({ context: null, skippedThisSession: false }),
    true,
  );
});

test('shouldRequestPreTestContext never reopens after a context was adopted', () => {
  assert.equal(
    shouldRequestPreTestContext({
      context: defaultPreTestContextDraft(),
      skippedThisSession: false,
    }),
    false,
  );
});

test('shouldRequestPreTestContext honors the session-scoped skip', () => {
  assert.equal(
    shouldRequestPreTestContext({ context: null, skippedThisSession: true }),
    false,
  );
});

test('shouldRequestPreTestContext with both adopted context and skip stays closed', () => {
  assert.equal(
    shouldRequestPreTestContext({
      context: defaultPreTestContextDraft(),
      skippedThisSession: true,
    }),
    false,
  );
});

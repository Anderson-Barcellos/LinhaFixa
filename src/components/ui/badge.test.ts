import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeVariants } from './badge';

test('badge tones map to the status palette', () => {
  assert.match(badgeVariants({ tone: 'positive' }), /emerald/);
  assert.match(badgeVariants({ tone: 'caution' }), /amber/);
  assert.match(badgeVariants({ tone: 'alert' }), /rose/);
  assert.match(badgeVariants({ tone: 'neutral' }), /bg-surface-sunken/);
});

test('badge base is the pill', () => {
  assert.match(badgeVariants({}), /rounded-full/);
  assert.match(badgeVariants({}), /text-xs font-bold/);
});

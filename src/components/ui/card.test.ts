import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardVariants } from './card';

test('default card is the rounded-3xl surface', () => {
  const cls = cardVariants({});
  assert.match(cls, /bg-surface/);
  assert.match(cls, /rounded-3xl/);
  assert.match(cls, /border-line/);
});

test('tones swap the border and background family', () => {
  assert.match(cardVariants({ tone: 'accent' }), /border-accent-line/);
  assert.match(cardVariants({ tone: 'sunken' }), /bg-surface-sunken/);
});

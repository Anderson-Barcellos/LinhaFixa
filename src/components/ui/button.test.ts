import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buttonVariants } from './button';

test('default is the ink primary button', () => {
  const cls = buttonVariants({});
  assert.match(cls, /bg-ink/);
  assert.match(cls, /text-ink-foreground/);
  assert.match(cls, /font-bold/);
});

test('variants map to token families', () => {
  assert.match(buttonVariants({ variant: 'accent' }), /bg-accent/);
  assert.match(buttonVariants({ variant: 'outline' }), /border-line-strong/);
  assert.match(buttonVariants({ variant: 'ghost' }), /text-faint/);
});

test('sizes control padding and radius', () => {
  assert.match(buttonVariants({ size: 'lg' }), /py-4/);
  assert.match(buttonVariants({ size: 'sm' }), /py-2/);
});

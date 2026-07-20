import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cn } from './cn';

test('merges conditional classes and dedupes tailwind conflicts', () => {
  assert.equal(cn('p-2', 'p-4'), 'p-4');
  assert.equal(cn('text-strong', false && 'hidden', 'font-bold'), 'text-strong font-bold');
  assert.equal(cn('bg-surface', { 'opacity-50': true, 'hidden': false }), 'bg-surface opacity-50');
});

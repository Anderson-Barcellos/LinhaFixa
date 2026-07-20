import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statTileClasses } from './stat-tile';

test('stat tile exposes value+label styling', () => {
  assert.match(statTileClasses.value, /font-bold/);
  assert.match(statTileClasses.value, /text-strong/);
  assert.match(statTileClasses.label, /text-faint/);
});

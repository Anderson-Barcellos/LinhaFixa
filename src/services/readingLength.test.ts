import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingWordRange } from './readingLength';

test('20s → 60-90 palavras', () => {
  assert.deepEqual(readingWordRange(20), { min: 60, max: 90 });
});

test('duração curta respeita piso de 30 palavras', () => {
  assert.deepEqual(readingWordRange(5), { min: 30, max: 30 });
});

test('duração longa respeita teto de 400 palavras', () => {
  assert.deepEqual(readingWordRange(200), { min: 400, max: 400 });
});

test('entrada inválida cai no default de 20s', () => {
  assert.deepEqual(readingWordRange(NaN), readingWordRange(20));
  assert.deepEqual(readingWordRange(0), readingWordRange(20));
  assert.deepEqual(readingWordRange(-3), readingWordRange(20));
});

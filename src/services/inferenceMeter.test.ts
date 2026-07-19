import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInferenceMeter } from './inferenceMeter';

test('sem amostras, emaMs é null e count 0', () => {
  const m = createInferenceMeter();
  assert.equal(m.emaMs(), null);
  assert.equal(m.count(), 0);
});

test('primeira amostra vira o EMA inteiro', () => {
  const m = createInferenceMeter();
  m.record(40);
  assert.equal(m.emaMs(), 40);
  assert.equal(m.count(), 1);
});

test('EMA converge na direção das amostras novas (alpha 0.5 pra teste)', () => {
  const m = createInferenceMeter(0.5);
  m.record(40);
  m.record(20); // 40*0.5 + 20*0.5 = 30
  assert.equal(m.emaMs(), 30);
});

test('amostra não-finita ou negativa é ignorada', () => {
  const m = createInferenceMeter();
  m.record(NaN);
  m.record(Infinity);
  m.record(-5);
  assert.equal(m.emaMs(), null);
  assert.equal(m.count(), 0);
});

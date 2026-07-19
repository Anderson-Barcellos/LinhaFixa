import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectTodayPreContext } from './preTestContext';

const ctx = (mood: number) => ({ venvanseTakenAt: null, sleepHours: 7, mood, feeling: 3 });
const day = new Date('2026-07-19T15:00:00');
const t = (h: number) => new Date('2026-07-19T00:00:00').getTime() + h * 3600_000;

test('retorna o contexto mais recente de hoje entre as fontes', () => {
  const picked = selectTodayPreContext([
    { timestamp: t(8), context: ctx(2) },
    { timestamp: t(11), context: ctx(4) },
    { timestamp: t(9), context: undefined },
  ], day);
  assert.equal(picked?.mood, 4);
});

test('a ordem dos registros não importa', () => {
  const picked = selectTodayPreContext([
    { timestamp: t(11), context: ctx(4) },
    { timestamp: t(8), context: ctx(2) },
  ], day);
  assert.equal(picked?.mood, 4);
});

test('ignora registros de ontem', () => {
  const picked = selectTodayPreContext([{ timestamp: t(-2), context: ctx(5) }], day);
  assert.equal(picked, null);
});

test('sem registros com contexto retorna null', () => {
  assert.equal(selectTodayPreContext([], day), null);
  assert.equal(selectTodayPreContext([{ timestamp: t(10), context: null }], day), null);
});

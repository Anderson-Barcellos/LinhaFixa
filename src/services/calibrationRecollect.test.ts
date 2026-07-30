import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_POINT_RETRIES,
  timeoutOutcome,
  nextWeakPointIndex,
} from './calibrationRecollect';

test('timeoutOutcome: ponto com amostras suficientes completa, mesmo sem retries sobrando', () => {
  assert.equal(timeoutOutcome(12, 12, 0), 'complete');
  assert.equal(timeoutOutcome(15, 12, MAX_POINT_RETRIES), 'complete');
});

test('timeoutOutcome: ponto fraco com retry disponível re-visita; esgotado rejeita', () => {
  assert.equal(timeoutOutcome(8, 12, 0), 'retry');
  assert.equal(timeoutOutcome(0, 12, 0), 'retry');
  assert.equal(timeoutOutcome(8, 12, MAX_POINT_RETRIES), 'reject');
});

test('nextWeakPointIndex acha o primeiro ponto abaixo do mínimo com retry disponível', () => {
  assert.equal(nextWeakPointIndex([12, 8, 12], [0, 0, 0], 12), 1);
  // fraco mas já re-visitado → não elegível; próximo fraco elegível vence
  assert.equal(nextWeakPointIndex([8, 9, 12], [1, 0, 0], 12), 1);
});

test('nextWeakPointIndex devolve null sem pontos elegíveis', () => {
  assert.equal(nextWeakPointIndex([12, 12, 12], [0, 0, 0], 12), null);
  assert.equal(nextWeakPointIndex([8, 12, 12], [1, 0, 0], 12), null);
  assert.equal(nextWeakPointIndex([], [], 12), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, clampDurationSec, capText, normalizeComplexity } from './serverGuards';

// --- createRateLimiter -------------------------------------------------------

test('rate limiter permite até o limite dentro da janela', () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 10_000 });
  assert.equal(limiter.check('ip', 0).allowed, true);
  assert.equal(limiter.check('ip', 1).allowed, true);
  assert.equal(limiter.check('ip', 2).allowed, true);
});

test('rate limiter bloqueia acima do limite e informa retryAfterSec', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 10_000 });
  limiter.check('ip', 0);
  limiter.check('ip', 1_000);
  const blocked = limiter.check('ip', 2_000);
  assert.equal(blocked.allowed, false);
  // Primeira entrada (t=0) expira em t=10_000 → faltam 8s.
  assert.equal(blocked.retryAfterSec, 8);
});

test('rate limiter retryAfterSec é no mínimo 1', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
  limiter.check('ip', 0);
  const blocked = limiter.check('ip', 9_900);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSec, 1);
});

test('rate limiter desliza a janela: requisições antigas expiram', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 10_000 });
  limiter.check('ip', 0);
  limiter.check('ip', 1_000);
  assert.equal(limiter.check('ip', 5_000).allowed, false);
  // t=10_001: a entrada de t=0 saiu da janela.
  assert.equal(limiter.check('ip', 10_001).allowed, true);
});

test('rate limiter isola chaves distintas', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
  assert.equal(limiter.check('a', 0).allowed, true);
  assert.equal(limiter.check('b', 0).allowed, true);
  assert.equal(limiter.check('a', 1).allowed, false);
});

test('rate limiter não contabiliza requisições bloqueadas', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
  limiter.check('ip', 0);
  limiter.check('ip', 5_000); // bloqueada — não deve estender o bloqueio
  assert.equal(limiter.check('ip', 10_001).allowed, true);
});

// --- clampDurationSec --------------------------------------------------------

test('clampDurationSec mantém valores dentro do range', () => {
  const opts = { min: 5, max: 120, fallback: 20 };
  assert.equal(clampDurationSec(30, opts), 30);
  assert.equal(clampDurationSec(5, opts), 5);
  assert.equal(clampDurationSec(120, opts), 120);
});

test('clampDurationSec aplica clamp nos extremos', () => {
  const opts = { min: 5, max: 120, fallback: 20 };
  assert.equal(clampDurationSec(2, opts), 5);
  assert.equal(clampDurationSec(999, opts), 120);
});

test('clampDurationSec cai no fallback para não-finitos e ≤0', () => {
  const opts = { min: 5, max: 120, fallback: 20 };
  assert.equal(clampDurationSec(NaN, opts), 20);
  assert.equal(clampDurationSec(Infinity, opts), 20);
  assert.equal(clampDurationSec(0, opts), 20);
  assert.equal(clampDurationSec(-10, opts), 20);
  assert.equal(clampDurationSec('abc', opts), 20);
  assert.equal(clampDurationSec(undefined, opts), 20);
  assert.equal(clampDurationSec(null, opts), 20);
});

test('clampDurationSec aceita strings numéricas (body JSON pode vir como string)', () => {
  assert.equal(clampDurationSec('45', { min: 5, max: 120, fallback: 20 }), 45);
});

// --- capText -----------------------------------------------------------------

test('capText devolve a string intacta abaixo do limite', () => {
  assert.equal(capText('abc', 10), 'abc');
});

test('capText trunca em maxChars', () => {
  assert.equal(capText('a'.repeat(50), 10), 'a'.repeat(10));
});

test('capText transforma não-strings em vazio', () => {
  assert.equal(capText(123, 10), '');
  assert.equal(capText(null, 10), '');
  assert.equal(capText(undefined, 10), '');
  assert.equal(capText({ text: 'x' }, 10), '');
});

// --- normalizeComplexity -----------------------------------------------------

test('normalizeComplexity preserva os dois valores válidos', () => {
  assert.equal(normalizeComplexity('facil'), 'facil');
  assert.equal(normalizeComplexity('dificil'), 'dificil');
});

test('normalizeComplexity default é dificil (comportamento atual do server)', () => {
  assert.equal(normalizeComplexity('FACIL'), 'dificil');
  assert.equal(normalizeComplexity('médio'), 'dificil');
  assert.equal(normalizeComplexity(undefined), 'dificil');
  assert.equal(normalizeComplexity(null), 'dificil');
  assert.equal(normalizeComplexity(42), 'dificil');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emaAlpha, RAW_V_EMA_TAU_MS, DISTANCE_EMA_TAU_MS } from './emaTiming';

test('emaAlpha reproduces the legacy per-frame alphas at 30fps', () => {
  // 0.98/0.02 do trilho âmbar a 33.3ms ⇒ τ ≈ 1650ms
  assert.ok(Math.abs(emaAlpha(100 / 3, RAW_V_EMA_TAU_MS) - 0.02) < 0.002);
  // 0.85/0.15 da distância a 33.3ms ⇒ τ ≈ 200ms
  assert.ok(Math.abs(emaAlpha(100 / 3, DISTANCE_EMA_TAU_MS) - 0.15) < 0.02);
});

test('emaAlpha halves responsiveness per step at 60fps vs 30fps', () => {
  const a60 = emaAlpha(100 / 6, RAW_V_EMA_TAU_MS);
  const a30 = emaAlpha(100 / 3, RAW_V_EMA_TAU_MS);
  assert.ok(a60 < a30 && a60 > a30 * 0.45 && a60 < a30 * 0.55);
});

test('same elapsed time converges the same regardless of frame rate', () => {
  // 1s de amostras constantes v=1 partindo de 0: 30 passos de 33.3ms × 60 de 16.7ms
  let ema30 = 0, ema60 = 0;
  for (let i = 0; i < 30; i++) ema30 += (1 - ema30) * emaAlpha(100 / 3, RAW_V_EMA_TAU_MS);
  for (let i = 0; i < 60; i++) ema60 += (1 - ema60) * emaAlpha(100 / 6, RAW_V_EMA_TAU_MS);
  assert.ok(Math.abs(ema30 - ema60) < 0.005);
});

test('emaAlpha guards non-positive dt', () => {
  assert.equal(emaAlpha(0, 1000), 0);
  assert.equal(emaAlpha(-16, 1000), 0);
});

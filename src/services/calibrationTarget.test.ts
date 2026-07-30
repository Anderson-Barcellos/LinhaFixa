import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGET_CORE_DEG,
  TARGET_START_DEG,
  CORE_PX_RANGE,
  CORE_PX_FALLBACK,
  targetSizing,
} from './calibrationTarget';

const START_SCALE = TARGET_START_DEG / TARGET_CORE_DEG;

test('targetSizing converte 0,6° em px no pxPerDeg dado', () => {
  // 26.6 px/° (≈40cm na referência CSS) → núcleo 15.96px, dentro da faixa
  const s = targetSizing(26.6);
  assert.ok(Math.abs(s.corePx - 26.6 * TARGET_CORE_DEG) < 1e-9);
  assert.equal(s.startScale, START_SCALE);
});

test('targetSizing clampa o núcleo à faixa visual utilizável', () => {
  assert.equal(targetSizing(10).corePx, CORE_PX_RANGE.min);   // 6px → floor 14
  assert.equal(targetSizing(100).corePx, CORE_PX_RANGE.max);  // 60px → cap 32
});

test('targetSizing sem pxPerDeg utilizável cai no fallback fixo', () => {
  for (const bad of [Number.NaN, 0, -5, Infinity]) {
    const s = targetSizing(bad);
    assert.equal(s.corePx, CORE_PX_FALLBACK);
    assert.equal(s.startScale, START_SCALE);
  }
});

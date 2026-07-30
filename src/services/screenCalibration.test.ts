import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_WIDTH_MM,
  MEASURED_PX_PER_CM_RANGE,
  pxPerCmFromCardWidthPx,
  sameScreenCalibrationKey,
  resolveScreenCalibration,
  activePxPerCm,
  type ScreenCalibration,
  type ScreenCalibrationKey,
} from './screenCalibration';
import { CSS_PX_PER_CM } from './viewingGeometry';

const KEY: ScreenCalibrationKey = {
  devicePixelRatio: 1.3375,
  screenWidth: 1080,
  screenHeight: 1920,
  orientation: 'portrait',
};

function calib(overrides: Partial<ScreenCalibration> = {}): ScreenCalibration {
  return { pxPerCm: 40, cardWidthPx: 342.4, measuredAt: 1_753_000_000_000, key: { ...KEY }, ...overrides };
}

test('pxPerCmFromCardWidthPx converte largura do cartão (85,60mm) em px/cm', () => {
  // 323.53 px / 8.56 cm = 37.795 px/cm (reproduz a referência CSS)
  const r = pxPerCmFromCardWidthPx(CSS_PX_PER_CM * (CARD_WIDTH_MM / 10));
  assert.ok(r != null && Math.abs(r - CSS_PX_PER_CM) < 1e-9);
});

test('pxPerCmFromCardWidthPx recusa medidas fora da faixa de sanidade', () => {
  // 100px → 11.68 px/cm (< min 20); 700px → 81.78 px/cm (> max 80)
  assert.equal(pxPerCmFromCardWidthPx(100), null);
  assert.equal(pxPerCmFromCardWidthPx(700), null);
  assert.equal(pxPerCmFromCardWidthPx(0), null);
  assert.equal(pxPerCmFromCardWidthPx(Number.NaN), null);
  // bordas inclusivas da faixa
  assert.ok(pxPerCmFromCardWidthPx(MEASURED_PX_PER_CM_RANGE.min * (CARD_WIDTH_MM / 10)) != null);
  assert.ok(pxPerCmFromCardWidthPx(MEASURED_PX_PER_CM_RANGE.max * (CARD_WIDTH_MM / 10)) != null);
});

test('sameScreenCalibrationKey: igualdade com tolerância só no dpr', () => {
  assert.equal(sameScreenCalibrationKey(KEY, { ...KEY }), true);
  assert.equal(sameScreenCalibrationKey(KEY, { ...KEY, devicePixelRatio: 1.33749999 }), true);
  assert.equal(sameScreenCalibrationKey(KEY, { ...KEY, devicePixelRatio: 1.25 }), false);
  assert.equal(sameScreenCalibrationKey(KEY, { ...KEY, screenWidth: 1440 }), false);
  assert.equal(sameScreenCalibrationKey(KEY, { ...KEY, orientation: 'landscape' }), false);
});

test('resolveScreenCalibration: chave casada devolve a medida; divergente invalida', () => {
  assert.equal(resolveScreenCalibration(null, KEY), null);
  const stored = calib();
  assert.equal(resolveScreenCalibration(stored, KEY), stored);
  assert.equal(resolveScreenCalibration(stored, { ...KEY, screenWidth: 1440 }), null);
});

test('resolveScreenCalibration: registro corrompido (pxPerCm fora da faixa) é descartado', () => {
  assert.equal(resolveScreenCalibration(calib({ pxPerCm: 10 }), KEY), null);
  assert.equal(resolveScreenCalibration(calib({ pxPerCm: Number.NaN }), KEY), null);
});

test('activePxPerCm sem ambiente de browser cai na referência CSS carimbada', () => {
  // Em Node (sem window/localStorage) o fallback é o comportamento de hoje, nunca pior.
  assert.deepEqual(activePxPerCm(), { pxPerCm: CSS_PX_PER_CM, source: 'css-reference' });
});

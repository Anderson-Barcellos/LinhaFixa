import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measuredSurfaceFromEntry, measuredSurfaceEquals } from './measuredSurface';

test('prefers devicePixelContentBoxSize when the browser provides it (Chromium)', () => {
  const m = measuredSurfaceFromEntry({
    devicePixelContentBoxSize: [{ inlineSize: 1071, blockSize: 1605 }],
    contentBoxSize: [{ inlineSize: 800.7, blockSize: 1200.4 }],
  }, 1.3375);

  assert.ok(m);
  assert.equal(m.devicePxWidth, 1071);   // px físicos exatos, sem meio-pixel
  assert.equal(m.devicePxHeight, 1605);
  assert.equal(m.cssWidth, 800.7);
  assert.equal(m.cssHeight, 1200.4);
  assert.equal(m.dpr, 1.3375);
});

test('falls back to contentBoxSize × dpr when device-pixel box is missing (Safari/iPhone)', () => {
  const m = measuredSurfaceFromEntry({
    contentBoxSize: [{ inlineSize: 800, blockSize: 1200 }],
  }, 1.3375);

  assert.ok(m);
  assert.equal(m.devicePxWidth, Math.round(800 * 1.3375));  // 1070
  assert.equal(m.devicePxHeight, Math.round(1200 * 1.3375)); // 1605
});

test('falls back to contentRect for older engines', () => {
  const m = measuredSurfaceFromEntry({ contentRect: { width: 320, height: 480 } }, 2);
  assert.ok(m);
  assert.equal(m.cssWidth, 320);
  assert.equal(m.devicePxWidth, 640);
});

test('returns null for an entry with no usable box and guards non-positive dpr', () => {
  assert.equal(measuredSurfaceFromEntry({}, 1), null);
  const m = measuredSurfaceFromEntry({ contentRect: { width: 100, height: 100 } }, 0);
  assert.ok(m);
  assert.equal(m.dpr, 1); // dpr inválido normaliza para 1
});

test('equality guard treats same values as equal and null asymmetries as different', () => {
  const a = measuredSurfaceFromEntry({ contentRect: { width: 100, height: 50 } }, 2);
  const b = measuredSurfaceFromEntry({ contentRect: { width: 100, height: 50 } }, 2);
  const c = measuredSurfaceFromEntry({ contentRect: { width: 101, height: 50 } }, 2);
  assert.equal(measuredSurfaceEquals(a, b), true);
  assert.equal(measuredSurfaceEquals(a, c), false);
  assert.equal(measuredSurfaceEquals(a, null), false);
  assert.equal(measuredSurfaceEquals(null, null), true);
});

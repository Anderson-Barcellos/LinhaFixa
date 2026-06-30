import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  interpupillaryPx,
  estimateDistanceCm,
  cssPxPerDeg,
  readingFontCssPx,
  readingFontAngleDeg,
  IRIS_LEFT,
  IRIS_RIGHT,
  type DistanceAnchor,
} from './viewingGeometry';

// Build a minimal landmark array with iris centers placed at given normalized x.
function meshWithIris(leftX: number, rightX: number, y = 0.5): { x: number; y: number }[] {
  const arr = Array.from({ length: IRIS_RIGHT + 1 }, () => ({ x: 0.5, y }));
  arr[IRIS_LEFT] = { x: leftX, y };
  arr[IRIS_RIGHT] = { x: rightX, y };
  return arr;
}

test('interpupillaryPx scales the normalized iris gap by image width', () => {
  const mesh = meshWithIris(0.6, 0.4); // 0.2 of width apart
  assert.ok(Math.abs(interpupillaryPx(mesh, 1280, 720)! - 0.2 * 1280) < 1e-6);
});

test('interpupillaryPx returns null without a full iris mesh', () => {
  assert.equal(interpupillaryPx(null, 1280, 720), null);
  assert.equal(interpupillaryPx([{ x: 0.5, y: 0.5 }], 1280, 720), null); // too short
});

test('estimateDistanceCm follows the pinhole inverse-IPD relation', () => {
  const anchor: DistanceAnchor = { distanceCm: 40, ipdPx: 200 };
  // Same IPD as anchor → same distance.
  assert.equal(estimateDistanceCm(200, anchor, 40), 40);
  // Half the IPD → twice as far.
  assert.equal(estimateDistanceCm(100, anchor, 40), 80);
  // Double the IPD → half as close.
  assert.equal(estimateDistanceCm(400, anchor, 40), 20);
});

test('estimateDistanceCm is monotonic: closer face (bigger IPD) → smaller distance', () => {
  const anchor: DistanceAnchor = { distanceCm: 50, ipdPx: 180 };
  const near = estimateDistanceCm(240, anchor, 50);
  const far = estimateDistanceCm(120, anchor, 50);
  assert.ok(near < far);
});

test('estimateDistanceCm clamps to the safe 20–120 cm range', () => {
  const anchor: DistanceAnchor = { distanceCm: 40, ipdPx: 200 };
  assert.equal(estimateDistanceCm(10, anchor, 40), 120);   // very far would exceed max
  assert.equal(estimateDistanceCm(10000, anchor, 40), 20); // very close would exceed min
});

test('estimateDistanceCm falls back to the profile distance without a usable anchor', () => {
  assert.equal(estimateDistanceCm(200, null, 45), 45);
  assert.equal(estimateDistanceCm(null, { distanceCm: 40, ipdPx: 200 }, 45), 45);
  assert.equal(estimateDistanceCm(0, { distanceCm: 40, ipdPx: 200 }, 45), 45);
});

test('cssPxPerDeg grows linearly with distance', () => {
  const at40 = cssPxPerDeg(40);
  const at80 = cssPxPerDeg(80);
  assert.ok(at40 > 0);
  assert.ok(Math.abs(at80 - 2 * at40) < 1e-9);
});

test('readingFontCssPx keeps the apparent size constant: px scales with distance', () => {
  const deg = readingFontAngleDeg('normal');
  const near = readingFontCssPx(deg, 40);
  const far = readingFontCssPx(deg, 80);
  // Twice the distance → twice the px for the same visual angle.
  assert.ok(Math.abs(far - 2 * near) < 1e-9);
});

test('readingFontCssPx reproduces the legacy fixed sizes at the 40 cm reference', () => {
  // Legacy: small 26, normal 32, large 40, huge 48 px. Angles were chosen to match
  // within rounding at 40 cm.
  assert.ok(Math.abs(readingFontCssPx(readingFontAngleDeg('normal'), 40) - 32) < 2);
  assert.ok(Math.abs(readingFontCssPx(readingFontAngleDeg('large'), 40) - 40) < 2);
});

test('readingFontAngleDeg falls back to normal for unknown prefs', () => {
  assert.equal(readingFontAngleDeg('bogus'), readingFontAngleDeg('normal'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confirmDeviceClass,
  defaultViewingDistanceCm,
  inferLegacyDeviceClass,
  resolveDeviceClass,
  suggestDeviceClass,
} from './deviceClass';

test('suggestion uses capabilities and shortest side, never orientation alone', () => {
  assert.equal(suggestDeviceClass({ width: 390, height: 844, maxTouchPoints: 5, coarsePointer: true }), 'phone');
  assert.equal(suggestDeviceClass({ width: 844, height: 390, maxTouchPoints: 5, coarsePointer: true }), 'phone');
  assert.equal(suggestDeviceClass({ width: 834, height: 1194, maxTouchPoints: 5, coarsePointer: true }), 'tablet');
  assert.equal(suggestDeviceClass({ width: 1024, height: 768, maxTouchPoints: 0, coarsePointer: false }), 'desktop');
});

test('a confirmed profile value wins over every heuristic', () => {
  assert.deepEqual(
    resolveDeviceClass(
      { deviceClass: 'desktop', deviceClassSource: 'confirmed' },
      { width: 390, height: 844, maxTouchPoints: 5, coarsePointer: true },
    ),
    { deviceClass: 'desktop', deviceClassSource: 'confirmed', trendEligible: true },
  );
});

test('an unconfirmed suggestion is explicit and cannot enter trends', () => {
  assert.deepEqual(
    resolveDeviceClass({}, { width: 834, height: 1194, maxTouchPoints: 5, coarsePointer: true }),
    { deviceClass: 'tablet', deviceClassSource: 'suggested', trendEligible: false },
  );
  assert.deepEqual(confirmDeviceClass('phone'), {
    deviceClass: 'phone',
    deviceClassSource: 'confirmed',
  });
});

test('each device class seeds its population-mean viewing distance', () => {
  // Distância assumida ancora a calibração do IPD e o fallback do stimulus-distance:
  // errar a média por classe enviesa a escala de TODA a medição angular subsequente.
  assert.equal(defaultViewingDistanceCm('phone'), 33);
  assert.equal(defaultViewingDistanceCm('tablet'), 45);
  assert.equal(defaultViewingDistanceCm('desktop'), 60);
});

test('an unknown device class falls back to the neutral default distance', () => {
  assert.equal(defaultViewingDistanceCm(undefined), 40);
});

test('legacy inference is conservative and never claims confirmation', () => {
  assert.deepEqual(inferLegacyDeviceClass({
    layoutMode: 'compact',
    viewport: { width: 390, height: 844 },
  }), { deviceClass: 'phone', deviceClassSource: 'legacy-inferred' });
  assert.deepEqual(inferLegacyDeviceClass({
    layoutMode: 'compact',
    viewport: { width: 834, height: 1194 },
  }), { deviceClass: 'tablet', deviceClassSource: 'legacy-inferred' });
  assert.deepEqual(inferLegacyDeviceClass({
    layoutMode: 'desktop',
    viewport: { width: 1440, height: 1024 },
  }), { deviceClass: 'desktop', deviceClassSource: 'legacy-inferred' });
  assert.equal(inferLegacyDeviceClass({
    layoutMode: 'compact',
    viewport: { width: 700, height: 700 },
  }), null);
});

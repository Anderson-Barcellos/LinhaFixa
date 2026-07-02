import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDiagnosticsSurface } from './captureGeometry';

test('computeDiagnosticsSurface constrains wide desktop reading area without using full viewport', () => {
  const surface = computeDiagnosticsSurface({
    viewportWidth: 1920,
    viewportHeight: 1080,
    layoutMode: 'desktop',
    panelWidth: 288,
    headerHeight: 73,
  });

  assert.equal(surface.mode, 'desktop');
  assert.equal(surface.width <= 1180, true);
  assert.equal(surface.height <= 760, true);
  assert.equal(surface.width >= 720, true);
  assert.equal(surface.height >= 420, true);
  assert.equal(surface.left > 0, true);
  assert.equal(surface.top > 73, true);
});

test('computeDiagnosticsSurface leaves compact/touch layout full available width', () => {
  const surface = computeDiagnosticsSurface({
    viewportWidth: 932,
    viewportHeight: 430,
    layoutMode: 'compact',
    panelWidth: 0,
    headerHeight: 64,
  });

  assert.equal(surface.mode, 'compact');
  assert.equal(surface.left, 0);
  assert.equal(surface.width, 932);
  assert.equal(surface.height, 366);
});

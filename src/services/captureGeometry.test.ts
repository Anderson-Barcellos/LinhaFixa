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

test('computeDiagnosticsSurface never overflows the dead band between desktop threshold and floor', () => {
  // Viewports 1024–1055 activate desktop mode but leave less than the 720px floor
  // after the panel; the surface must shrink to fit instead of clipping the panel.
  const surface = computeDiagnosticsSurface({
    viewportWidth: 1040,
    viewportHeight: 900,
    layoutMode: 'desktop',
    panelWidth: 336,
    headerHeight: 73,
  });

  assert.equal(surface.mode, 'desktop');
  assert.equal(surface.width <= 1040 - 336, true);
  assert.equal(surface.height <= 900 - 73, true);
  assert.equal(surface.width > 0, true);
});

test('computeDiagnosticsSurface never exceeds a short available height', () => {
  const surface = computeDiagnosticsSurface({
    viewportWidth: 1280,
    viewportHeight: 460,
    layoutMode: 'desktop',
    panelWidth: 336,
    headerHeight: 73,
  });

  assert.equal(surface.height <= 460 - 73, true);
  assert.equal(surface.width <= 1280 - 336, true);
});

test('computeDiagnosticsSurface uses the available height on a portrait desktop viewport', () => {
  // Vertical monitor (e.g. 1440×1920 physical at ~134% OS scale → 1077×1436 CSS).
  // Forcing the landscape 16:9 aspect here would produce a squat 741×420 strip and
  // waste the monitor's height; portrait must fill the column instead.
  const surface = computeDiagnosticsSurface({
    viewportWidth: 1077,
    viewportHeight: 1436,
    layoutMode: 'desktop',
    panelWidth: 336,
    headerHeight: 73,
  });

  assert.equal(surface.mode, 'desktop');
  assert.equal(surface.width, 1077 - 336);
  assert.equal(surface.height > surface.width, true);
  assert.equal(surface.height <= 1436 - 73, true);
});

test('computeDiagnosticsSurface caps portrait desktop height at the portrait ceiling', () => {
  const surface = computeDiagnosticsSurface({
    viewportWidth: 1100,
    viewportHeight: 2200,
    layoutMode: 'desktop',
    panelWidth: 336,
    headerHeight: 73,
  });

  assert.equal(surface.height <= 1280, true);
  assert.equal(surface.top > 73, true); // centered inside the leftover space
});

test('computeDiagnosticsSurface keeps the landscape behavior when width dominates', () => {
  const landscape = computeDiagnosticsSurface({
    viewportWidth: 1920,
    viewportHeight: 1080,
    layoutMode: 'desktop',
    panelWidth: 336,
    headerHeight: 73,
  });

  // Same clamps as before the portrait branch existed.
  assert.equal(landscape.width <= 1180, true);
  assert.equal(landscape.height <= 760, true);
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

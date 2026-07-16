import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDiagnosticsSurface } from './captureGeometry';

// Os casos históricos foram traduzidos: o que antes era viewport−panel−header
// agora chega como espaço MEDIDO (o flexbox já descontou painel, header, p-4 e
// safe-area — fonte do bug da caixa cortada no desktop portrait).

test('wide desktop fills the measured box up to the clamps', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 1632, // ex-1920 menos painel+gutter, agora medido
    availableHeight: 1007,
    layoutMode: 'desktop',
  });
  assert.equal(surface.mode, 'desktop');
  assert.equal(surface.width, 1180);
  assert.equal(surface.height, 1007);
});

test('shrinks to fit when the measured box is tighter than the desktop floor', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 704,  // dead band: menor que o floor de 720
    availableHeight: 827,
    layoutMode: 'desktop',
  });
  assert.equal(surface.mode, 'desktop');
  assert.equal(surface.width <= 704, true);
  assert.equal(surface.width > 0, true);
});

test('never exceeds a short measured height', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 944,
    availableHeight: 387,
    layoutMode: 'desktop',
  });
  assert.equal(surface.height, 387);
  assert.equal(surface.width, 944);
});

test('portrait desktop fills the measured column instead of forcing 16:9', () => {
  // Monitor vertical do caso real: 1077×1436 CSS de viewport → box medido menor.
  const surface = computeDiagnosticsSurface({
    availableWidth: 741,
    availableHeight: 1331,
    layoutMode: 'desktop',
  });
  assert.equal(surface.mode, 'desktop');
  assert.equal(surface.width, 741);
  assert.equal(surface.height, 1280);
});

test('caps portrait desktop height at the portrait ceiling', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 764,
    availableHeight: 2127,
    layoutMode: 'desktop',
  });
  assert.equal(surface.height, 1280);
});

test('pins both maxima exactly on an oversized box', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 2000,
    availableHeight: 1500,
    layoutMode: 'desktop',
  });
  assert.equal(surface.width, 1180);
  assert.equal(surface.height, 1280);
});

test('compact/touch layout takes the full measured box', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 932,
    availableHeight: 366,
    layoutMode: 'compact',
  });
  assert.equal(surface.mode, 'compact');
  assert.equal(surface.width, 932);
  assert.equal(surface.height, 366);
});

test('REGRESSION: surface never exceeds the measured box on any portrait geometry', () => {
  // Classe do bug original: a caixa computada excedia o espaço real e o CSS
  // cortava em silêncio. Com medidas reais isso é impossível por construção.
  for (const [w, h] of [[600, 900], [741, 1331], [800, 2400], [300, 500], [1080, 1920]]) {
    const s = computeDiagnosticsSurface({ availableWidth: w, availableHeight: h, layoutMode: 'desktop' });
    assert.equal(s.width <= w, true, `width ${s.width} > ${w}`);
    assert.equal(s.height <= h, true, `height ${s.height} > ${h}`);
  }
});

test('REGRESSION: no discontinuity crossing the square boundary (the 1181→664 jump)', () => {
  // Height no longer depends on width, so crossing the w≈h boundary must not
  // move the surface height at all — the old 16:9 coupling made it jump.
  for (const w of [900, 1050, 1099, 1101, 1250]) {
    const s = computeDiagnosticsSurface({ availableWidth: w, availableHeight: 1100, layoutMode: 'desktop' });
    assert.equal(s.height, 1100, `width ${w}: height ${s.height} !== 1100`);
  }
});

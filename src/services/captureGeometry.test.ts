import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDiagnosticsSurface } from './captureGeometry';

// Os casos históricos foram traduzidos: o que antes era viewport−panel−header
// agora chega como espaço MEDIDO (o flexbox já descontou painel, header, p-4 e
// safe-area — fonte do bug da caixa cortada no desktop portrait).

test('constrains wide desktop reading area without using the full measured box', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 1632, // ex-1920 menos painel+gutter, agora medido
    availableHeight: 1007,
    layoutMode: 'desktop',
  });
  assert.equal(surface.mode, 'desktop');
  assert.equal(surface.width <= 1180, true);
  assert.equal(surface.height <= 760, true);
  assert.equal(surface.width >= 720, true);
  assert.equal(surface.height >= 420, true);
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
  assert.equal(surface.height <= 387, true);
  assert.equal(surface.width <= 944, true);
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
  assert.equal(surface.height > surface.width, true);
  assert.equal(surface.height <= 1331, true);
});

test('caps portrait desktop height at the portrait ceiling', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 764,
    availableHeight: 2127,
    layoutMode: 'desktop',
  });
  assert.equal(surface.height <= 1280, true);
});

test('keeps the landscape clamps when width dominates', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 1584,
    availableHeight: 1007,
    layoutMode: 'desktop',
  });
  assert.equal(surface.width <= 1180, true);
  assert.equal(surface.height <= 760, true);
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

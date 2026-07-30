import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saccadesFromFixations, dispersionThresholdFor, dispersionThresholdForAngular } from './saccadesFromFixations';
import type { Fixation } from './fixationDetection';

function fix(tStart: number, tEnd: number, centroidH: number, centroidV = 0.5): Fixation {
  return {
    tStart,
    tEnd,
    durationMs: tEnd - tStart,
    centroidH,
    centroidV,
    sampleCount: Math.max(2, Math.round((tEnd - tStart) / 16.7)),
  };
}

test('duas fixações produzem uma sacada com a amplitude entre os centroides', () => {
  const saccades = saccadesFromFixations([fix(0, 250, 0.20), fix(300, 550, 0.50)]);
  assert.equal(saccades.length, 1);
  assert.ok(Math.abs(saccades[0].amplitude - 0.30) < 1e-9);
});

test('a sacada ocupa o intervalo entre o fim de uma fixação e o início da próxima', () => {
  const saccades = saccadesFromFixations([fix(0, 250, 0.20), fix(300, 550, 0.50)]);
  assert.equal(saccades[0].tStart, 250);
  assert.equal(saccades[0].tEnd, 300);
});

test('sacada para a esquerda tem amplitude negativa', () => {
  const saccades = saccadesFromFixations([fix(0, 250, 0.60), fix(300, 550, 0.25)]);
  assert.ok(saccades[0].amplitude < 0);
  assert.ok(Math.abs(saccades[0].amplitude + 0.35) < 1e-9);
});

test('N fixações produzem N-1 sacadas', () => {
  const fixations = [fix(0, 200, 0.1), fix(250, 450, 0.3), fix(500, 700, 0.5), fix(750, 950, 0.7)];
  assert.equal(saccadesFromFixations(fixations).length, 3);
});

test('deslocamento abaixo do piso de amplitude é ruído de centroide, não sacada', () => {
  // Duas fixações praticamente no mesmo lugar: o centroide oscila, o olho não saltou.
  const saccades = saccadesFromFixations([fix(0, 250, 0.400), fix(300, 550, 0.405)]);
  assert.equal(saccades.length, 0);
});

test('minAmplitude é respeitado como parâmetro', () => {
  const fixations = [fix(0, 250, 0.20), fix(300, 550, 0.26)];
  assert.equal(saccadesFromFixations(fixations, { minAmplitude: 0.04 }).length, 1);
  assert.equal(saccadesFromFixations(fixations, { minAmplitude: 0.10 }).length, 0);
});

test('menos de duas fixações não produz sacada', () => {
  assert.deepEqual(saccadesFromFixations([]), []);
  assert.deepEqual(saccadesFromFixations([fix(0, 250, 0.3)]), []);
});

// --- Limiar de dispersão auto-escalável ---
//
// O sinal chega em duas escalas muito diferentes: calibrado (fração do canvas,
// varre ~0..1) e bruto (razão íris/canto, comprime uma linha inteira em ~0.2).
// Um limiar fixo classificaria tudo como uma só fixação no sinal bruto. A escala
// é derivada do próprio capture, mesma estratégia que o line-return já usa.

test('limiar escala com o span do sinal', () => {
  const estreito = dispersionThresholdFor(0.20);
  const largo = dispersionThresholdFor(0.80);
  assert.ok(estreito < largo, `esperava ${estreito} < ${largo}`);
});

test('limiar respeita piso e teto', () => {
  assert.ok(dispersionThresholdFor(0.0001) >= 0.01);
  assert.ok(dispersionThresholdFor(100) <= 0.20);
});

test('span inválido cai no limiar padrão em vez de quebrar', () => {
  const fallback = dispersionThresholdFor(Number.NaN);
  assert.ok(Number.isFinite(fallback) && fallback > 0);
});

// --- Âncora angular (Task 4) ---
//
// A escala relativa acima faz do limiar uma função do span de cada captura —
// duas capturas, dois instrumentos. Quando há geometria (px/grau + largura do
// canvas), 1,08° (Blignaut 2009) ancora o limiar em graus, comparável entre
// capturas da mesma pessoa.

test('dispersionThresholdForAngular: converte 1,08° para fração de canvas', () => {
  // 40 px/deg num canvas de 800px: 1.08 * 40 / 800 = 0.054
  const threshold = dispersionThresholdForAngular(40, 800);
  assert.ok(Math.abs(threshold - 0.054) < 1e-9, `esperava ≈0.054, obteve ${threshold}`);
});

test('dispersionThresholdForAngular: clamp defensivo no cap para geometria degenerada', () => {
  assert.ok(dispersionThresholdForAngular(400, 100) <= 0.20);
});

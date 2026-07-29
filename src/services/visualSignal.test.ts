import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeFunctionalVisualSignal, type VisualSignalSample } from './visualSignal';

test('summarizeFunctionalVisualSignal reports no useful capture with sparse samples', () => {
  const summary = summarizeFunctionalVisualSignal([{ t: 0, h: 0.5, v: 0.5 }]);

  assert.equal(summary.status, 'sem-sinal');
  assert.equal(summary.label, 'Sem sinal útil');
  assert.equal(summary.sensitivityScore, 0);
  assert.equal(summary.lineReturnCandidate, false);
});

test('summarizeFunctionalVisualSignal recognizes useful horizontal reading movement', () => {
  const samples: VisualSignalSample[] = [
    { t: 0, h: 0.18, v: 0.48, calibrated: true },
    { t: 120, h: 0.19, v: 0.48, calibrated: true },
    { t: 240, h: 0.40, v: 0.49, calibrated: true },
    { t: 360, h: 0.41, v: 0.49, calibrated: true },
    { t: 480, h: 0.68, v: 0.50, calibrated: true },
    { t: 600, h: 0.69, v: 0.50, calibrated: true },
  ];

  const summary = summarizeFunctionalVisualSignal(samples, { coverage: 92 });

  assert.equal(summary.status, 'adequado');
  assert.equal(summary.label, 'Captação útil');
  assert.equal(summary.sourceLabel, 'Calibrado');
  assert.ok(summary.horizontalRange >= 0.5);
  assert.ok(summary.fixationShare >= 30);
  assert.ok(summary.sensitivityScore >= 70);
  assert.equal(summary.lineReturnCandidate, false);
});

// Emite um platô de fixação (~30ms de passo) e devolve o t do fim.
function plateau(samples: VisualSignalSample[], tStart: number, ms: number, h: number, v: number): number {
  for (let t = tStart; t < tStart + ms; t += 33) samples.push({ t, h, v, calibrated: true });
  return tStart + ms;
}

test('summarizeFunctionalVisualSignal separates broad line return from short regression', () => {
  const samples: VisualSignalSample[] = [];
  let t = 0;
  t = plateau(samples, t, 250, 0.22, 0.42);
  t = plateau(samples, t, 250, 0.40, 0.42); // progressiva +0.18
  t = plateau(samples, t, 250, 0.58, 0.42); // progressiva +0.18
  t = plateau(samples, t, 250, 0.50, 0.42); // regressão curta −0.08: NÃO é retorno
  t = plateau(samples, t, 250, 0.86, 0.43); // progressiva +0.36
  t = plateau(samples, t, 250, 0.18, 0.61); // retorno de linha −0.68 com queda de linha
  plateau(samples, t, 250, 0.34, 0.61);     // progressiva +0.16

  const summary = summarizeFunctionalVisualSignal(samples, { coverage: 88 });

  // Mediana progressiva 0.18 → limiar adaptativo = min(0.35, 3×0.18) = 0.35:
  // |−0.68| cruza (retorno); |−0.08| não (regressão curta) — a separação que
  // o teste antigo provava por delta único agora é provada por sacada derivada.
  assert.equal(summary.lineReturnCandidate, true);
  assert.match(summary.eventLabel, /retorno de linha/i);
});

// Trajetória de leitura contínua no tempo: fixações de 250ms ligadas por
// sacadas com DURAÇÃO FÍSICA (50ms de rampa linear — uma sacada real leva
// 30-80ms). É a duração que expõe o defeito por-amostra: a 60fps a rampa se
// divide em ~3 frames e nenhum delta individual cruza o corte antigo de -0.35.
const TRAJECTORY_KEYS = [
  { t: 0, h: 0.15, v: 0.30 }, { t: 250, h: 0.15, v: 0.30 },
  { t: 300, h: 0.30, v: 0.30 }, { t: 550, h: 0.30, v: 0.30 },
  { t: 600, h: 0.45, v: 0.30 }, { t: 850, h: 0.45, v: 0.30 },
  { t: 900, h: 0.60, v: 0.30 }, { t: 1150, h: 0.60, v: 0.30 },
  { t: 1200, h: 0.75, v: 0.30 }, { t: 1450, h: 0.75, v: 0.30 },
  // retorno de linha: -0.60 em h com queda de linha em v, na mesma rampa de 50ms
  { t: 1500, h: 0.15, v: 0.45 }, { t: 1750, h: 0.15, v: 0.45 },
  { t: 1800, h: 0.30, v: 0.45 }, { t: 2050, h: 0.30, v: 0.45 },
  { t: 2100, h: 0.45, v: 0.45 }, { t: 2350, h: 0.45, v: 0.45 },
];

function readingTrajectory(tMs: number): { h: number; v: number } {
  for (let i = 1; i < TRAJECTORY_KEYS.length; i++) {
    const a = TRAJECTORY_KEYS[i - 1], b = TRAJECTORY_KEYS[i];
    if (tMs <= b.t) {
      const f = b.t === a.t ? 0 : (tMs - a.t) / (b.t - a.t);
      return { h: a.h + (b.h - a.h) * f, v: a.v + (b.v - a.v) * f };
    }
  }
  const last = TRAJECTORY_KEYS[TRAJECTORY_KEYS.length - 1];
  return { h: last.h, v: last.v };
}

function sampleAt(fps: number): VisualSignalSample[] {
  const dt = 1000 / fps;
  const out: VisualSignalSample[] = [];
  for (let t = 0; t < 2350; t += dt) {
    const p = readingTrajectory(t);
    out.push({ t, h: p.h, v: p.v });
  }
  return out;
}

test('mesma leitura a 30 e 60fps: hint de retorno de linha e oscilação idênticos, fixationShare ≤ 5pp', () => {
  const s30 = summarizeFunctionalVisualSignal(sampleAt(30));
  const s60 = summarizeFunctionalVisualSignal(sampleAt(60));
  // Antes da migração este par diverge categoricamente: a 60fps nenhum delta
  // individual cruza LINE_RETURN_DH = -0.35 (o salto se divide em dois frames).
  assert.equal(s30.lineReturnCandidate, true);
  assert.equal(s60.lineReturnCandidate, true);
  assert.ok(Math.abs(s30.fixationShare - s60.fixationShare) <= 5);
  assert.equal(s30.status, s60.status);
});

test('fixationShare é fração de TEMPO em fixação, não de intervalos', () => {
  // 8 fixações de ~250ms num total de 2100ms ⇒ share alto (>70) nas duas taxas.
  const s = summarizeFunctionalVisualSignal(sampleAt(30));
  assert.ok(s.fixationShare > 70, `share=${s.fixationShare}`);
});

test('summarizeFunctionalVisualSignal preserves fractional sample rate evidence', () => {
  for (const rate of [23.5, 23.99, 44.5, 44.99, 24, 45]) {
    const durationMs = (12 / rate) * 1000;
    const samples = Array.from({ length: 13 }, (_, index) => ({
      t: (durationMs / 12) * index,
      h: 0.2 + index * 0.02,
      v: 0.5,
      calibrated: true,
    }));

    const summary = summarizeFunctionalVisualSignal(samples);
    assert.ok(Math.abs(summary.sampleRateHz - rate) < 1e-9, `rate ${rate}`);
  }
});

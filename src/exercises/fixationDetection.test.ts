import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFixations, dispersion } from './fixationDetection';
import type { GazeSample } from '@/types';

// Builds a sample series at a given rate so the same eye behaviour can be
// replayed at 30fps and 60fps and compared.
function samplesAt(
  fps: number,
  segments: Array<{ durationMs: number; h: number; v?: number; jitter?: number }>,
): GazeSample[] {
  const dt = 1000 / fps;
  const out: GazeSample[] = [];
  let t = 0;
  let i = 0;
  for (const seg of segments) {
    const end = t + seg.durationMs;
    while (t < end) {
      // Deterministic alternating jitter: no Math.random, so tests are stable.
      const wobble = seg.jitter ? (i % 2 === 0 ? seg.jitter : -seg.jitter) : 0;
      out.push({ t, h: seg.h + wobble, v: (seg.v ?? 0.5) + wobble });
      t += dt;
      i++;
    }
  }
  return out;
}

test('dispersion soma as amplitudes horizontal e vertical', () => {
  const samples: GazeSample[] = [
    { t: 0, h: 0.10, v: 0.20 },
    { t: 10, h: 0.14, v: 0.25 },
    { t: 20, h: 0.12, v: 0.22 },
  ];
  // (0.14-0.10) + (0.25-0.20) = 0.04 + 0.05
  assert.ok(Math.abs(dispersion(samples) - 0.09) < 1e-9);
});

test('uma fixação estável vira exatamente uma fixação', () => {
  const samples = samplesAt(60, [{ durationMs: 300, h: 0.3, jitter: 0.002 }]);
  const fixations = detectFixations(samples, { dispersionThreshold: 0.05 });
  assert.equal(fixations.length, 1);
  assert.ok(Math.abs(fixations[0].centroidH - 0.3) < 0.01);
  assert.ok(fixations[0].durationMs >= 250);
});

test('duas fixações separadas por um salto viram duas fixações', () => {
  const samples = samplesAt(60, [
    { durationMs: 250, h: 0.20, jitter: 0.002 },
    { durationMs: 250, h: 0.60, jitter: 0.002 },
  ]);
  const fixations = detectFixations(samples, { dispersionThreshold: 0.05 });
  assert.equal(fixations.length, 2);
  assert.ok(fixations[0].centroidH < fixations[1].centroidH);
});

test('movimento contínuo sem parada não produz fixação', () => {
  // Drift atravessando toda a tela: nunca fica estável dentro do limiar.
  const dt = 1000 / 60;
  const samples: GazeSample[] = [];
  for (let i = 0; i < 60; i++) samples.push({ t: i * dt, h: i * 0.02, v: 0.5 });
  const fixations = detectFixations(samples, { dispersionThreshold: 0.05 });
  assert.equal(fixations.length, 0);
});

test('parada curta demais não conta como fixação', () => {
  // 60ms abaixo do mínimo padrão de 100ms.
  const samples = samplesAt(60, [
    { durationMs: 60, h: 0.20, jitter: 0.001 },
    { durationMs: 300, h: 0.70, jitter: 0.001 },
  ]);
  const fixations = detectFixations(samples, { dispersionThreshold: 0.05 });
  assert.equal(fixations.length, 1);
  assert.ok(fixations[0].centroidH > 0.5);
});

test('minDurationMs é respeitado como parâmetro', () => {
  const samples = samplesAt(60, [{ durationMs: 150, h: 0.4, jitter: 0.001 }]);
  assert.equal(detectFixations(samples, { dispersionThreshold: 0.05, minDurationMs: 100 }).length, 1);
  assert.equal(detectFixations(samples, { dispersionThreshold: 0.05, minDurationMs: 400 }).length, 0);
});

test('gap de rastreio encerra a fixação em vez de atravessá-la', () => {
  // Duas paradas na MESMA posição, separadas por 500ms sem amostra: são duas
  // fixações, não uma longa — o olho pode ter ido a qualquer lugar no buraco.
  const dt = 1000 / 60;
  const samples: GazeSample[] = [];
  for (let i = 0; i < 12; i++) samples.push({ t: i * dt, h: 0.3, v: 0.5 });
  for (let i = 0; i < 12; i++) samples.push({ t: 500 + i * dt, h: 0.3, v: 0.5 });
  const fixations = detectFixations(samples, { dispersionThreshold: 0.05, maxGapMs: 200 });
  assert.equal(fixations.length, 2);
});

test('amostras não finitas são descartadas sem quebrar a detecção', () => {
  const samples: GazeSample[] = [
    ...samplesAt(60, [{ durationMs: 200, h: 0.25, jitter: 0.001 }]),
    { t: 210, h: Number.NaN, v: 0.5 },
    { t: 220, h: 0.25, v: Number.POSITIVE_INFINITY },
  ];
  const fixations = detectFixations(samples, { dispersionThreshold: 0.05 });
  assert.equal(fixations.length, 1);
});

test('série vazia ou curta devolve lista vazia', () => {
  assert.deepEqual(detectFixations([], { dispersionThreshold: 0.05 }), []);
  assert.deepEqual(detectFixations([{ t: 0, h: 0.3, v: 0.5 }], { dispersionThreshold: 0.05 }), []);
});

// --- O teste que o I-VT nunca teve: o mesmo olho, duas taxas de amostragem. ---

test('mesma leitura a 30fps e 60fps produz as mesmas fixações', () => {
  const behaviour = [
    { durationMs: 250, h: 0.15, jitter: 0.002 },
    { durationMs: 250, h: 0.35, jitter: 0.002 },
    { durationMs: 250, h: 0.55, jitter: 0.002 },
    { durationMs: 250, h: 0.75, jitter: 0.002 },
  ];
  const at30 = detectFixations(samplesAt(30, behaviour), { dispersionThreshold: 0.05 });
  const at60 = detectFixations(samplesAt(60, behaviour), { dispersionThreshold: 0.05 });

  assert.equal(at30.length, 4);
  assert.equal(at60.length, at30.length);
  for (let i = 0; i < at30.length; i++) {
    assert.ok(
      Math.abs(at30[i].centroidH - at60[i].centroidH) < 0.01,
      `centroide ${i} divergiu: ${at30[i].centroidH} vs ${at60[i].centroidH}`,
    );
    assert.ok(
      Math.abs(at30[i].durationMs - at60[i].durationMs) < 40,
      `duração ${i} divergiu: ${at30[i].durationMs} vs ${at60[i].durationMs}`,
    );
  }
});

test('sacada sub-frame não escapa: o salto entre fixações é visto nas duas taxas', () => {
  // Uma sacada de 40ms é 1-2 amostras a 30fps e 2-3 a 60fps. O I-VT dependia de
  // medir a velocidade DENTRO dela; aqui ela aparece como a separação entre duas
  // fixações, que ambas as taxas resolvem.
  const behaviour = [
    { durationMs: 220, h: 0.20, jitter: 0.002 },
    { durationMs: 40, h: 0.40 },
    { durationMs: 220, h: 0.60, jitter: 0.002 },
  ];
  const at30 = detectFixations(samplesAt(30, behaviour), { dispersionThreshold: 0.05 });
  const at60 = detectFixations(samplesAt(60, behaviour), { dispersionThreshold: 0.05 });
  assert.equal(at30.length, 2);
  assert.equal(at60.length, 2);
  const jump30 = at30[1].centroidH - at30[0].centroidH;
  const jump60 = at60[1].centroidH - at60[0].centroidH;
  assert.ok(Math.abs(jump30 - jump60) < 0.02, `salto divergiu: ${jump30} vs ${jump60}`);
});

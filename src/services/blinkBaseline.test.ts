import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBlinkBaselineMeter,
  commitBlinkBaselineSnapshot,
  commitDerivedBlinkThresholds,
  getBlinkBaselineSnapshot,
  getDerivedBlinkThresholds,
  resetDerivedBlinkThresholds,
  BLINK_ENTER_GAP,
  MIN_BASELINE_SAMPLES,
} from './blinkBaseline';

// Distribuição realista do repouso do Anders: corpo em ~0.27-0.31, cauda de
// oscilação em 0.34, e alguns picos de piscada real que a mediana deve ignorar.
function observeAndersBaseline(meter: ReturnType<typeof createBlinkBaselineMeter>) {
  const body = [0.27, 0.29, 0.29, 0.31];
  for (let i = 0; i < 80; i++) meter.observe(body[i % body.length]);
  for (let i = 0; i < 15; i++) meter.observe(0.34);
  for (let i = 0; i < 5; i++) meter.observe(0.9); // piscadas dentro da janela
}

test('deriva exit acima do baseline e enter com histerese completa', () => {
  const meter = createBlinkBaselineMeter();
  observeAndersBaseline(meter);
  const t = meter.derive();
  assert.ok(t, 'com 100 amostras a derivação deve convergir');
  // p50 = 0.29, p90 = 0.34 → spread 0.05: exit = 0.34 (ACIMA do repouso — correção de P3)
  assert.ok(Math.abs(t.exit - 0.34) < 1e-9);
  // enter = max(exit + gap, floor) = max(0.49, 0.45) = 0.49
  assert.ok(Math.abs(t.enter - 0.49) < 1e-9);
  assert.ok(t.enter - t.exit >= BLINK_ENTER_GAP - 1e-9);
});

test('amostras insuficientes derivam null (fallback nos limiares fixos)', () => {
  const meter = createBlinkBaselineMeter();
  for (let i = 0; i < MIN_BASELINE_SAMPLES - 1; i++) meter.observe(0.29);
  assert.equal(meter.derive(), null);
});

test('baseline alto demais deriva null em vez de um exit clampado enganoso', () => {
  // Repouso em 0.45: exit bruto = 0.50 > teto 0.45. Clampar fingiria um gate
  // válido para um sinal que o contrato não cobre — a resposta honesta é fallback.
  const meter = createBlinkBaselineMeter();
  for (let i = 0; i < 100; i++) meter.observe(0.45);
  assert.equal(meter.derive(), null);
});

test('null e não-finito são ignorados; reset limpa tudo', () => {
  const meter = createBlinkBaselineMeter();
  meter.observe(null);
  meter.observe(Number.NaN);
  assert.equal(meter.sampleCount(), 0);
  observeAndersBaseline(meter);
  meter.reset();
  assert.equal(meter.sampleCount(), 0);
  assert.equal(meter.derive(), null);
});

test('contaminação moderada de piscadas não arrasta a derivação', () => {
  const meter = createBlinkBaselineMeter();
  // ~8% de frames de piscada na janela: p50 e p90 ficam no repouso.
  for (let i = 0; i < 92; i++) meter.observe(0.1);
  for (let i = 0; i < 8; i++) meter.observe(0.95);
  const t = meter.derive();
  assert.ok(t, 'contaminação leve não pode derrubar a derivação');
  // baseline 0.1, spread 0 → margem mínima: exit 0.15; enter sobe ao floor 0.45.
  assert.ok(Math.abs(t.exit - 0.15) < 1e-9);
  assert.ok(Math.abs(t.enter - 0.45) < 1e-9);
});

test('janela dominada por piscadas recusa a derivação (fallback)', () => {
  const meter = createBlinkBaselineMeter();
  // 40% de piscada: p90 cai no cluster de piscada, o spread explode e o exit
  // sai da faixa. Um settle assim não descreve repouso — derivar seria mentir.
  for (let i = 0; i < 60; i++) meter.observe(0.1);
  for (let i = 0; i < 40; i++) meter.observe(0.95);
  assert.equal(meter.derive(), null);
});

test('snapshot expõe a medição junto com a derivação', () => {
  const meter = createBlinkBaselineMeter();
  observeAndersBaseline(meter);
  const s = meter.snapshot();
  assert.equal(s.sampleCount, 100);
  assert.ok(Math.abs((s.baseline ?? 0) - 0.29) < 1e-9);
  assert.ok(Math.abs((s.p90 ?? 0) - 0.34) < 1e-9);
  assert.deepEqual(s.derived, meter.derive());
});

test('snapshot preserva a medição mesmo quando a derivação é recusada', () => {
  // Repouso em 0.45 recusa a derivação (exit fora da faixa) — mas o número
  // medido é exatamente a evidência de diagnóstico que precisa sobreviver.
  const meter = createBlinkBaselineMeter();
  for (let i = 0; i < 100; i++) meter.observe(0.45);
  const s = meter.snapshot();
  assert.equal(s.derived, null);
  assert.equal(s.sampleCount, 100);
  assert.ok(Math.abs((s.baseline ?? 0) - 0.45) < 1e-9);
});

test('snapshot do meter vazio devolve nulls e n=0', () => {
  const s = createBlinkBaselineMeter().snapshot();
  assert.deepEqual(s, { sampleCount: 0, baseline: null, p90: null, derived: null });
});

test('store: snapshot commitado alimenta getDerivedBlinkThresholds e sobrevive à recusa', () => {
  resetDerivedBlinkThresholds();
  assert.equal(getBlinkBaselineSnapshot(), null);
  commitBlinkBaselineSnapshot({ sampleCount: 100, baseline: 0.29, p90: 0.34, derived: { enter: 0.49, exit: 0.34 } });
  assert.deepEqual(getDerivedBlinkThresholds(), { enter: 0.49, exit: 0.34 });
  assert.equal(getBlinkBaselineSnapshot()?.baseline, 0.29);
  // Derivação recusada: gate cai no fixo, mas a medição continua visível.
  commitBlinkBaselineSnapshot({ sampleCount: 100, baseline: 0.45, p90: 0.45, derived: null });
  assert.equal(getDerivedBlinkThresholds(), null);
  assert.equal(getBlinkBaselineSnapshot()?.baseline, 0.45);
  resetDerivedBlinkThresholds();
  assert.equal(getBlinkBaselineSnapshot(), null);
});

test('store: commit publica, null e reset restauram o default', () => {
  resetDerivedBlinkThresholds();
  assert.equal(getDerivedBlinkThresholds(), null);
  commitDerivedBlinkThresholds({ enter: 0.49, exit: 0.34 });
  assert.deepEqual(getDerivedBlinkThresholds(), { enter: 0.49, exit: 0.34 });
  commitDerivedBlinkThresholds(null);
  assert.equal(getDerivedBlinkThresholds(), null);
  commitDerivedBlinkThresholds({ enter: 0.49, exit: 0.34 });
  resetDerivedBlinkThresholds();
  assert.equal(getDerivedBlinkThresholds(), null);
});

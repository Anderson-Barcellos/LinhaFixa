import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeReadingDynamics } from './readingDynamics';
import { SaccadeMetrics } from '@/types';

const baseMetrics: SaccadeMetrics = {
  trackingAvailable: true,
  samplesValid: 1800,
  signalSource: 'calibrated-mediapipe',
  sampleRateHz: 60,
  saccadeCount: 24,
  regressionCount: 6,
  meanSaccadeAmplitude: 0.18,
  meanFixationMs: 420,
};

test('summarizeReadingDynamics frames valid webcam data as ocular dynamics, not exact word position', () => {
  const summary = summarizeReadingDynamics(baseMetrics, 94);

  assert.equal(summary.signalLabel, 'Sinal temporal consistente');
  assert.equal(summary.positionLabel, 'Posição textual aproximada');
  assert.match(summary.primaryInsight, /24 sacadas/);
  assert.match(summary.primaryInsight, /6 regressões/);
  assert.match(summary.primaryInsight, /420 ms/);
  assert.equal(summary.signalQuality.grade, 'comparavel');
  assert.match(summary.confidenceNote, /movimento relativo/);
});

test('summarizeReadingDynamics reports limited signal when tracking is unavailable', () => {
  const summary = summarizeReadingDynamics({ ...baseMetrics, trackingAvailable: false, samplesValid: 3 }, 15);

  assert.equal(summary.signalLabel, 'Sinal insuficiente');
  assert.equal(summary.positionLabel, 'Sem leitura confiável');
  assert.equal(summary.signalQuality.grade, 'baixo-sinal');
  assert.match(summary.primaryInsight, /Não houve amostras suficientes/);
});

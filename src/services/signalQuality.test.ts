import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeSaccadeSignalQuality } from './signalQuality';
import { SaccadeMetrics } from '@/types';

const baseMetrics: SaccadeMetrics = {
  trackingAvailable: true,
  samplesValid: 420,
  signalSource: 'calibrated-mediapipe',
  sampleRateHz: 58,
  saccadeCount: 24,
  regressionCount: 4,
  meanSaccadeAmplitude: 0.13,
  meanFixationMs: 390,
};

test('summarizeSaccadeSignalQuality marks dense calibrated signal as comparable', () => {
  const quality = summarizeSaccadeSignalQuality(baseMetrics, { coverage: 92, calibrated: true });

  assert.equal(quality.grade, 'comparavel');
  assert.equal(quality.label, 'Comparável');
  assert.equal(quality.sourceLabel, 'Calibrado');
  assert.equal(quality.sampleRateLabel, '58 Hz');
  assert.match(quality.detail, /420 amostras/);
  assert.match(quality.detail, /92% cobertura/);
});

test('summarizeSaccadeSignalQuality keeps raw signal exploratory even with many samples', () => {
  const quality = summarizeSaccadeSignalQuality(
    { ...baseMetrics, signalSource: 'raw-mediapipe' },
    { coverage: 90, calibrated: false }
  );

  assert.equal(quality.grade, 'exploratorio');
  assert.equal(quality.label, 'Exploratório');
  assert.equal(quality.sourceLabel, 'Bruto');
  assert.match(quality.detail, /sinal bruto/);
});

test('summarizeSaccadeSignalQuality requires measured coverage and rate for comparable signal', () => {
  const quality = summarizeSaccadeSignalQuality(
    { ...baseMetrics, sampleRateHz: undefined },
    { calibrated: true }
  );

  assert.equal(quality.grade, 'exploratorio');
  assert.equal(quality.label, 'Exploratório');
  assert.match(quality.detail, /metadado ausente/);
});

test('summarizeSaccadeSignalQuality marks unavailable or sparse signal as low signal', () => {
  const quality = summarizeSaccadeSignalQuality(
    { ...baseMetrics, trackingAvailable: false, samplesValid: 3, signalSource: 'unavailable' },
    { coverage: 20, calibrated: false }
  );

  assert.equal(quality.grade, 'baixo-sinal');
  assert.equal(quality.label, 'Baixo sinal');
  assert.equal(quality.sourceLabel, 'Indisponível');
});

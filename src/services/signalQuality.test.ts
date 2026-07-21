import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeSaccadeSignalQuality } from './signalQuality';
import { SaccadeMetrics } from '@/types';
import { assessCaptureValidity, type CaptureValidityInput } from './captureValidity';

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

const validityInput = (overrides: Partial<CaptureValidityInput> = {}): CaptureValidityInput => ({
  assessedAt: 1_000,
  durationMs: 20_000,
  coverage: 80,
  signalSource: 'calibrated-mediapipe',
  selectedSourceRatio: 0.9,
  sampleRateHz: 45,
  calibrationAccepted: true,
  calibrationCompatible: true,
  deviceClassConfirmed: true,
  gapCount: 0,
  interruption: null,
  ...overrides,
});

test('summarizeSaccadeSignalQuality marks dense calibrated signal as comparable', () => {
  const quality = summarizeSaccadeSignalQuality(baseMetrics, {
    coverage: 92,
    calibrated: true,
    validity: assessCaptureValidity(validityInput({ coverage: 92, sampleRateHz: 58 })),
  });

  assert.equal(quality.grade, 'comparavel');
  assert.equal(quality.label, 'Comparável');
  assert.equal(quality.sourceLabel, 'Calibrado');
  assert.equal(quality.sampleRateLabel, '58 Hz');
  assert.equal(quality.detail, 'Captura apta para comparação');
  assert.equal(quality.coverageLabel, '92% cobertura');
});

test('summarizeSaccadeSignalQuality keeps stable 30 Hz captures exploratory under validity v1', () => {
  const quality = summarizeSaccadeSignalQuality(
    { ...baseMetrics, samplesValid: 601, sampleRateHz: 30 },
    {
      coverage: 100,
      calibrated: true,
      validity: assessCaptureValidity(validityInput({ sampleRateHz: 30 })),
    }
  );

  assert.equal(quality.grade, 'exploratorio');
  assert.equal(quality.label, 'Exploratória');
  assert.equal(quality.sampleRateLabel, '30 Hz');
});

test('summarizeSaccadeSignalQuality presents invalid and interrupted snapshots without heuristic promotion', () => {
  const quality = summarizeSaccadeSignalQuality(baseMetrics, {
    coverage: 100,
    calibrated: true,
    validity: assessCaptureValidity(validityInput({ interruption: 'page-hidden-during-capture' })),
  });

  assert.equal(quality.grade, 'baixo-sinal');
  assert.equal(quality.label, 'Inválida');
  assert.equal(quality.tone, 'rose');
  assert.equal(quality.detail, 'Captura não utilizável — a página perdeu visibilidade');
});

test('summarizeSaccadeSignalQuality treats an explicitly legacy capture as exploratory', () => {
  const quality = summarizeSaccadeSignalQuality(baseMetrics, {
    coverage: 100,
    calibrated: true,
    validity: undefined,
  });

  assert.equal(quality.grade, 'exploratorio');
  assert.equal(quality.label, 'Exploratória');
  assert.equal(quality.tone, 'amber');
  assert.equal(quality.sourceLabel, 'Calibrado');
  assert.match(quality.detail, /legada sem avaliação de validade/i);
});

test('summarizeSaccadeSignalQuality defaults missing validity to legacy exploratory evidence', () => {
  const quality = summarizeSaccadeSignalQuality(baseMetrics, { coverage: 100, calibrated: true });

  assert.equal(quality.grade, 'exploratorio');
  assert.equal(quality.label, 'Exploratória');
  assert.match(quality.detail, /legada sem avaliação de validade/i);
});

test('summarizeSaccadeSignalQuality permits heuristic promotion only in explicit live-preview mode', () => {
  const highRate = summarizeSaccadeSignalQuality(baseMetrics, {
    coverage: 100,
    calibrated: true,
    mode: 'live-preview',
  });
  const coarseRate = summarizeSaccadeSignalQuality(
    { ...baseMetrics, sampleRateHz: 30, samplesValid: 900 },
    { coverage: 100, calibrated: true, mode: 'live-preview' },
  );

  assert.equal(highRate.grade, 'comparavel');
  assert.equal(coarseRate.grade, 'exploratorio');
});

test('summarizeSaccadeSignalQuality keeps raw signal exploratory even with many samples', () => {
  const quality = summarizeSaccadeSignalQuality(
    { ...baseMetrics, signalSource: 'raw-mediapipe' },
    {
      coverage: 90,
      calibrated: false,
      validity: assessCaptureValidity(validityInput({
        signalSource: 'raw-mediapipe',
        calibrationAccepted: false,
      })),
    }
  );

  assert.equal(quality.grade, 'exploratorio');
  assert.equal(quality.label, 'Exploratória');
  assert.equal(quality.sourceLabel, 'Bruto');
  assert.equal(quality.detail, 'Calibração aceita indisponível');
});

test('summarizeSaccadeSignalQuality requires measured coverage and rate for comparable signal', () => {
  const quality = summarizeSaccadeSignalQuality(
    { ...baseMetrics, sampleRateHz: undefined },
    { calibrated: true, mode: 'live-preview' }
  );

  assert.equal(quality.grade, 'exploratorio');
  assert.equal(quality.label, 'Exploratório');
  assert.match(quality.detail, /metadado ausente/);
});

test('summarizeSaccadeSignalQuality marks unavailable or sparse signal as low signal', () => {
  const quality = summarizeSaccadeSignalQuality(
    { ...baseMetrics, trackingAvailable: false, samplesValid: 3, signalSource: 'unavailable' },
    {
      coverage: 20,
      calibrated: false,
      validity: assessCaptureValidity(validityInput({
        coverage: 20,
        signalSource: 'unavailable',
        selectedSourceRatio: null,
        sampleRateHz: null,
        calibrationAccepted: false,
      })),
    }
  );

  assert.equal(quality.grade, 'baixo-sinal');
  assert.equal(quality.label, 'Inválida');
  assert.equal(quality.sourceLabel, 'Indisponível');
});

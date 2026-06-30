import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOcularReadingSeries, buildStatisticsSummary } from './statisticsSummary';
import { SessionResult, ValidationCapture } from '@/types';

const baseSymptoms = {
  dorOcular: 2,
  cefaleia: 1,
  visaoDupla: 0,
  tontura: 1,
  nausea: 0,
  fotofobia: 1,
  fadigaVisual: 2,
  borramento: 1,
};

test('builds dynamic section summaries from sessions and validation captures', () => {
  const sessions: SessionResult[] = [
    {
      id: 's1',
      timestamp: 1700000000000,
      durationSec: 600,
      symptomsBefore: { ...baseSymptoms, fadigaVisual: 7 },
      symptomsAfter: { ...baseSymptoms, fadigaVisual: 4 },
      exercises: [
        {
          exerciseId: 'assistedReading',
          completed: true,
          score: 82,
          headStillnessScore: 88,
          parametersUsed: {
            targetSizeMm: 10,
            speedDegPerSec: 1,
            amplitudeDeg: 12,
            lineSpacingMultiplier: 1.4,
            contrastMode: 'light',
            durationSec: 120,
            textComplexity: 'facil',
          },
          timestamp: 1700000000000,
          extraData: {
            intervals: [900, 1100, 1000],
            saccadeMetrics: {
              trackingAvailable: true,
              samplesValid: 320,
              saccadeCount: 18,
              regressionCount: 3,
              meanSaccadeAmplitude: 0.12,
              meanFixationMs: 410,
            },
            posturalStability: {
              status: 'stable',
              samples: 180,
              cervicalStability: 92,
              sustainedTiltDeg: 1.2,
              rotationRange: 2.5,
              highMovement: false,
              confidence: 'high',
              label: 'Postura estavel',
              insight: 'Postura estavel durante a leitura.',
            },
          },
        },
      ],
    },
  ];

  const captures: ValidationCapture[] = [
    {
      id: 'c1',
      timestamp: 1700000100000,
      conditions: { lighting: 'normal', distanceCm: 40, posture: 'upright' },
      coverage: 94,
      calibrated: true,
      metrics: {
        trackingAvailable: true,
        samplesValid: 420,
        saccadeCount: 24,
        regressionCount: 5,
        meanSaccadeAmplitude: 0.14,
        meanFixationMs: 390,
      },
      postural: {
        status: 'stable',
        samples: 210,
        cervicalStability: 90,
        sustainedTiltDeg: 1.8,
        rotationRange: 3.1,
        highMovement: false,
        confidence: 'high',
        label: 'Postura estavel',
        insight: 'Cabeca firme nesta captura.',
      },
      axis: { hStd: 0.12, hRange: 0.44, vStd: 0.04, vRange: 0.11 },
      sampleCount: 430,
      samples: [],
    },
  ];

  const summary = buildStatisticsSummary(sessions, captures);

  assert.equal(summary.overview.sessionCount, 1);
  assert.equal(summary.overview.captureCount, 1);
  assert.match(summary.sections.training.insight, /1 sessao/);
  assert.match(summary.sections.symptoms.insight, /3,0 ponto/);
  assert.equal(summary.sections.reading.value, '42');
  assert.equal(summary.sections.reading.detail, 'sacadas pelo olhar');
  assert.match(summary.sections.reading.insight, /42 sacadas/);
  assert.match(summary.sections.reading.insight, /fixacao media de 400 ms/);
  assert.match(summary.sections.reading.insight, /Toque medio de 1\.000 ms/);
  assert.match(summary.sections.diagnostics.insight, /94%/);
  assert.match(summary.sections.diagnostics.insight, /24 sacadas/);
  assert.match(summary.sections.posture.insight, /91%/);
});

test('keeps empty states specific instead of repeating generic text', () => {
  const summary = buildStatisticsSummary([], []);

  assert.match(summary.sections.training.insight, /Nenhuma sessao/);
  assert.match(summary.sections.reading.insight, /sem exercicios de leitura/);
  assert.match(summary.sections.diagnostics.insight, /sem capturas diagnosticas/);
  assert.match(summary.sections.posture.insight, /sem amostras posturais/);
  assert.notEqual(summary.sections.training.insight, summary.sections.reading.insight);
});

test('buildOcularReadingSeries extracts eye-derived saccades and fixations in chronological order', () => {
  const sessions: SessionResult[] = [
    {
      id: 's1',
      timestamp: 1700000200000,
      durationSec: 600,
      symptomsBefore: baseSymptoms,
      symptomsAfter: baseSymptoms,
      exercises: [
        {
          exerciseId: 'assistedReading',
          completed: true,
          score: 80,
          headStillnessScore: 90,
          parametersUsed: {
            targetSizeMm: 10,
            speedDegPerSec: 1,
            amplitudeDeg: 12,
            lineSpacingMultiplier: 1.4,
            contrastMode: 'light',
            durationSec: 120,
            textComplexity: 'facil',
          },
          timestamp: 1700000200000,
          extraData: {
            intervals: [1200],
            saccadeMetrics: {
              trackingAvailable: true,
              samplesValid: 300,
              signalSource: 'calibrated-mediapipe',
              sampleRateHz: 62,
              saccadeCount: 14,
              regressionCount: 2,
              meanSaccadeAmplitude: 0.1,
              meanFixationMs: 420,
            },
          },
        },
      ],
    },
  ];

  const captures: ValidationCapture[] = [
    {
      id: 'c1',
      timestamp: 1700000100000,
      conditions: { lighting: 'normal', distanceCm: 40, posture: 'upright' },
      coverage: 91,
      calibrated: true,
      metrics: {
        trackingAvailable: true,
        samplesValid: 360,
        signalSource: 'calibrated-mediapipe',
        sampleRateHz: 58,
        saccadeCount: 21,
        regressionCount: 4,
        meanSaccadeAmplitude: 0.13,
        meanFixationMs: 390,
      },
      postural: {
        status: 'stable',
        samples: 200,
        cervicalStability: 88,
        sustainedTiltDeg: 1.2,
        rotationRange: 2.8,
        highMovement: false,
        confidence: 'high',
        label: 'Postura estavel',
        insight: 'Cabeca firme.',
      },
      axis: { hStd: 0.11, hRange: 0.4, vStd: 0.04, vRange: 0.1 },
      sampleCount: 370,
      samples: [],
    },
  ];

  const series = buildOcularReadingSeries(sessions, captures);

  assert.equal(series.length, 2);
  assert.equal(series[0].sourceKind, 'capture');
  assert.equal(series[0].signalQuality.grade, 'comparavel');
  assert.equal(series[0].sourceLabel, 'Captura calibrada');
  assert.equal(series[0].sampleRateHz, 58);
  assert.equal(series[0].saccades, 21);
  assert.equal(series[0].regressions, 4);
  assert.equal(series[0].meanFixationMs, 390);
  assert.equal(series[1].sourceKind, 'reading-session');
  assert.equal(series[1].signalQuality.grade, 'exploratorio');
  assert.equal(series[1].sourceLabel, 'Leitura calibrada');
  assert.equal(series[1].sampleRateHz, 62);
  assert.equal(series[1].saccades, 14);
  assert.equal(series[1].meanFixationMs, 420);
});

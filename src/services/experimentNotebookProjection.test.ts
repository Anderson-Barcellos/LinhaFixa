import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DeviceClassSource,
  RecallQuestion,
  RecallTestResult,
  SessionResult,
  ValidationCapture,
} from '@/types';
import type { CaptureValiditySnapshot } from './captureValidity';
import { buildExperimentNotebookProjection } from './experimentNotebookProjection';

const QUESTION: RecallQuestion = {
  question: 'Qual foi o tema?',
  options: ['A', 'B', 'C', 'D', 'E'],
  correctIndex: 0,
  rationale: 'Consta no texto.',
};

function validity(grade: CaptureValiditySnapshot['grade']): CaptureValiditySnapshot {
  return {
    contractVersion: 1,
    assessedAt: 1,
    grade,
    reasonCodes: grade === 'comparable'
      ? []
      : grade === 'exploratory'
        ? ['capture-device-class-unconfirmed']
        : ['page-hidden-during-capture'],
    durationMs: 20_000,
    coverage: 92,
    signalSource: 'calibrated-mediapipe',
    selectedSourceRatio: 0.96,
    sampleRateHz: 60,
    temporalTier: 'high-temporal',
    gapCount: 0,
    interruption: grade === 'invalid' ? 'page-hidden-during-capture' : null,
  };
}

function capture(
  id: string,
  timestamp: number,
  grade: CaptureValiditySnapshot['grade'],
  source: DeviceClassSource | null = grade === 'comparable' ? 'confirmed' : 'suggested',
): ValidationCapture {
  return {
    id,
    timestamp,
    conditions: { lighting: 'normal', distanceCm: 40, posture: 'upright' },
    coverage: 92,
    calibrated: true,
    metrics: {
      trackingAvailable: true,
      samplesValid: 360,
      signalSource: 'calibrated-mediapipe',
      sampleRateHz: 60,
      saccadeCount: 12,
      regressionCount: 2,
      lineReturnCount: 1,
      meanSaccadeAmplitude: 0.1,
      meanFixationMs: 400,
    },
    postural: {
      status: 'stable',
      samples: 200,
      cervicalStability: 90,
      sustainedTiltDeg: 1,
      rotationRange: 2,
      highMovement: false,
      confidence: 'high',
      label: 'Postura estável',
      insight: 'Postura estável.',
    },
    axis: { hStd: 0.1, hRange: 0.4, vStd: 0.04, vRange: 0.1 },
    environment: source
      ? {
          deviceClass: 'phone',
          deviceClassSource: source,
          layoutMode: 'compact',
          viewport: { width: 390, height: 844, devicePixelRatio: 3, orientation: 'portrait' },
          surfaceRect: { left: 0, top: 0, width: 390, height: 700 },
          video: { width: 1280, height: 720 },
          camera: { frameRate: 60 },
          rates: { ocularSampleRateHz: 60 },
        }
      : undefined,
    sampleCount: 360,
    samples: [],
    orientation: 'portrait',
    durationMs: 20_000,
    validity: validity(grade),
  };
}

function recall(id: string, timestamp: number, captureId?: string): RecallTestResult {
  return {
    id,
    timestamp,
    topic: 'Neuroplasticidade',
    text: 'Texto realmente lido.',
    questions: [QUESTION, QUESTION, QUESTION, QUESTION, QUESTION, QUESTION],
    answers: [0, 0, 0, 0, 0, 1],
    score: 5,
    readingDurationMs: 20_000,
    captureId,
  };
}

function training(id: string, timestamp: number): SessionResult {
  return {
    id,
    timestamp,
    durationSec: 120,
    exercises: [{
      exerciseId: 'fixation',
      completed: true,
      score: 80,
      headStillnessScore: 90,
      parametersUsed: {
        targetSizeMm: 12,
        speedDegPerSec: 0,
        amplitudeDeg: 0,
        lineSpacingMultiplier: 1,
        contrastMode: 'light',
        durationSec: 120,
      },
      timestamp,
    }],
  };
}

test('projects captures, linked recall and training without duplicate records', () => {
  const captures = [
    capture('cap-valid', 100, 'comparable'),
    capture('cap-baseline', 200, 'exploratory'),
    capture('cap-invalid', 300, 'invalid', 'confirmed'),
  ];
  const recalls = [recall('rec-linked', 110, 'cap-valid'), recall('rec-free', 400)];
  const sessions = [training('session-1', 500)];

  const projection = buildExperimentNotebookProjection({ sessions, captures, recalls });

  assert.equal(projection.series.title, 'Leitura — série atual');
  assert.deepEqual(projection.comparable.map(item => item.sourceId), ['cap-valid']);
  assert.deepEqual(projection.baselines.map(item => item.sourceId), ['cap-baseline']);
  assert.deepEqual(projection.audit.map(item => item.sourceId), ['cap-invalid']);
  assert.equal(projection.comparable[0].recall?.scoreLabel, '5/6');
  assert.equal(projection.activities.some(item => item.kind === 'training'), true);
  assert.equal(projection.activities.some(item => item.sourceId === 'rec-free'), true);
  assert.equal(projection.activities.some(item => item.sourceId === 'rec-linked'), false);
  assert.equal(projection.recent[0].timestamp >= projection.recent[1].timestamp, true);
  assert.equal(projection.counts.total, projection.all.length);
});

test('legacy inference is presentation-only and ambiguity remains null', () => {
  const consistent = capture('legacy-phone', 100, 'comparable', null);
  consistent.environment = {
    layoutMode: 'compact',
    viewport: { width: 390, height: 844, devicePixelRatio: 3, orientation: 'portrait' },
    surfaceRect: { left: 0, top: 0, width: 390, height: 700 },
    video: { width: 1280, height: 720 },
    camera: {},
    rates: {},
  };
  const ambiguous = capture('legacy-ambiguous', 200, 'comparable', null);
  ambiguous.environment = {
    ...consistent.environment,
    viewport: { width: 700, height: 700, devicePixelRatio: 2, orientation: 'portrait' },
  };

  const projection = buildExperimentNotebookProjection({
    sessions: [],
    captures: [consistent, ambiguous],
    recalls: [],
  });

  assert.deepEqual(projection.audit.map(item => item.sourceId), ['legacy-phone', 'legacy-ambiguous']);
  assert.equal(projection.audit[0].deviceClass, 'phone');
  assert.equal(projection.audit[0].deviceClassSource, 'legacy-inferred');
  assert.equal(projection.audit[1].deviceClass, null);
  assert.equal(projection.audit[1].deviceClassSource, null);
});

test('projection sorts copies and never mutates store arrays or records', () => {
  const captures = [capture('newer', 200, 'comparable'), capture('older', 100, 'comparable')];
  const sessions = [training('session', 150)];
  const recalls = [recall('recall', 50)];
  const before = JSON.stringify({ sessions, captures, recalls });

  const projection = buildExperimentNotebookProjection({ sessions, captures, recalls });

  assert.deepEqual(projection.all.map(item => item.timestamp), [200, 150, 100, 50]);
  assert.equal(JSON.stringify({ sessions, captures, recalls }), before);
  assert.deepEqual(captures.map(item => item.id), ['newer', 'older']);
});

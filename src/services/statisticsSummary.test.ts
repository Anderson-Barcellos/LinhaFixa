import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDiagnosticInsightPayload,
  buildSessionInsightSummary,
  buildOcularReadingSeries,
  buildStatisticsSummary,
  partitionOcularReadingSeries,
  resolveSelectedOcularGroupKey,
} from './statisticsSummary';
import { SessionResult, ValidationCapture, type DeviceClassSource } from '@/types';
import type { CaptureValiditySnapshot } from './captureValidity';

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
            orientation: 'portrait',
            deviceClass: 'phone',
            deviceClassSource: 'confirmed',
            validity: validity('comparable'),
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
      orientation: 'portrait',
      environment: {
        deviceClass: 'phone',
        deviceClassSource: 'confirmed',
        layoutMode: 'compact',
        viewport: { width: 390, height: 844, devicePixelRatio: 3, orientation: 'portrait' },
        surfaceRect: { left: 0, top: 0, width: 390, height: 700 },
        video: { width: 1280, height: 720 },
        camera: { frameRate: 60 },
        rates: { ocularSampleRateHz: 60 },
      },
      durationMs: 20_000,
      validity: validity('comparable'),
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

test('summarizes wellbeing from quick-context sessions (feeling delta on the 1-5 scale)', () => {
  const sessions: SessionResult[] = [
    {
      id: 's2',
      timestamp: 1700000300000,
      durationSec: 300,
      contextBefore: { venvanseTakenAt: '08:00', sleepHours: 7, mood: 3, feeling: 3 },
      contextAfter: { feeling: 4, fatigue: 2, mood: 4 },
      exercises: [],
    },
  ];

  const summary = buildStatisticsSummary(sessions, []);

  assert.equal(summary.overview.wellbeingDelta, 1);
  assert.equal(summary.sections.symptoms.label, 'Bem-estar');
  assert.match(summary.sections.symptoms.insight, /melhora media de 1,0 ponto/);
});

test('falls back to the legacy symptom delta when only old sessions exist', () => {
  const sessions: SessionResult[] = [
    {
      id: 's3',
      timestamp: 1700000400000,
      durationSec: 300,
      symptomsBefore: { ...baseSymptoms, fadigaVisual: 6 },
      symptomsAfter: { ...baseSymptoms, fadigaVisual: 4 },
      exercises: [],
    },
  ];

  const summary = buildStatisticsSummary(sessions, []);

  assert.equal(summary.overview.wellbeingDelta, null);
  assert.match(summary.sections.symptoms.insight, /escala antiga/);
  assert.match(summary.sections.symptoms.insight, /queda media de 2,0 pontos/);
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
        lineReturnCount: 3,
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
      durationMs: 20_000,
      validity: {
        contractVersion: 1,
        assessedAt: 1700000120000,
        grade: 'comparable',
        reasonCodes: [],
        durationMs: 20_000,
        coverage: 91,
        signalSource: 'calibrated-mediapipe',
        selectedSourceRatio: 0.95,
        sampleRateHz: 58,
        temporalTier: 'high-temporal',
        gapCount: 0,
        interruption: null,
      },
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
  assert.equal(series[0].lineReturns, 3);
  assert.equal(series[0].meanFixationMs, 390);
  assert.equal(series[1].sourceKind, 'reading-session');
  assert.equal(series[1].signalQuality.grade, 'exploratorio');
  assert.equal(series[1].sourceLabel, 'Leitura calibrada');
  assert.equal(series[1].sampleRateHz, 62);
  assert.equal(series[1].saccades, 14);
  assert.equal(series[1].lineReturns, null);
  assert.equal(series[1].meanFixationMs, 420);
});

test('nullable fixation estimates stay null in the series and are ignored by summary averages', () => {
  const capture = {
    id: 'nullable-capture',
    timestamp: 1700000500000,
    conditions: { lighting: 'normal' as const, distanceCm: 40, posture: 'upright' as const },
    coverage: 95,
    calibrated: true,
    metrics: {
      trackingAvailable: true,
      samplesValid: 300,
      signalSource: 'calibrated-mediapipe' as const,
      sampleRateHz: 60,
      saccadeCount: 0,
      regressionCount: 0,
      lineReturnCount: 0,
      meanSaccadeAmplitude: null,
      meanFixationMs: null,
    },
    postural: {
      status: 'stable' as const,
      samples: 180,
      cervicalStability: 90,
      sustainedTiltDeg: 1,
      rotationRange: 2,
      highMovement: false,
      confidence: 'high' as const,
      label: 'Postura estável',
      insight: 'Postura estável.',
    },
    axis: { hStd: 0, hRange: 0, vStd: 0, vRange: 0 },
    sampleCount: 300,
    samples: [],
    orientation: 'portrait',
    environment: {
      deviceClass: 'phone',
      deviceClassSource: 'confirmed',
      layoutMode: 'compact',
      viewport: { width: 390, height: 844, devicePixelRatio: 3, orientation: 'portrait' },
      surfaceRect: { left: 0, top: 0, width: 390, height: 700 },
      video: { width: 1280, height: 720 },
      camera: { frameRate: 60 },
      rates: { ocularSampleRateHz: 60 },
    },
    durationMs: 20_000,
    validity: validity('comparable'),
  } satisfies ValidationCapture;

  const series = buildOcularReadingSeries([], [capture]);
  const summary = buildStatisticsSummary([], [capture]);
  const captureWithFixation = {
    ...capture,
    id: 'estimated-capture',
    timestamp: capture.timestamp + 1,
    metrics: { ...capture.metrics, meanFixationMs: 420 },
  } satisfies ValidationCapture;
  const mixedSummary = buildStatisticsSummary([], [capture, captureWithFixation]);

  assert.equal(series[0].meanFixationMs, null);
  assert.match(summary.sections.reading.insight, /fixação média não estimável/);
  assert.doesNotMatch(summary.sections.reading.insight, /fixação média de 0 ms/);
  assert.match(mixedSummary.sections.reading.insight, /fixacao media de 420 ms/);
  assert.doesNotMatch(mixedSummary.sections.reading.insight, /fixacao media de 210 ms/);
});

function validity(
  grade: CaptureValiditySnapshot['grade'],
  overrides: Partial<CaptureValiditySnapshot> = {},
): CaptureValiditySnapshot {
  return {
    contractVersion: 1,
    assessedAt: 1700000000000,
    grade,
    reasonCodes: grade === 'comparable'
      ? []
      : grade === 'invalid'
        ? ['page-hidden-during-capture']
        : ['capture-coarse-temporal'],
    durationMs: 20_000,
    coverage: 92,
    signalSource: 'calibrated-mediapipe',
    selectedSourceRatio: 0.96,
    sampleRateHz: grade === 'exploratory' ? 30 : 60,
    temporalTier: grade === 'exploratory' ? 'coarse-temporal' : 'high-temporal',
    gapCount: 0,
    interruption: grade === 'invalid' ? 'page-hidden-during-capture' : null,
    ...overrides,
  };
}

function diagnosticCapture(
  id: string,
  timestamp: number,
  snapshot?: CaptureValiditySnapshot,
  orientation: ValidationCapture['orientation'] = 'portrait',
  meanFixationMs: number | null = 400,
  deviceClassSource: DeviceClassSource | null = 'confirmed',
): ValidationCapture {
  return {
    id,
    timestamp,
    durationMs: snapshot?.durationMs ?? undefined,
    conditions: { lighting: 'normal', distanceCm: 40, posture: 'upright' },
    coverage: snapshot?.coverage ?? 90,
    calibrated: snapshot?.signalSource === 'calibrated-mediapipe',
    metrics: {
      trackingAvailable: snapshot?.signalSource !== 'unavailable',
      samplesValid: 360,
      signalSource: snapshot?.signalSource ?? 'raw-mediapipe',
      sampleRateHz: snapshot?.sampleRateHz ?? undefined,
      saccadeCount: 12,
      regressionCount: 2,
      lineReturnCount: 1,
      meanSaccadeAmplitude: meanFixationMs === null ? null : 0.1,
      meanFixationMs,
    },
    postural: {
      status: 'stable',
      samples: 200,
      cervicalStability: 90,
      sustainedTiltDeg: 1,
      rotationRange: 2,
      highMovement: false,
      confidence: 'high',
      baselineApplied: true,
      motionStatus: 'stable',
      motionDeltaDeg: 1.5,
      label: 'Postura estável',
      insight: 'Postura estável.',
    },
    axis: { hStd: 0.1, hRange: 0.4, vStd: 0.04, vRange: 0.1 },
    orientation,
    environment: deviceClassSource && orientation
      ? {
          deviceClass: 'phone',
          deviceClassSource,
          layoutMode: 'compact',
          viewport: { width: 390, height: 844, devicePixelRatio: 3, orientation },
          surfaceRect: { left: 0, top: 0, width: 390, height: 700 },
          video: { width: 1280, height: 720 },
          camera: { frameRate: 60 },
          rates: { ocularSampleRateHz: 60 },
        }
      : undefined,
    sampleCount: 360,
    samples: [],
    validity: snapshot,
  };
}

test('partitions comparable captures by orientation, temporal tier and source while retaining audit records', () => {
  const portraitA = diagnosticCapture('portrait-a', 100, validity('comparable'));
  const portraitB = diagnosticCapture('portrait-b', 200, validity('comparable'), 'portrait', null);
  const landscape = diagnosticCapture('landscape', 300, validity('comparable'), 'landscape');
  const coarse = diagnosticCapture('coarse', 400, validity('exploratory'));
  const interrupted = diagnosticCapture('interrupted', 500, validity('invalid'));
  const legacy = diagnosticCapture('legacy', 600, undefined, 'portrait', 400, null);

  const points = buildOcularReadingSeries([], [portraitA, portraitB, landscape, coarse, interrupted, legacy]);
  const partition = partitionOcularReadingSeries(points);

  assert.equal(partition.comparableGroups.length, 2);
  assert.deepEqual(partition.comparableGroups.map(group => group.points.map(point => point.id)), [
    ['portrait-a', 'portrait-b'],
    ['landscape'],
  ]);
  assert.match(partition.comparableGroups[0].key, /portrait/);
  assert.match(partition.comparableGroups[0].key, /high-temporal/);
  assert.match(partition.comparableGroups[0].key, /calibrated-mediapipe/);
  assert.match(partition.comparableGroups[0].label, /Retrato/);
  assert.deepEqual(partition.audit.map(point => point.id), ['coarse', 'interrupted', 'legacy']);
  assert.equal(partition.audit[0].comparisonKey, null);
  assert.equal(partition.audit[0].comparisonExclusionReason, 'validity-grade-not-comparable');
  assert.equal(partition.comparableGroups[0].points[1].meanFixationMs, null);
  assert.equal(partition.audit[2].validity.assessedAt, null);
  assert.deepEqual(legacy.validity, undefined, 'read-time normalization must not mutate storage objects');
});

test('routes comparable captures with missing orientation to audit instead of inventing a key', () => {
  const capture = diagnosticCapture('missing-orientation', 100, validity('comparable'));
  delete capture.orientation;
  delete capture.environment;
  const point = buildOcularReadingSeries([], [capture])[0];
  const partition = partitionOcularReadingSeries([point]);

  assert.equal(point.comparisonKey, null);
  assert.equal(partition.comparableGroups.length, 0);
  assert.deepEqual(partition.audit.map(item => item.id), ['missing-orientation']);
});

test('trend eligibility fails closed for malformed and unsupported runtime snapshots', () => {
  const cases: Array<{ name: string; capture: ValidationCapture }> = [];
  const missingOrientation = diagnosticCapture('missing-orientation-runtime', 1, validity('comparable'));
  delete missingOrientation.orientation;
  delete missingOrientation.environment;
  cases.push({ name: 'missing orientation', capture: missingOrientation });

  const unknownOrientation = diagnosticCapture('unknown-orientation', 2, validity('comparable'));
  unknownOrientation.orientation = 'square' as ValidationCapture['orientation'];
  delete unknownOrientation.environment;
  cases.push({ name: 'unknown orientation', capture: unknownOrientation });

  const nullOrientation = diagnosticCapture('null-orientation', 3, validity('comparable'));
  nullOrientation.orientation = null as unknown as ValidationCapture['orientation'];
  delete nullOrientation.environment;
  cases.push({ name: 'null orientation', capture: nullOrientation });

  for (const [name, tier] of [
    ['missing tier', undefined],
    ['null tier', null],
    ['unknown tier', 'ultra-temporal'],
    ['insufficient tier', 'insufficient-temporal'],
  ] as const) {
    cases.push({
      name,
      capture: diagnosticCapture(name, cases.length + 3, validity('comparable', {
        temporalTier: tier as CaptureValiditySnapshot['temporalTier'],
      })),
    });
  }

  for (const [name, source] of [
    ['missing source', undefined],
    ['null source', null],
    ['unknown source', 'synthetic-source'],
    ['unavailable source', 'unavailable'],
  ] as const) {
    cases.push({
      name,
      capture: diagnosticCapture(name, cases.length + 3, validity('comparable', {
        signalSource: source as CaptureValiditySnapshot['signalSource'],
      })),
    });
  }

  for (const item of cases) {
    const point = buildOcularReadingSeries([], [item.capture])[0];
    const partition = partitionOcularReadingSeries([point]);
    assert.equal(point.comparisonKey, null, item.name);
    assert.equal(partition.comparableGroups.length, 0, item.name);
    assert.deepEqual(partition.audit.map(audit => audit.id), [item.capture.id], item.name);
  }

  const rawCoarse = diagnosticCapture('raw-coarse', 100, validity('exploratory', {
    signalSource: 'raw-mediapipe',
    temporalTier: 'coarse-temporal',
    sampleRateHz: 30,
  }));
  const rawCoarsePoint = buildOcularReadingSeries([], [rawCoarse])[0];
  assert.equal(rawCoarsePoint.comparisonKey, null);
  assert.equal(rawCoarsePoint.comparisonExclusionReason, 'validity-grade-not-comparable');

  for (const [name, overrides, reason] of [
    ['unsupported version', { contractVersion: 2 }, 'unsupported-validity-contract'],
    ['missing reasons', { reasonCodes: undefined }, 'malformed-validity-snapshot'],
    ['coarse contradiction', { temporalTier: 'coarse-temporal', sampleRateHz: 60 }, 'validity-contract-contradiction'],
    ['raw comparable', { signalSource: 'raw-mediapipe' }, 'validity-contract-contradiction'],
  ] as const) {
    const capture = diagnosticCapture(name, 200, validity('comparable', overrides as Partial<CaptureValiditySnapshot>));
    const point = buildOcularReadingSeries([], [capture])[0];
    assert.equal(point.comparisonKey, null, name);
    assert.equal(point.comparisonExclusionReason, reason, name);
    assert.deepEqual(capture.validity, validity('comparable', overrides as Partial<CaptureValiditySnapshot>), `${name} input remains untouched`);
  }
});

test('trend eligibility requires exact v1 comparable high-temporal calibrated evidence', () => {
  const capture = diagnosticCapture('eligible', 100, validity('comparable'), 'portrait');
  const point = buildOcularReadingSeries([], [capture])[0];
  assert.equal(point.comparisonKey, 'phone|portrait|high-temporal|calibrated-mediapipe');
  assert.equal(point.comparisonExclusionReason, null);
});

test('same signal on phone and tablet never shares a trend group', () => {
  const phone = diagnosticCapture('phone', 100, validity('comparable'));
  const tablet = diagnosticCapture('tablet', 200, validity('comparable'));
  tablet.environment = {
    ...tablet.environment!,
    deviceClass: 'tablet',
    deviceClassSource: 'confirmed',
  };

  const points = buildOcularReadingSeries([], [phone, tablet]);
  const partition = partitionOcularReadingSeries(points);

  assert.equal(points[0].deviceClass, 'phone');
  assert.equal(points[0].deviceClassSource, 'confirmed');
  assert.equal(points[0].comparisonKey, 'phone|portrait|high-temporal|calibrated-mediapipe');
  assert.equal(partition.comparableGroups.length, 2);
  assert.match(partition.comparableGroups[0].label, /Celular/);
  assert.match(partition.comparableGroups[1].label, /Tablet/);
  assert.equal(
    partition.comparableGroups[0].label.indexOf('Celular')
      < partition.comparableGroups[0].label.indexOf('Retrato'),
    true,
  );
});

test('suggested and legacy-inferred classes stay outside trends', () => {
  for (const source of ['suggested', 'legacy-inferred'] as const) {
    const capture = diagnosticCapture(source, 100, validity('comparable'), 'portrait', 400, source);
    const point = buildOcularReadingSeries([], [capture])[0];
    assert.equal(point.comparisonKey, null, source);
    assert.equal(point.comparisonExclusionReason, 'missing-comparison-context', source);
  }
});

test('every comparable snapshot contradiction is audited with the canonical derived reason', () => {
  for (const [name, override] of [
    ['pagehide', { interruption: 'pagehide-during-capture' }],
    ['null assessment', { assessedAt: null }],
    ['short duration', { durationMs: 19_999 }],
    ['low coverage', { coverage: 79 }],
    ['low ratio', { selectedSourceRatio: 0.8 }],
    ['gap', { gapCount: 1 }],
  ] as const) {
    const capture = diagnosticCapture(
      name,
      100,
      validity('comparable', override as Partial<CaptureValiditySnapshot>),
    );
    const partition = partitionOcularReadingSeries(buildOcularReadingSeries([], [capture]));
    assert.equal(partition.comparableGroups.length, 0, name);
    assert.equal(partition.audit[0].comparisonExclusionReason, 'validity-contract-contradiction', name);
  }
});

test('treats reading sessions without a validity snapshot as exploratory legacy audit records', () => {
  const session: SessionResult = {
    id: 'legacy-reading',
    timestamp: 100,
    durationSec: 30,
    exercises: [{
      exerciseId: 'assistedReading',
      completed: true,
      score: 70,
      headStillnessScore: 80,
      timestamp: 100,
      parametersUsed: {
        targetSizeMm: 10,
        speedDegPerSec: 1,
        amplitudeDeg: 12,
        lineSpacingMultiplier: 1.4,
        contrastMode: 'light',
        durationSec: 30,
      },
      extraData: {
        saccadeMetrics: {
          trackingAvailable: true,
          samplesValid: 300,
          signalSource: 'calibrated-mediapipe',
          sampleRateHz: 60,
          saccadeCount: 10,
          regressionCount: 1,
          meanSaccadeAmplitude: 0.1,
          meanFixationMs: 380,
        },
      },
    }],
  };

  const partition = partitionOcularReadingSeries(buildOcularReadingSeries([session], []));
  assert.equal(partition.comparableGroups.length, 0);
  assert.equal(partition.audit[0].validity.grade, 'exploratory');
  assert.deepEqual(partition.audit[0].validity.reasonCodes, ['legacy-unassessed']);
});

test('statistics aggregate ocular dynamics only from comparable points and preserve audit counts', () => {
  const comparable = diagnosticCapture('comparable', 100, validity('comparable'), 'portrait', 400);
  const exploratory = diagnosticCapture('exploratory', 200, validity('exploratory'), 'portrait', 1000);
  exploratory.metrics.saccadeCount = 99;
  const invalid = diagnosticCapture('invalid', 300, validity('invalid'), 'portrait', null);

  const summary = buildStatisticsSummary([], [comparable, exploratory, invalid]);

  assert.equal(summary.sections.reading.value, '12');
  assert.match(summary.sections.reading.insight, /fixacao media de 400 ms/);
  assert.equal(summary.overview.ocularValidity.comparable, 1);
  assert.equal(summary.overview.ocularValidity.exploratory, 1);
  assert.equal(summary.overview.ocularValidity.invalid, 1);
  assert.equal(summary.overview.ocularValidity.trendEligible, 1);
  assert.equal(summary.overview.ocularValidity.audit, 2);
  assert.equal(summary.overview.ocularValidity.missingComparisonContext, 0);
  assert.equal(summary.overview.ocularValidity.total, 3);
  assert.match(summary.sections.diagnostics.insight, /1 comparável/);
  assert.match(summary.sections.diagnostics.insight, /2 para auditoria/);
});

test('builds separated AI diagnostic arrays without a combined trend payload', () => {
  const comparable = diagnosticCapture('comparable', 100, validity('comparable'));
  const audit = diagnosticCapture('audit', 200, validity('exploratory', {
    reasonCodes: ['capture-source-inconsistent'],
    selectedSourceRatio: 0.75,
  }), 'portrait', null);
  const partition = partitionOcularReadingSeries(buildOcularReadingSeries([], [comparable, audit]));
  comparable.context = { venvanseTakenAt: '08:00', sleepHours: 7, mood: 4, feeling: 4 };
  comparable.conditions.note = 'ambiente controlado';
  const payload = buildDiagnosticInsightPayload(partition, [comparable, audit]);

  assert.deepEqual(Object.keys(payload).sort(), ['auditDiagnosticCaptures', 'comparableDiagnosticCaptures']);
  assert.equal(payload.comparableDiagnosticCaptures[0].validity.grade, 'comparable');
  assert.equal(payload.comparableDiagnosticCaptures[0].validity.temporalTier, 'high-temporal');
  assert.equal(payload.comparableDiagnosticCaptures[0].validity.selectedSourceRatio, 0.96);
  assert.equal(payload.comparableDiagnosticCaptures[0].validity.durationMs, 20_000);
  assert.equal(payload.comparableDiagnosticCaptures[0].deviceClass, 'phone');
  assert.equal(payload.comparableDiagnosticCaptures[0].posturalLabel, 'Postura estável');
  assert.equal(payload.comparableDiagnosticCaptures[0].cervicalStability, 90);
  assert.equal(payload.comparableDiagnosticCaptures[0].posturalBaselineApplied, true);
  assert.equal(payload.comparableDiagnosticCaptures[0].motionStatus, 'stable');
  assert.equal(payload.comparableDiagnosticCaptures[0].motionDeltaDeg, 1.5);
  assert.equal(payload.comparableDiagnosticCaptures[0].horizontalRange, 0.4);
  assert.equal(payload.comparableDiagnosticCaptures[0].verticalRange, 0.1);
  assert.deepEqual(payload.comparableDiagnosticCaptures[0].conditions, comparable.conditions);
  assert.deepEqual(payload.comparableDiagnosticCaptures[0].context, comparable.context);
  assert.notEqual(payload.comparableDiagnosticCaptures[0].conditions, comparable.conditions);
  assert.notEqual(payload.comparableDiagnosticCaptures[0].context, comparable.context);
  assert.deepEqual(payload.auditDiagnosticCaptures[0].validity.reasonCodes, ['capture-source-inconsistent']);
  assert.equal(payload.auditDiagnosticCaptures[0].meanFixationMs, null);
  assert.equal(payload.auditDiagnosticCaptures[0].comparisonExclusionReason, 'validity-grade-not-comparable');
  assert.equal('diagnosticCaptures' in payload, false);
});

test('limits the separated AI payload to the eight newest captures globally', () => {
  const captures = Array.from({ length: 10 }, (_, index) => {
    const ordinal = index + 1;
    return diagnosticCapture(
      `capture-${ordinal}`,
      ordinal * 100,
      validity(ordinal % 2 === 0 ? 'comparable' : 'exploratory'),
      ordinal % 3 === 0 ? 'landscape' : 'portrait',
    );
  });
  const partition = partitionOcularReadingSeries(buildOcularReadingSeries([], captures));
  const payload = buildDiagnosticInsightPayload(partition, captures);
  const comparableIds = payload.comparableDiagnosticCaptures.map(item => item.id);
  const auditIds = payload.auditDiagnosticCaptures.map(item => item.id);

  assert.equal(comparableIds.length + auditIds.length, 8);
  assert.deepEqual([...comparableIds, ...auditIds].sort(), [
    'capture-10', 'capture-3', 'capture-4', 'capture-5',
    'capture-6', 'capture-7', 'capture-8', 'capture-9',
  ]);
  assert.deepEqual(comparableIds, ['capture-10', 'capture-8', 'capture-6', 'capture-4']);
  assert.deepEqual(auditIds, ['capture-9', 'capture-7', 'capture-5', 'capture-3']);
});

test('limits AI session summary to the eight newest sessions without mutating input', () => {
  const sessions = Array.from({ length: 10 }, (_, index): SessionResult => ({
    id: `session-${index + 1}`,
    timestamp: (index + 1) * 100,
    durationSec: 60,
    exercises: [],
  }));
  const originalOrder = sessions.map(session => session.id);
  const summary = buildSessionInsightSummary(sessions);

  assert.deepEqual(summary.map(item => item.id), [
    'session-10', 'session-9', 'session-8', 'session-7',
    'session-6', 'session-5', 'session-4', 'session-3',
  ]);
  assert.deepEqual(sessions.map(session => session.id), originalOrder);
  assert.equal(summary.length, 8);
});

test('ocular validity counts reconcile grade, trend eligibility and audit exclusion', () => {
  const missingContext = diagnosticCapture('comparable-missing-context', 100, validity('comparable'));
  delete missingContext.orientation;
  delete missingContext.environment;
  const summary = buildStatisticsSummary([], [missingContext]);

  assert.deepEqual(summary.overview.ocularValidity, {
    comparable: 1,
    exploratory: 0,
    invalid: 0,
    trendEligible: 0,
    audit: 1,
    missingComparisonContext: 1,
    total: 1,
  });
  assert.equal(
    summary.overview.ocularValidity.comparable
      + summary.overview.ocularValidity.exploratory
      + summary.overview.ocularValidity.invalid,
    summary.overview.ocularValidity.total,
  );
});

test('keeps a valid group selection and otherwise falls back to the group with the newest point', () => {
  const partition = partitionOcularReadingSeries(buildOcularReadingSeries([], [
    diagnosticCapture('older-portrait', 100, validity('comparable'), 'portrait'),
    diagnosticCapture('newer-landscape', 200, validity('comparable'), 'landscape'),
  ]));
  const portraitKey = partition.comparableGroups.find(group => group.label.includes('Retrato'))!.key;
  const landscapeKey = partition.comparableGroups.find(group => group.label.includes('Paisagem'))!.key;

  assert.equal(resolveSelectedOcularGroupKey(partition.comparableGroups, portraitKey), portraitKey);
  assert.equal(resolveSelectedOcularGroupKey(partition.comparableGroups, 'removed-group'), landscapeKey);
  assert.equal(resolveSelectedOcularGroupKey([], landscapeKey), null);
});

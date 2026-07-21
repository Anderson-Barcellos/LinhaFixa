import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GazeSample, SaccadeMetrics } from '@/types';
import {
  assessCaptureValidity,
  captureValidityOrLegacy,
  classifyTemporalTier,
  countTrackingGaps,
  describeCaptureValidity,
  describeCaptureValidityContract,
  pageInterruptionReason,
  validatePersistedCaptureValidityForTrend,
  type CaptureValidityInput,
  type CaptureValidityReasonCode,
  type CaptureValiditySnapshot,
} from './captureValidity';

const validInput = (overrides: Partial<CaptureValidityInput> = {}): CaptureValidityInput => ({
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

test('unconfirmed device class keeps usable evidence exploratory', () => {
  const snapshot = assessCaptureValidity(validInput({ deviceClassConfirmed: false }));
  assert.equal(snapshot.grade, 'exploratory');
  assert.deepEqual(snapshot.reasonCodes, ['capture-device-class-unconfirmed']);
  assert.deepEqual(describeCaptureValidity(snapshot).reasons, [
    'Classe de dispositivo ainda não confirmada',
  ]);
});

test('classifyTemporalTier applies the exact 24 Hz and 45 Hz boundaries', () => {
  const cases: Array<[number | null | undefined, ReturnType<typeof classifyTemporalTier>]> = [
    [23.99, 'insufficient-temporal'],
    [24, 'coarse-temporal'],
    [44.99, 'coarse-temporal'],
    [45, 'high-temporal'],
    [null, 'insufficient-temporal'],
    [undefined, 'insufficient-temporal'],
    [Number.NaN, 'insufficient-temporal'],
    [Number.POSITIVE_INFINITY, 'insufficient-temporal'],
    [-1, 'insufficient-temporal'],
  ];

  for (const [rate, expected] of cases) {
    assert.equal(classifyTemporalTier(rate), expected, `rate ${String(rate)}`);
  }
});

test('fractional rates immediately below a boundary cannot be promoted by presentation rounding', () => {
  for (const rate of [23.5, 23.99]) {
    const snapshot = assessCaptureValidity(validInput({ sampleRateHz: rate }));
    assert.equal(snapshot.sampleRateHz, rate);
    assert.equal(snapshot.temporalTier, 'insufficient-temporal');
    assert.equal(snapshot.grade, 'invalid');
  }
  for (const rate of [44.5, 44.99]) {
    const snapshot = assessCaptureValidity(validInput({ sampleRateHz: rate }));
    assert.equal(snapshot.sampleRateHz, rate);
    assert.equal(snapshot.temporalTier, 'coarse-temporal');
    assert.equal(snapshot.grade, 'exploratory');
  }
  assert.equal(assessCaptureValidity(validInput({ sampleRateHz: 24 })).temporalTier, 'coarse-temporal');
  assert.equal(assessCaptureValidity(validInput({ sampleRateHz: 45 })).temporalTier, 'high-temporal');
});

test('assessCaptureValidity applies the inclusive duration boundary', () => {
  const short = assessCaptureValidity(validInput({ durationMs: 19_999 }));
  const exact = assessCaptureValidity(validInput({ durationMs: 20_000 }));

  assert.equal(short.grade, 'invalid');
  assert.deepEqual(short.reasonCodes, ['capture-duration-too-short']);
  assert.equal(exact.grade, 'comparable');
  assert.deepEqual(exact.reasonCodes, []);
});

test('assessCaptureValidity treats finite low coverage as exploratory at the inclusive 80 percent gate', () => {
  const low = assessCaptureValidity(validInput({ coverage: 79.99 }));
  const exact = assessCaptureValidity(validInput({ coverage: 80 }));

  assert.equal(low.grade, 'exploratory');
  assert.deepEqual(low.reasonCodes, ['capture-coverage-below-threshold']);
  assert.equal(exact.grade, 'comparable');
});

test('assessCaptureValidity treats finite source inconsistency as exploratory at the inclusive 90 percent gate', () => {
  const low = assessCaptureValidity(validInput({ selectedSourceRatio: 0.899 }));
  const exact = assessCaptureValidity(validInput({ selectedSourceRatio: 0.9 }));

  assert.equal(low.grade, 'exploratory');
  assert.deepEqual(low.reasonCodes, ['capture-source-inconsistent']);
  assert.equal(exact.grade, 'comparable');
});

test('assessCaptureValidity maps temporal tiers to invalid, exploratory and comparable grades', () => {
  const cases: Array<[number, CaptureValiditySnapshot['temporalTier'], CaptureValiditySnapshot['grade'], CaptureValidityReasonCode[]]> = [
    [23.99, 'insufficient-temporal', 'invalid', ['capture-insufficient-temporal']],
    [24, 'coarse-temporal', 'exploratory', ['capture-coarse-temporal']],
    [44.99, 'coarse-temporal', 'exploratory', ['capture-coarse-temporal']],
    [45, 'high-temporal', 'comparable', []],
  ];

  for (const [rate, tier, grade, reasons] of cases) {
    const snapshot = assessCaptureValidity(validInput({ sampleRateHz: rate }));
    assert.equal(snapshot.temporalTier, tier, `rate ${rate}`);
    assert.equal(snapshot.grade, grade, `rate ${rate}`);
    assert.deepEqual(snapshot.reasonCodes, reasons, `rate ${rate}`);
  }
});

test('assessCaptureValidity marks one or more tracking gaps exploratory', () => {
  assert.equal(assessCaptureValidity(validInput({ gapCount: 0 })).grade, 'comparable');

  const gap = assessCaptureValidity(validInput({ gapCount: 1 }));
  assert.equal(gap.grade, 'exploratory');
  assert.deepEqual(gap.reasonCodes, ['capture-tracking-gap']);
});

test('countTrackingGaps sorts a copy and counts only deltas strictly above the threshold', () => {
  const samples: GazeSample[] = [
    { t: 401, h: 0.5, v: 0.5 },
    { t: 0, h: 0.5, v: 0.5 },
    { t: 200, h: 0.5, v: 0.5 },
  ];
  const originalOrder = samples.map(sample => sample.t);

  assert.equal(countTrackingGaps(samples), 1);
  assert.deepEqual(samples.map(sample => sample.t), originalOrder);
  assert.equal(countTrackingGaps(samples, 201), 0);
});

test('countTrackingGaps preserves invalid timestamp evidence as a finite invalid sentinel', () => {
  for (const invalidTimestamp of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const gapCount = countTrackingGaps([
      { t: 0, h: 0.5, v: 0.5 },
      { t: invalidTimestamp, h: 0.5, v: 0.5 },
    ]);

    assert.equal(gapCount, -1, `timestamp ${String(invalidTimestamp)}`);
    const snapshot = assessCaptureValidity(validInput({ gapCount }));
    assert.equal(snapshot.grade, 'invalid');
    assert.deepEqual(snapshot.reasonCodes, ['capture-tracking-gap']);
    assert.equal(snapshot.gapCount, 0);
    assert.equal(Number.isFinite(snapshot.gapCount), true);
  }
});

test('countTrackingGaps preserves invalid threshold evidence as a finite invalid sentinel', () => {
  const samples: GazeSample[] = [
    { t: 0, h: 0.5, v: 0.5 },
    { t: 201, h: 0.5, v: 0.5 },
  ];

  for (const invalidThreshold of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const gapCount = countTrackingGaps(samples, invalidThreshold);

    assert.equal(gapCount, -1, `threshold ${String(invalidThreshold)}`);
    const snapshot = assessCaptureValidity(validInput({ gapCount }));
    assert.equal(snapshot.grade, 'invalid');
    assert.deepEqual(snapshot.reasonCodes, ['capture-tracking-gap']);
    assert.equal(snapshot.gapCount, 0);
    assert.equal(Number.isFinite(snapshot.gapCount), true);
  }
});

test('assessCaptureValidity records both page interruption reasons as invalid', () => {
  for (const interruption of ['page-hidden-during-capture', 'pagehide-during-capture'] as const) {
    const snapshot = assessCaptureValidity(validInput({ interruption }));
    assert.equal(snapshot.grade, 'invalid');
    assert.deepEqual(snapshot.reasonCodes, [interruption]);
    assert.equal(
      describeCaptureValidity(snapshot).primary,
      'Captura não utilizável — a página perdeu visibilidade',
    );
  }
});

test('assessCaptureValidity records route teardown without mislabelling it as pagehide', () => {
  const snapshot = assessCaptureValidity(validInput({ interruption: 'navigation-during-capture' }));
  const presentation = describeCaptureValidity(snapshot);

  assert.equal(snapshot.grade, 'invalid');
  assert.deepEqual(snapshot.reasonCodes, ['navigation-during-capture']);
  assert.equal(presentation.primary, 'Captura não utilizável — a tela de captura foi encerrada');
  assert.doesNotMatch(presentation.reasons.join(' '), /descarregada|visibilidade/i);
});

test('explicit camera stop during capture is canonical, invalid and described centrally', () => {
  const snapshot = assessCaptureValidity(validInput({ interruption: 'camera-stopped-during-capture' }));
  assert.equal(snapshot.grade, 'invalid');
  assert.deepEqual(snapshot.reasonCodes, ['camera-stopped-during-capture']);
  assert.equal(snapshot.interruption, 'camera-stopped-during-capture');
  assert.deepEqual(describeCaptureValidity(snapshot).reasons, ['A câmera foi parada durante a captura']);
});

test('geometry and orientation changes are canonical invalid interruptions', () => {
  const expected = [
    ['geometry-changed-during-capture', 'A geometria da superfície mudou durante a captura'],
    ['orientation-changed-during-capture', 'A orientação mudou durante a captura'],
  ] as const;
  for (const [interruption, description] of expected) {
    const snapshot = assessCaptureValidity(validInput({ interruption }));
    assert.equal(snapshot.grade, 'invalid');
    assert.deepEqual(snapshot.reasonCodes, [interruption]);
    assert.deepEqual(describeCaptureValidity(snapshot).reasons, [description]);
  }
});

test('pageInterruptionReason only interrupts visibility changes away from visible and always interrupts pagehide', () => {
  assert.equal(pageInterruptionReason('visibilitychange', 'visible'), null);
  assert.equal(pageInterruptionReason('visibilitychange', 'hidden'), 'page-hidden-during-capture');
  assert.equal(pageInterruptionReason('pagehide', 'visible'), 'pagehide-during-capture');
});

test('assessCaptureValidity fails unavailable signal source closed', () => {
  const snapshot = assessCaptureValidity(validInput({
    signalSource: 'unavailable',
    selectedSourceRatio: null,
  }));

  assert.equal(snapshot.grade, 'invalid');
  assert.deepEqual(snapshot.reasonCodes, [
    'capture-source-inconsistent',
    'capture-source-unavailable',
  ]);
});

test('assessCaptureValidity distinguishes unavailable and incompatible calibration evidence', () => {
  const unavailable = assessCaptureValidity(validInput({ calibrationAccepted: false }));
  const incompatible = assessCaptureValidity(validInput({ calibrationCompatible: false }));
  const raw = assessCaptureValidity(validInput({ signalSource: 'raw-mediapipe' }));

  assert.equal(unavailable.grade, 'exploratory');
  assert.deepEqual(unavailable.reasonCodes, ['capture-calibration-unavailable']);
  assert.equal(incompatible.grade, 'exploratory');
  assert.deepEqual(incompatible.reasonCodes, ['capture-calibration-incompatible']);
  assert.equal(raw.grade, 'exploratory');
  assert.deepEqual(raw.reasonCodes, ['capture-calibration-unavailable']);
});

test('assessCaptureValidity fails malformed numeric evidence closed and never persists NaN', () => {
  const cases: Array<[keyof CaptureValidityInput, unknown, CaptureValidityReasonCode]> = [
    ['durationMs', Number.NaN, 'capture-duration-too-short'],
    ['durationMs', Number.POSITIVE_INFINITY, 'capture-duration-too-short'],
    ['durationMs', -1, 'capture-duration-too-short'],
    ['coverage', Number.NaN, 'capture-coverage-below-threshold'],
    ['coverage', Number.POSITIVE_INFINITY, 'capture-coverage-below-threshold'],
    ['coverage', -1, 'capture-coverage-below-threshold'],
    ['coverage', 100.01, 'capture-coverage-below-threshold'],
    ['selectedSourceRatio', Number.NaN, 'capture-source-inconsistent'],
    ['selectedSourceRatio', Number.POSITIVE_INFINITY, 'capture-source-inconsistent'],
    ['selectedSourceRatio', -0.01, 'capture-source-inconsistent'],
    ['selectedSourceRatio', 1.01, 'capture-source-inconsistent'],
    ['selectedSourceRatio', null, 'capture-source-inconsistent'],
    ['sampleRateHz', Number.NaN, 'capture-insufficient-temporal'],
    ['sampleRateHz', Number.POSITIVE_INFINITY, 'capture-insufficient-temporal'],
    ['sampleRateHz', -1, 'capture-insufficient-temporal'],
    ['gapCount', Number.NaN, 'capture-tracking-gap'],
    ['gapCount', Number.POSITIVE_INFINITY, 'capture-tracking-gap'],
    ['gapCount', -1, 'capture-tracking-gap'],
    ['gapCount', 0.5, 'capture-tracking-gap'],
  ];

  for (const [field, value, reason] of cases) {
    const snapshot = assessCaptureValidity(validInput({ [field]: value } as Partial<CaptureValidityInput>));
    assert.equal(snapshot.grade, 'invalid', `${String(field)}=${String(value)}`);
    assert.ok(snapshot.reasonCodes.includes(reason), `${String(field)}=${String(value)}`);
    assert.equal(JSON.stringify(snapshot).includes('NaN'), false);
    for (const persistedValue of Object.values(snapshot)) {
      if (typeof persistedValue === 'number') assert.equal(Number.isFinite(persistedValue), true);
    }
  }
});

test('assessCaptureValidity keeps every applicable reason in canonical order and invalid wins grade precedence', () => {
  const snapshot = assessCaptureValidity(validInput({
    durationMs: 19_999,
    coverage: 70,
    selectedSourceRatio: 0.8,
    sampleRateHz: 30,
    calibrationAccepted: false,
    calibrationCompatible: false,
    gapCount: 2,
    interruption: 'pagehide-during-capture',
  }));

  assert.equal(snapshot.grade, 'invalid');
  assert.deepEqual(snapshot.reasonCodes, [
    'capture-duration-too-short',
    'capture-coverage-below-threshold',
    'capture-source-inconsistent',
    'capture-calibration-unavailable',
    'capture-coarse-temporal',
    'capture-tracking-gap',
    'pagehide-during-capture',
  ]);
});

test('captureValidityOrLegacy creates an exploratory, unassessed synthetic adapter', () => {
  const legacy = captureValidityOrLegacy(undefined);

  assert.deepEqual(legacy, {
    contractVersion: 1,
    assessedAt: null,
    grade: 'exploratory',
    reasonCodes: ['legacy-unassessed'],
    durationMs: null,
    coverage: null,
    signalSource: null,
    selectedSourceRatio: null,
    sampleRateHz: null,
    temporalTier: 'insufficient-temporal',
    gapCount: 0,
    interruption: null,
  });

  const assessed = assessCaptureValidity(validInput());
  assert.equal(captureValidityOrLegacy(assessed), assessed);
});

test('describeCaptureValidity owns the canonical text for every reason code', () => {
  const expected = new Map<CaptureValidityReasonCode, string>([
    ['capture-duration-too-short', 'Duração abaixo de 20 segundos'],
    ['capture-coverage-below-threshold', 'Cobertura facial abaixo de 80%'],
    ['capture-source-inconsistent', 'Fonte selecionada presente em menos de 90% das amostras'],
    ['capture-calibration-unavailable', 'Calibração aceita indisponível'],
    ['capture-calibration-incompatible', 'Calibração incompatível com a geometria da captura'],
    ['capture-device-class-unconfirmed', 'Classe de dispositivo ainda não confirmada'],
    ['capture-coarse-temporal', 'Taxa temporal entre 24 e 44,99 Hz'],
    ['capture-insufficient-temporal', 'Taxa temporal abaixo de 24 Hz ou indisponível'],
    ['capture-source-unavailable', 'Sinal ocular indisponível'],
    ['capture-tracking-gap', 'Intervalo de rastreamento acima de 200 ms'],
    ['page-hidden-during-capture', 'A página perdeu visibilidade durante a captura'],
    ['pagehide-during-capture', 'A página foi descarregada durante a captura'],
    ['navigation-during-capture', 'A tela de captura foi encerrada durante a medição'],
    ['camera-stopped-during-capture', 'A câmera foi parada durante a captura'],
    ['geometry-changed-during-capture', 'A geometria da superfície mudou durante a captura'],
    ['orientation-changed-during-capture', 'A orientação mudou durante a captura'],
    ['legacy-unassessed', 'Captura legada sem avaliação de validade'],
  ]);

  for (const [reason, text] of expected) {
    const snapshot = { ...captureValidityOrLegacy(undefined), reasonCodes: [reason] };
    assert.deepEqual(describeCaptureValidity(snapshot).reasons, [text], reason);
  }
});

test('capture validity UI copy derives the tracking-gap threshold from the contract', () => {
  assert.deepEqual(describeCaptureValidityContract(), { trackingGapLabel: 'Gaps > 200 ms' });
});

test('describeCaptureValidity derives grade presentation and primary-message priority centrally', () => {
  const comparable = assessCaptureValidity(validInput());
  assert.deepEqual(describeCaptureValidity(comparable), {
    label: 'Comparável',
    tone: 'emerald',
    primary: 'Captura apta para comparação',
    reasons: [],
  });

  const exploratory = assessCaptureValidity(validInput({ coverage: 70, gapCount: 1 }));
  assert.deepEqual(describeCaptureValidity(exploratory), {
    label: 'Exploratória',
    tone: 'amber',
    primary: 'Cobertura facial abaixo de 80%',
    reasons: [
      'Cobertura facial abaixo de 80%',
      'Intervalo de rastreamento acima de 200 ms',
    ],
  });

  const interrupted = assessCaptureValidity(validInput({
    durationMs: 10_000,
    interruption: 'page-hidden-during-capture',
  }));
  assert.equal(describeCaptureValidity(interrupted).label, 'Inválida');
  assert.equal(describeCaptureValidity(interrupted).tone, 'rose');
  assert.equal(
    describeCaptureValidity(interrupted).primary,
    'Captura não utilizável — a página perdeu visibilidade',
  );
});

test('CaptureValiditySnapshot signalSource remains aligned to the real SaccadeMetrics union', () => {
  const sources: Array<NonNullable<SaccadeMetrics['signalSource']>> = [
    'calibrated-mediapipe',
    'raw-mediapipe',
    'unavailable',
  ];
  assert.deepEqual(sources, ['calibrated-mediapipe', 'raw-mediapipe', 'unavailable']);
});

test('persisted comparable v1 validator accepts only internally coherent evidence', () => {
  const valid = assessCaptureValidity(validInput());
  assert.deepEqual(validatePersistedCaptureValidityForTrend(valid), { eligible: true, reason: null });

  const cases: Array<[string, Partial<CaptureValiditySnapshot>]> = [
    ['null assessedAt', { assessedAt: null }],
    ['short duration', { durationMs: 19_999 }],
    ['low coverage', { coverage: 79.99 }],
    ['low selected ratio', { selectedSourceRatio: 0.899 }],
    ['tracking gap', { gapCount: 1 }],
    ['pagehide interruption', { interruption: 'pagehide-during-capture' }],
    ['coarse rate promoted to high tier', { sampleRateHz: 44.99, temporalTier: 'high-temporal' }],
    ['raw source marked comparable', { signalSource: 'raw-mediapipe' }],
    ['reasons on comparable grade', { reasonCodes: ['capture-tracking-gap'] }],
  ];
  for (const [name, override] of cases) {
    const snapshot = { ...valid, ...override };
    const before = JSON.stringify(snapshot);
    assert.deepEqual(validatePersistedCaptureValidityForTrend(snapshot), {
      eligible: false,
      reason: 'validity-contract-contradiction',
    }, name);
    assert.equal(JSON.stringify(snapshot), before, `${name} must not mutate`);
  }
});

test('persisted validity validator distinguishes unsupported, malformed and non-comparable snapshots', () => {
  const valid = assessCaptureValidity(validInput());
  assert.deepEqual(validatePersistedCaptureValidityForTrend({ ...valid, contractVersion: 2 }), {
    eligible: false,
    reason: 'unsupported-validity-contract',
  });
  assert.deepEqual(validatePersistedCaptureValidityForTrend({ ...valid, reasonCodes: undefined }), {
    eligible: false,
    reason: 'malformed-validity-snapshot',
  });
  const exploratory = assessCaptureValidity(validInput({ sampleRateHz: 30 }));
  assert.deepEqual(validatePersistedCaptureValidityForTrend(exploratory), {
    eligible: false,
    reason: 'validity-grade-not-comparable',
  });
});

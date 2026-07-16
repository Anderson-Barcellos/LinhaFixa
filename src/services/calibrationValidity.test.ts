import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CALIBRATION_VALIDITY_CONTRACT_VERSION,
  assessCalibration,
  type CalibrationValidationPointEvidence,
} from './calibrationValidity';
import type { CalibrationSignature } from './ocularSignalContract';

const signature = (): CalibrationSignature => ({
  viewportWidth: 1000,
  viewportHeight: 700,
  orientation: 'landscape',
  devicePixelRatio: 2,
  surfaceRect: { left: 0, top: 0, width: 1000, height: 700 },
  videoWidth: 1280,
  videoHeight: 720,
});

const point = (
  errorsDeg = Array(12).fill(2),
  extrapolatedCount = 0,
  sampleCount = 12,
): CalibrationValidationPointEvidence => ({
  sampleCount,
  errorsDeg,
  extrapolatedCount,
});

const validInput = () => ({
  id: 'cal-1',
  createdAt: 100,
  fitSampleCounts: Array(9).fill(12),
  validationPoints: Array.from({ length: 5 }, () => point()),
  signature: signature(),
});

function assertAllNumbersFinite(value: unknown, path = 'assessment'): void {
  if (typeof value === 'number') {
    assert.equal(Number.isFinite(value), true, `${path} must be finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertAllNumbersFinite(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      assertAllNumbersFinite(item, `${path}.${key}`);
    }
  }
}

test('accepts the exact v1 boundaries with complete evidence', () => {
  const assessment = assessCalibration(validInput());

  assert.equal(CALIBRATION_VALIDITY_CONTRACT_VERSION, 1);
  assert.equal(assessment.contractVersion, 1);
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.reasonCodes, []);
  assert.equal(assessment.completeFitPoints, 9);
  assert.equal(assessment.completeValidationPoints, 5);
});

test('applies v1 acceptance boundaries and exact reason codes', () => {
  const p95Boundary = [...Array(56).fill(4), ...Array(4).fill(8)];
  const p95Above = [...Array(56).fill(4), ...Array(4).fill(8.01)];
  const cases: Array<{
    name: string;
    mutate: (input: ReturnType<typeof validInput>) => void;
    accepted: boolean;
    reasonCodes: string[];
  }> = [
    {
      name: 'exactly 12 samples',
      mutate: () => undefined,
      accepted: true,
      reasonCodes: [],
    },
    {
      name: '11 samples',
      mutate: input => { input.fitSampleCounts[0] = 11; },
      accepted: false,
      reasonCodes: [
        'calibration-insufficient-target-samples',
        'calibration-missing-fit-points',
      ],
    },
    {
      name: 'missing ninth fit point',
      mutate: input => { input.fitSampleCounts.pop(); },
      accepted: false,
      reasonCodes: ['calibration-missing-fit-points'],
    },
    {
      name: 'missing fifth validation point',
      mutate: input => { input.validationPoints.pop(); },
      accepted: false,
      reasonCodes: ['calibration-missing-validation-points'],
    },
    {
      name: 'exactly 5 degree mean',
      mutate: input => { input.validationPoints = Array.from({ length: 5 }, () => point(Array(12).fill(5))); },
      accepted: true,
      reasonCodes: [],
    },
    {
      name: 'mean above 5 degrees',
      mutate: input => { input.validationPoints = Array.from({ length: 5 }, () => point(Array(12).fill(5.01))); },
      accepted: false,
      reasonCodes: ['calibration-high-mean-error'],
    },
    {
      name: 'exactly 8 degree p95',
      mutate: input => {
        input.validationPoints = Array.from(
          { length: 5 },
          (_, index) => point(p95Boundary.slice(index * 12, index * 12 + 12)),
        );
      },
      accepted: true,
      reasonCodes: [],
    },
    {
      name: 'p95 above 8 degrees',
      mutate: input => {
        input.validationPoints = Array.from(
          { length: 5 },
          (_, index) => point(p95Above.slice(index * 12, index * 12 + 12)),
        );
      },
      accepted: false,
      reasonCodes: ['calibration-high-p95-error'],
    },
    {
      name: 'any extrapolation',
      mutate: input => { input.validationPoints[0].extrapolatedCount = 1; },
      accepted: false,
      reasonCodes: ['calibration-extrapolated-validation'],
    },
  ];

  for (const scenario of cases) {
    const input = validInput();
    scenario.mutate(input);
    const assessment = assessCalibration(input);
    assert.equal(assessment.accepted, scenario.accepted, scenario.name);
    assert.deepEqual(assessment.reasonCodes, scenario.reasonCodes, scenario.name);
  }
});

test('computes p95 over all samples instead of a mean of point means', () => {
  const errors = [...Array(56).fill(1), 5, 5, 8, 8];
  const input = validInput();
  input.id = 'cal-p95';
  input.createdAt = 200;
  input.validationPoints = Array.from(
    { length: 5 },
    (_, index) => point(errors.slice(index * 12, index * 12 + 12)),
  );

  const assessment = assessCalibration(input);

  assert.equal(assessment.p95ErrorDeg, 5);
  assert.equal(assessment.accepted, true);
});

test('fails closed for invalid counts without producing invalid metrics', () => {
  const cases: Array<{
    name: string;
    mutate: (input: ReturnType<typeof validInput>) => void;
    reasonCodes: string[];
  }> = [
    ...[NaN, Infinity, -1, 11.5].map(value => ({
      name: `fit count ${String(value)}`,
      mutate: (input: ReturnType<typeof validInput>) => { input.fitSampleCounts[0] = value; },
      reasonCodes: [
        'calibration-insufficient-target-samples',
        'calibration-missing-fit-points',
      ],
    })),
    ...[NaN, Infinity, -1, 11.5].map(value => ({
      name: `validation count ${String(value)}`,
      mutate: (input: ReturnType<typeof validInput>) => { input.validationPoints[0].sampleCount = value; },
      reasonCodes: [
        'calibration-insufficient-target-samples',
        'calibration-missing-validation-points',
      ],
    })),
    ...[NaN, Infinity, -1, 0.5].map(value => ({
      name: `extrapolated count ${String(value)}`,
      mutate: (input: ReturnType<typeof validInput>) => { input.validationPoints[0].extrapolatedCount = value; },
      reasonCodes: ['calibration-insufficient-target-samples'],
    })),
  ];

  for (const scenario of cases) {
    const input = validInput();
    scenario.mutate(input);
    const assessment = assessCalibration(input);
    assert.equal(assessment.accepted, false, scenario.name);
    assert.deepEqual(assessment.reasonCodes, scenario.reasonCodes, scenario.name);
    assert.equal(Number.isNaN(assessment.meanErrorDeg), false, scenario.name);
    assert.equal(Number.isNaN(assessment.p95ErrorDeg), false, scenario.name);
    assertAllNumbersFinite(assessment, scenario.name);
  }
});

test('fails closed for invalid or insufficient error observations', () => {
  const cases = [
    { name: 'NaN error', errors: [NaN, ...Array(11).fill(2)] },
    { name: 'infinite error', errors: [Infinity, ...Array(11).fill(2)] },
    { name: 'negative error', errors: [-1, ...Array(11).fill(2)] },
    { name: 'fewer than 12 errors', errors: Array(11).fill(2) },
  ];

  for (const scenario of cases) {
    const input = validInput();
    input.validationPoints[0].errorsDeg = scenario.errors;
    const assessment = assessCalibration(input);
    assert.equal(assessment.accepted, false, scenario.name);
    assert.deepEqual(assessment.reasonCodes, [
      'calibration-insufficient-target-samples',
      'calibration-missing-validation-points',
    ], scenario.name);
    assert.equal(Number.isNaN(assessment.meanErrorDeg), false, scenario.name);
    assert.equal(Number.isNaN(assessment.p95ErrorDeg), false, scenario.name);
  }
});

test('returns null metrics when no valid validation errors exist', () => {
  const input = validInput();
  input.validationPoints = Array.from({ length: 5 }, () => point([]));

  const assessment = assessCalibration(input);

  assert.equal(assessment.meanErrorDeg, null);
  assert.equal(assessment.p95ErrorDeg, null);
  assert.equal(assessment.accepted, false);
  assert.deepEqual(assessment.reasonCodes, [
    'calibration-insufficient-target-samples',
    'calibration-missing-validation-points',
  ]);
});

test('keeps reason codes in contract order', () => {
  const input = validInput();
  input.fitSampleCounts[0] = 11;
  input.validationPoints = Array.from({ length: 4 }, () => point(Array(12).fill(9), 1));

  const assessment = assessCalibration(input);

  assert.deepEqual(assessment.reasonCodes, [
    'calibration-insufficient-target-samples',
    'calibration-missing-fit-points',
    'calibration-missing-validation-points',
    'calibration-high-mean-error',
    'calibration-high-p95-error',
    'calibration-extrapolated-validation',
  ]);
});

test('clones input arrays and the nested calibration signature', () => {
  const input = validInput();
  const assessment = assessCalibration(input);

  input.fitSampleCounts[0] = 0;
  input.validationPoints[0].sampleCount = 0;
  input.signature.viewportWidth = 1;
  input.signature.surfaceRect.width = 1;

  assert.equal(assessment.fitSampleCounts[0], 12);
  assert.equal(assessment.validationSampleCounts[0], 12);
  assert.equal(assessment.signature.viewportWidth, 1000);
  assert.equal(assessment.signature.surfaceRect.width, 1000);

  assessment.fitSampleCounts[1] = 0;
  assessment.validationSampleCounts[1] = 0;
  assessment.signature.surfaceRect.height = 1;
  assert.equal(input.fitSampleCounts[1], 12);
  assert.equal(input.validationPoints[1].sampleCount, 12);
  assert.equal(input.signature.surfaceRect.height, 700);
});

test('fails closed and normalizes non-finite metadata and signature values', () => {
  const cases: Array<{
    name: string;
    mutate: (input: ReturnType<typeof validInput>) => void;
  }> = [
    { name: 'createdAt NaN', mutate: input => { input.createdAt = NaN; } },
    { name: 'viewport width Infinity', mutate: input => { input.signature.viewportWidth = Infinity; } },
    { name: 'surface width NaN', mutate: input => { input.signature.surfaceRect.width = NaN; } },
    { name: 'optional video height Infinity', mutate: input => { input.signature.videoHeight = Infinity; } },
  ];

  for (const scenario of cases) {
    const input = validInput();
    scenario.mutate(input);
    const assessment = assessCalibration(input);

    assert.equal(assessment.accepted, false, scenario.name);
    assert.deepEqual(
      assessment.reasonCodes,
      ['calibration-insufficient-target-samples'],
      scenario.name,
    );
    assertAllNumbersFinite(assessment, scenario.name);
  }
});

test('normalizes every non-finite number in the returned assessment', () => {
  const input = validInput();
  input.createdAt = Infinity;
  input.fitSampleCounts[0] = NaN;
  input.validationPoints[0].sampleCount = Infinity;
  input.validationPoints[0].extrapolatedCount = NaN;
  input.signature.devicePixelRatio = NaN;
  input.signature.surfaceRect.left = -Infinity;
  input.signature.videoWidth = Infinity;
  input.signature.trackFrameRate = NaN;

  const assessment = assessCalibration(input);

  assert.equal(assessment.accepted, false);
  assert.equal(assessment.createdAt, 0);
  assert.equal(assessment.fitSampleCounts[0], 0);
  assert.equal(assessment.validationSampleCounts[0], 0);
  assert.equal(assessment.signature.devicePixelRatio, 0);
  assert.equal(assessment.signature.surfaceRect.left, 0);
  assert.equal(assessment.signature.videoWidth, 0);
  assert.equal(assessment.signature.trackFrameRate, 0);
  assertAllNumbersFinite(assessment);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calibrationReuseDecision,
  calibrationSignatureMatches,
  viewportNormToRectPoint,
  type CalibrationSignature,
  type SurfaceRect,
} from './ocularSignalContract';
import type { CalibrationAssessment } from './calibrationValidity';

const reusableSignature = (): CalibrationSignature => ({
  viewportWidth: 932,
  viewportHeight: 430,
  orientation: 'landscape',
  devicePixelRatio: 3,
  surfaceRect: { left: 0, top: 0, width: 932, height: 430 },
  videoWidth: 1280,
  videoHeight: 720,
});

const acceptedAssessment = (): CalibrationAssessment => ({
  contractVersion: 1,
  id: 'cal-reusable',
  createdAt: 100,
  accepted: true,
  reasonCodes: [],
  fitSampleCounts: Array(9).fill(12),
  validationSampleCounts: Array(5).fill(12),
  completeFitPoints: 9,
  completeValidationPoints: 5,
  meanErrorDeg: 2,
  p95ErrorDeg: 3,
  extrapolatedValidationSamples: 0,
  signature: reusableSignature(),
});

test('viewportNormToRectPoint converts viewport-normalized gaze into canvas-local CSS pixels', () => {
  const rect: SurfaceRect = { left: 100, top: 50, width: 400, height: 300 };

  const point = viewportNormToRectPoint(
    { x: 0.5, y: 0.5 },
    rect,
    { width: 1000, height: 700 }
  );

  assert.deepEqual(point, { x: 400, y: 300, inBounds: true });
});

test('viewportNormToRectPoint preserves out-of-bounds evidence instead of silently clamping', () => {
  const rect: SurfaceRect = { left: 300, top: 200, width: 200, height: 100 };

  const point = viewportNormToRectPoint(
    { x: 0.1, y: 0.1 },
    rect,
    { width: 1000, height: 700 }
  );

  assert.equal(point.inBounds, false);
  assert.equal(point.x < 0, true);
  assert.equal(point.y < 0, true);
});

test('calibrationSignatureMatches rejects orientation and viewport aspect drift', () => {
  const signature: CalibrationSignature = {
    viewportWidth: 932,
    viewportHeight: 430,
    orientation: 'landscape',
    devicePixelRatio: 3,
    surfaceRect: { left: 0, top: 0, width: 650, height: 430 },
    videoWidth: 1280,
    videoHeight: 720,
  };

  assert.equal(calibrationSignatureMatches(signature, {
    viewportWidth: 932,
    viewportHeight: 430,
    orientation: 'landscape',
    devicePixelRatio: 3,
    surfaceRect: { left: 0, top: 0, width: 650, height: 430 },
    videoWidth: 1280,
    videoHeight: 720,
  }).matches, true);

  assert.equal(calibrationSignatureMatches(signature, {
    viewportWidth: 430,
    viewportHeight: 932,
    orientation: 'portrait',
    devicePixelRatio: 3,
    surfaceRect: { left: 0, top: 0, width: 430, height: 540 },
    videoWidth: 1280,
    videoHeight: 720,
  }).matches, false);
});

test('calibrationReuseDecision fails closed without an accepted assessment and signature', () => {
  const actual = reusableSignature();
  const rejected = acceptedAssessment();
  rejected.accepted = false;
  rejected.reasonCodes = ['calibration-high-mean-error'];
  const missingSignature = {
    ...acceptedAssessment(),
    signature: undefined,
  } as unknown as CalibrationAssessment;

  assert.deepEqual(calibrationReuseDecision(null, actual), {
    reusable: false,
    reasons: ['sem avaliacao de calibracao aceita'],
  });
  assert.deepEqual(calibrationReuseDecision(rejected, actual), {
    reusable: false,
    reasons: ['calibracao rejeitada'],
  });
  assert.deepEqual(calibrationReuseDecision(missingSignature, actual), {
    reusable: false,
    reasons: ['sem assinatura de calibracao'],
  });
});

test('calibrationReuseDecision reuses an accepted calibration only for matching geometry', () => {
  const assessment = acceptedAssessment();
  const exact = reusableSignature();

  assert.deepEqual(calibrationReuseDecision(assessment, exact), {
    reusable: true,
    reasons: [],
  });

  const cases: Array<{ name: string; actual: CalibrationSignature; expectedReason: string }> = [
    {
      name: 'orientation',
      actual: { ...exact, orientation: 'portrait' },
      expectedReason: 'orientacao mudou',
    },
    {
      name: 'DPR',
      actual: { ...exact, devicePixelRatio: 2 },
      expectedReason: 'devicePixelRatio mudou',
    },
    {
      name: 'surface',
      actual: { ...exact, surfaceRect: { ...exact.surfaceRect, width: 700 } },
      expectedReason: 'superficie de leitura mudou',
    },
    {
      name: 'video aspect',
      actual: { ...exact, videoWidth: 640, videoHeight: 640 },
      expectedReason: 'aspecto do video mudou',
    },
  ];

  for (const scenario of cases) {
    const geometry = calibrationSignatureMatches(assessment.signature, scenario.actual);
    const decision = calibrationReuseDecision(assessment, scenario.actual);
    assert.equal(decision.reusable, false, scenario.name);
    assert.deepEqual(decision.reasons, geometry.reasons, scenario.name);
    assert.equal(decision.reasons.includes(scenario.expectedReason), true, scenario.name);
  }
});

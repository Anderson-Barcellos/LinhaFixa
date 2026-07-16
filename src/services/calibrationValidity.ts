import type { CalibrationSignature } from './ocularSignalContract';

export const CALIBRATION_VALIDITY_CONTRACT_VERSION = 1;

export type CalibrationReasonCode =
  | 'calibration-insufficient-target-samples'
  | 'calibration-missing-fit-points'
  | 'calibration-missing-validation-points'
  | 'calibration-high-mean-error'
  | 'calibration-high-p95-error'
  | 'calibration-extrapolated-validation';

export interface CalibrationValidationPointEvidence {
  sampleCount: number;
  errorsDeg: number[];
  extrapolatedCount: number;
}

export interface CalibrationAssessment {
  contractVersion: 1;
  id: string;
  createdAt: number;
  accepted: boolean;
  reasonCodes: CalibrationReasonCode[];
  fitSampleCounts: number[];
  validationSampleCounts: number[];
  completeFitPoints: number;
  completeValidationPoints: number;
  meanErrorDeg: number | null;
  p95ErrorDeg: number | null;
  extrapolatedValidationSamples: number;
  signature: CalibrationSignature;
}

const MIN_SAMPLES = 12;
const FIT_POINTS = 9;
const VALIDATION_POINTS = 5;
const MAX_MEAN_ERROR_DEG = 5;
const MAX_P95_ERROR_DEG = 8;

export function assessCalibration(input: {
  id: string;
  createdAt: number;
  fitSampleCounts: number[];
  validationPoints: CalibrationValidationPointEvidence[];
  signature: CalibrationSignature;
}): CalibrationAssessment {
  const fitSampleCounts = [...input.fitSampleCounts];
  const validationPoints = input.validationPoints.map(point => ({
    sampleCount: point.sampleCount,
    errorsDeg: [...point.errorsDeg],
    extrapolatedCount: point.extrapolatedCount,
  }));
  const validationSampleCounts = validationPoints.map(point => point.sampleCount);

  const validFitCount = (count: number) => Number.isInteger(count) && count >= MIN_SAMPLES;
  const completeFitPoints = fitSampleCounts.filter(validFitCount).length;
  let insufficientEvidence = fitSampleCounts.some(count => !validFitCount(count));

  let completeValidationPoints = 0;
  let extrapolatedValidationSamples = 0;
  const validationErrors: number[] = [];

  for (const point of validationPoints) {
    const sampleCountValid = Number.isInteger(point.sampleCount) && point.sampleCount >= MIN_SAMPLES;
    const extrapolatedCountValid = Number.isInteger(point.extrapolatedCount) && point.extrapolatedCount >= 0;
    const validErrors = point.errorsDeg.filter(error => Number.isFinite(error) && error >= 0);
    const errorsValid = validErrors.length === point.errorsDeg.length;
    const enoughErrors = validErrors.length >= MIN_SAMPLES;

    if (sampleCountValid && errorsValid && enoughErrors) {
      completeValidationPoints += 1;
    }
    if (!sampleCountValid || !extrapolatedCountValid || !errorsValid || !enoughErrors) {
      insufficientEvidence = true;
    }
    if (extrapolatedCountValid) {
      extrapolatedValidationSamples += point.extrapolatedCount;
    }
    validationErrors.push(...validErrors);
  }

  const meanErrorDeg = validationErrors.length === 0
    ? null
    : validationErrors.reduce((sum, error) => sum + error, 0) / validationErrors.length;
  const p95ErrorDeg = percentile(validationErrors, 0.95);
  const reasonCodes: CalibrationReasonCode[] = [];

  if (insufficientEvidence) {
    reasonCodes.push('calibration-insufficient-target-samples');
  }
  if (completeFitPoints < FIT_POINTS) {
    reasonCodes.push('calibration-missing-fit-points');
  }
  if (completeValidationPoints < VALIDATION_POINTS) {
    reasonCodes.push('calibration-missing-validation-points');
  }
  if (meanErrorDeg !== null && meanErrorDeg > MAX_MEAN_ERROR_DEG) {
    reasonCodes.push('calibration-high-mean-error');
  }
  if (p95ErrorDeg !== null && p95ErrorDeg > MAX_P95_ERROR_DEG) {
    reasonCodes.push('calibration-high-p95-error');
  }
  if (extrapolatedValidationSamples > 0) {
    reasonCodes.push('calibration-extrapolated-validation');
  }

  return {
    contractVersion: CALIBRATION_VALIDITY_CONTRACT_VERSION,
    id: input.id,
    createdAt: input.createdAt,
    accepted: reasonCodes.length === 0,
    reasonCodes,
    fitSampleCounts,
    validationSampleCounts,
    completeFitPoints,
    completeValidationPoints,
    meanErrorDeg,
    p95ErrorDeg,
    extrapolatedValidationSamples,
    signature: cloneSignature(input.signature),
  };
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return lo === hi
    ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

function cloneSignature(signature: CalibrationSignature): CalibrationSignature {
  return {
    ...signature,
    surfaceRect: { ...signature.surfaceRect },
  };
}

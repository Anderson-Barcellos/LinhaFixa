import type { CalibrationSignature } from './ocularSignalContract';

export const CALIBRATION_VALIDITY_CONTRACT_VERSION = 1;

export const CALIBRATION_VALIDITY_CONTRACT = Object.freeze({
  version: CALIBRATION_VALIDITY_CONTRACT_VERSION,
  minimumSamplesPerPoint: 12,
  requiredFitPoints: 9,
  requiredValidationPoints: 5,
  maximumMeanErrorDeg: 5,
  maximumP95ErrorDeg: 8,
});

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

const CALIBRATION_REASON_TEXT: Record<CalibrationReasonCode, string> = {
  'calibration-insufficient-target-samples': 'Não houve amostras suficientes em todos os pontos.',
  'calibration-missing-fit-points': 'A grade principal de calibração não foi concluída.',
  'calibration-missing-validation-points': 'A verificação independente não foi concluída.',
  'calibration-high-mean-error': `O erro médio ficou acima do limite de ${CALIBRATION_VALIDITY_CONTRACT.maximumMeanErrorDeg}°.`,
  'calibration-high-p95-error': `A variação do erro ficou acima do limite de ${CALIBRATION_VALIDITY_CONTRACT.maximumP95ErrorDeg}°.`,
  'calibration-extrapolated-validation': 'O modelo extrapolou fora da região calibrada.',
};

export function assessCalibration(input: {
  id: string;
  createdAt: number;
  fitSampleCounts: number[];
  validationPoints: CalibrationValidationPointEvidence[];
  signature: CalibrationSignature;
}): CalibrationAssessment {
  const fitSampleCounts = input.fitSampleCounts.map(finiteOrZero);
  const validationPoints = input.validationPoints.map(point => ({
    sampleCount: point.sampleCount,
    errorsDeg: [...point.errorsDeg],
    extrapolatedCount: point.extrapolatedCount,
  }));
  const validationSampleCounts = validationPoints.map(point => finiteOrZero(point.sampleCount));

  const validFitCount = (count: number) => Number.isInteger(count)
    && count >= CALIBRATION_VALIDITY_CONTRACT.minimumSamplesPerPoint;
  const completeFitPoints = input.fitSampleCounts.filter(validFitCount).length;
  let insufficientEvidence = !Number.isFinite(input.createdAt)
    || !signatureNumbersAreFinite(input.signature)
    || input.fitSampleCounts.some(count => !validFitCount(count));

  let completeValidationPoints = 0;
  let extrapolatedValidationSamples = 0;
  const validationErrors: number[] = [];

  for (const point of validationPoints) {
    const sampleCountValid = Number.isInteger(point.sampleCount)
      && point.sampleCount >= CALIBRATION_VALIDITY_CONTRACT.minimumSamplesPerPoint;
    const extrapolatedCountValid = Number.isInteger(point.extrapolatedCount) && point.extrapolatedCount >= 0;
    const validErrors = point.errorsDeg.filter(error => Number.isFinite(error) && error >= 0);
    const errorsValid = validErrors.length === point.errorsDeg.length;
    const enoughErrors = validErrors.length >= CALIBRATION_VALIDITY_CONTRACT.minimumSamplesPerPoint;

    if (sampleCountValid && errorsValid && enoughErrors) {
      completeValidationPoints += 1;
    }
    if (!sampleCountValid || !extrapolatedCountValid || !errorsValid || !enoughErrors) {
      insufficientEvidence = true;
    }
    if (extrapolatedCountValid) {
      extrapolatedValidationSamples = addFiniteNonNegative(
        extrapolatedValidationSamples,
        point.extrapolatedCount,
      );
    }
    validationErrors.push(...validErrors);
  }

  const meanErrorDeg = mean(validationErrors);
  const p95ErrorDeg = percentile(validationErrors, 0.95);
  const reasonCodes: CalibrationReasonCode[] = [];

  if (insufficientEvidence) {
    reasonCodes.push('calibration-insufficient-target-samples');
  }
  if (completeFitPoints < CALIBRATION_VALIDITY_CONTRACT.requiredFitPoints) {
    reasonCodes.push('calibration-missing-fit-points');
  }
  if (completeValidationPoints < CALIBRATION_VALIDITY_CONTRACT.requiredValidationPoints) {
    reasonCodes.push('calibration-missing-validation-points');
  }
  if (meanErrorDeg !== null && meanErrorDeg > CALIBRATION_VALIDITY_CONTRACT.maximumMeanErrorDeg) {
    reasonCodes.push('calibration-high-mean-error');
  }
  if (p95ErrorDeg !== null && p95ErrorDeg > CALIBRATION_VALIDITY_CONTRACT.maximumP95ErrorDeg) {
    reasonCodes.push('calibration-high-p95-error');
  }
  if (extrapolatedValidationSamples > 0) {
    reasonCodes.push('calibration-extrapolated-validation');
  }

  return {
    contractVersion: CALIBRATION_VALIDITY_CONTRACT_VERSION,
    id: input.id,
    createdAt: finiteOrZero(input.createdAt),
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

export function describeCalibrationAssessment(assessment: CalibrationAssessment): {
  accepted: boolean;
  reasons: string[];
} {
  return {
    accepted: assessment.accepted,
    reasons: assessment.reasonCodes.map(reason => CALIBRATION_REASON_TEXT[reason]),
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

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let result = 0;
  for (let index = 0; index < values.length; index++) {
    result += (values[index] - result) / (index + 1);
  }
  return result;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function finiteOptionalOrZero(value: number | undefined): number | undefined {
  return value === undefined ? undefined : finiteOrZero(value);
}

function addFiniteNonNegative(total: number, value: number): number {
  return total > Number.MAX_VALUE - value ? Number.MAX_VALUE : total + value;
}

function signatureNumbersAreFinite(signature: CalibrationSignature): boolean {
  return [
    signature.viewportWidth,
    signature.viewportHeight,
    signature.devicePixelRatio,
    signature.surfaceRect.left,
    signature.surfaceRect.top,
    signature.surfaceRect.width,
    signature.surfaceRect.height,
    signature.videoWidth,
    signature.videoHeight,
    signature.trackFrameRate,
  ].every(value => value === undefined || Number.isFinite(value));
}

function cloneSignature(signature: CalibrationSignature): CalibrationSignature {
  return {
    viewportWidth: finiteOrZero(signature.viewportWidth),
    viewportHeight: finiteOrZero(signature.viewportHeight),
    orientation: signature.orientation,
    devicePixelRatio: finiteOrZero(signature.devicePixelRatio),
    surfaceRect: {
      left: finiteOrZero(signature.surfaceRect.left),
      top: finiteOrZero(signature.surfaceRect.top),
      width: finiteOrZero(signature.surfaceRect.width),
      height: finiteOrZero(signature.surfaceRect.height),
    },
    videoWidth: finiteOptionalOrZero(signature.videoWidth),
    videoHeight: finiteOptionalOrZero(signature.videoHeight),
    trackFrameRate: finiteOptionalOrZero(signature.trackFrameRate),
  };
}

// Gaze calibration model: maps the per-frame gaze feature vector (from
// faceTracking.extractGazeFeatures) to normalized screen coordinates in [0,1],
// using ridge regression fitted on a short on-screen calibration routine.
//
// Why our own model: we only need a smooth, low-dimensional mapping from features
// (iris ratios + head pose + eyeLook blendshapes) to where the user looks on THIS
// screen, at THIS distance. Ridge regression (closed form) is cheap, stable with
// few samples, and runs fully on-device.
//
// Honest limits: a consumer webcam gives an approximate point of gaze with
// device/browser-dependent frame rate and limited angular accuracy.
// gaze. Head movement and lighting changes degrade it; recalibration fixes drift.

import { GAZE_FEATURE_LENGTH } from './faceTracking';
import { purgeLeadingBlinkSamples, BLINK_LEADING_PURGE_MS } from './blinkGate';
import type { CalibrationAssessment } from './calibrationValidity';
import type { CalibrationSignature } from './ocularSignalContract';

interface Sample {
  t: number; // ms — permite purga retroativa da borda de subida da piscada
  features: number[];
  target: { x: number; y: number }; // normalized [0,1] screen coords
}

// Ridge penalty. Small relative to the feature scale; tuned for ~10-13 features and
// a few hundred samples.
const LAMBDA = 1e-3;

interface CalibrationModel {
  weightsX: number[];
  weightsY: number[];
  featureMean: number[];
  featureStd: number[];
}

export interface GazePrediction {
  x: number;
  y: number;
  extrapolated: boolean;
}

let samples: Sample[] = [];
let pendingModel: CalibrationModel | null = null;
let activeModel: CalibrationModel | null = null;
let calibrationAssessment: CalibrationAssessment | null = null;
let accuracyDeg: number | null = null; // validation accuracy, for display
let calibrationSignature: CalibrationSignature | null = null;

export function resetCalibration() {
  samples = [];
  pendingModel = null;
  activeModel = null;
  calibrationAssessment = null;
  accuracyDeg = null;
  calibrationSignature = null;
}

// Standardize a raw feature vector with the fit-local or model-owned mean/std.
// A zero std (a feature that never varied during calibration) maps to 0 so it
// contributes nothing.
function standardizeFeatures(
  features: number[],
  mean: number[],
  std: number[],
): number[] {
  return features.map((v, i) => {
    const s = std[i];
    return s > 1e-9 ? (v - mean[i]) / s : 0;
  });
}

// Buffer one labelled calibration sample (a feature vector seen while the user
// looked at a target at the given normalized screen position).
export function addCalibrationSample(features: number[], target: { x: number; y: number }, tMs: number) {
  if (features.length !== GAZE_FEATURE_LENGTH) return;
  samples.push({ t: tMs, features: features.slice(), target });
}

export function calibrationSampleCount(): number {
  return samples.length;
}

// Borda de subida da piscada detectada AGORA: as amostras dos últimos windowMs
// entraram no buffer com a pálpebra já descendo (score ainda abaixo do enter) e
// contaminariam o ridge fit — o modelo treinado espalha o erro para TODAS as
// medidas posteriores. Mesma semântica da purga do buffer de traçado.
export function purgeRecentCalibrationSamples(
  nowMs: number,
  windowMs: number = BLINK_LEADING_PURGE_MS,
): number {
  const before = samples.length;
  purgeLeadingBlinkSamples(samples, nowMs, windowMs);
  return before - samples.length;
}

// Solve A x = B (A: d×d, B: d×k) via Gaussian elimination with partial pivoting.
// Returns the d×k solution, or null if A is singular.
function solveLinearSystem(A: number[][], B: number[][]): number[][] | null {
  const d = A.length;
  const k = B[0].length;
  // Work on copies augmented as [A | B].
  const m = A.map((row, i) => [...row, ...B[i]]);

  for (let col = 0; col < d; col++) {
    // Partial pivot.
    let pivot = col;
    for (let r = col + 1; r < d; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];

    const pivVal = m[col][col];
    for (let j = col; j < d + k; j++) m[col][j] /= pivVal;

    for (let r = 0; r < d; r++) {
      if (r === col) continue;
      const factor = m[r][col];
      if (factor === 0) continue;
      for (let j = col; j < d + k; j++) m[r][j] -= factor * m[col][j];
    }
  }

  // Extract the solution columns.
  const out: number[][] = [];
  for (let i = 0; i < d; i++) out.push(m[i].slice(d));
  return out;
}

// Fit the ridge-regression models for X and Y from the buffered samples. Returns
// true on success. Needs enough samples to be meaningful.
export function fitCalibration(): boolean {
  pendingModel = null;
  if (samples.length < GAZE_FEATURE_LENGTH + 2) return false;

  const d = GAZE_FEATURE_LENGTH + 1; // + bias

  // Per-feature mean/std over the calibration samples (population std).
  const n = samples.length;
  const mean = new Array(GAZE_FEATURE_LENGTH).fill(0);
  for (const s of samples) for (let i = 0; i < GAZE_FEATURE_LENGTH; i++) mean[i] += s.features[i];
  for (let i = 0; i < GAZE_FEATURE_LENGTH; i++) mean[i] /= n;
  const variance = new Array(GAZE_FEATURE_LENGTH).fill(0);
  for (const s of samples) for (let i = 0; i < GAZE_FEATURE_LENGTH; i++) {
    const diff = s.features[i] - mean[i];
    variance[i] += diff * diff;
  }
  const std = variance.map(v => Math.sqrt(v / n));

  // Design rows with a leading bias term, over features standardized with the LOCAL
  // stats (not yet committed to module state — see below, after the solve succeeds).
  const rows = samples.map(s => [1, ...standardizeFeatures(s.features, mean, std)]);

  // Normal equations: A = XᵀX + λI (bias term left unregularized), B = Xᵀ[yX yY].
  const A: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
  const B: number[][] = Array.from({ length: d }, () => [0, 0]);

  for (let n = 0; n < rows.length; n++) {
    const row = rows[n];
    const tx = samples[n].target.x;
    const ty = samples[n].target.y;
    for (let i = 0; i < d; i++) {
      B[i][0] += row[i] * tx;
      B[i][1] += row[i] * ty;
      for (let j = 0; j < d; j++) {
        A[i][j] += row[i] * row[j];
      }
    }
  }
  for (let i = 1; i < d; i++) A[i][i] += LAMBDA; // skip bias (index 0)

  const sol = solveLinearSystem(A, B);
  if (!sol) return false;

  // Commit standardization stats and weights together to a pending model. It becomes
  // active only after the independent evidence contract accepts this calibration.
  pendingModel = {
    featureMean: mean,
    featureStd: std,
    weightsX: sol.map(r => r[0]),
    weightsY: sol.map(r => r[1]),
  };
  return true;
}

export function isCalibrated(): boolean {
  return activeModel !== null && calibrationAssessment?.accepted === true;
}

// Predict the normalized [0,1] screen position of gaze for a feature vector.
// Returns null when not calibrated or the feature vector is the wrong shape.
// `extrapolated` is true when the raw prediction fell outside [0,1] on either
// axis: the returned point is clamped for safe display, but a clamped border
// point is a fabricated position, not a measured one — consumers must not
// treat it as a valid fixation at the edge.
export function predictNorm(features: number[]): GazePrediction | null {
  return predictWithModel(activeModel, features);
}

export function predictPendingNorm(features: number[]): GazePrediction | null {
  return predictWithModel(pendingModel, features);
}

function predictWithModel(model: CalibrationModel | null, features: number[]): GazePrediction | null {
  if (!model || features.length !== GAZE_FEATURE_LENGTH) return null;
  const row = [1, ...standardizeFeatures(features, model.featureMean, model.featureStd)];
  let x = 0, y = 0;
  for (let i = 0; i < row.length; i++) {
    x += row[i] * model.weightsX[i];
    y += row[i] * model.weightsY[i];
  }
  const extrapolated = x < 0 || x > 1 || y < 0 || y > 1;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp01(x), y: clamp01(y), extrapolated };
}

export function acceptPendingCalibration(assessment: CalibrationAssessment): boolean {
  if (!assessment.accepted || !pendingModel) return false;

  const acceptedAssessment = cloneAssessment(assessment);
  activeModel = pendingModel;
  pendingModel = null;
  calibrationAssessment = acceptedAssessment;
  calibrationSignature = cloneSignature(acceptedAssessment.signature);
  accuracyDeg = acceptedAssessment.meanErrorDeg;
  return true;
}

export function rejectCalibration(assessment?: CalibrationAssessment | null): void {
  pendingModel = null;
  activeModel = null;
  calibrationAssessment = assessment ? cloneAssessment(assessment) : null;
  accuracyDeg = null;
  calibrationSignature = null;
}

export function getCalibrationAssessment(): CalibrationAssessment | null {
  return calibrationAssessment ? cloneAssessment(calibrationAssessment) : null;
}

export function getAccuracyDeg(): number | null {
  return accuracyDeg;
}

export function getCalibrationSignature(): CalibrationSignature | null {
  return calibrationSignature ? cloneSignature(calibrationSignature) : null;
}

function cloneAssessment(assessment: CalibrationAssessment): CalibrationAssessment {
  return {
    ...assessment,
    reasonCodes: [...assessment.reasonCodes],
    fitSampleCounts: [...assessment.fitSampleCounts],
    validationSampleCounts: [...assessment.validationSampleCounts],
    signature: cloneSignature(assessment.signature),
  };
}

function cloneSignature(signature: CalibrationSignature): CalibrationSignature {
  return {
    ...signature,
    surfaceRect: { ...signature.surfaceRect },
  };
}

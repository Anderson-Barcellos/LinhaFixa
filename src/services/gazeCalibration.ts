// Gaze calibration model: maps the per-frame gaze feature vector (from
// faceTracking.extractGazeFeatures) to normalized screen coordinates in [0,1],
// using ridge regression fitted on a short on-screen calibration routine.
//
// Why our own model: we only need a smooth, low-dimensional mapping from features
// (iris ratios + head pose + eyeLook blendshapes) to where the user looks on THIS
// screen, at THIS distance. Ridge regression (closed form) is cheap, stable with
// few samples, and runs fully on-device.
//
// Honest limits: a consumer webcam (~30Hz, ~1-2 deg) gives an approximate point of
// gaze. Head movement and lighting changes degrade it; recalibration fixes drift.

import { GAZE_FEATURE_LENGTH } from './faceTracking';

interface Sample {
  features: number[];
  target: { x: number; y: number }; // normalized [0,1] screen coords
}

// Ridge penalty. Small relative to the feature scale; tuned for ~10-13 features and
// a few hundred samples.
const LAMBDA = 1e-3;

let samples: Sample[] = [];
let weightsX: number[] | null = null; // length GAZE_FEATURE_LENGTH + 1 (bias first)
let weightsY: number[] | null = null;
let accuracyDeg: number | null = null; // validation accuracy, for display

export function resetCalibration() {
  samples = [];
  weightsX = null;
  weightsY = null;
  accuracyDeg = null;
}

// Buffer one labelled calibration sample (a feature vector seen while the user
// looked at a target at the given normalized screen position).
export function addCalibrationSample(features: number[], target: { x: number; y: number }) {
  if (features.length !== GAZE_FEATURE_LENGTH) return;
  samples.push({ features: features.slice(), target });
}

export function calibrationSampleCount(): number {
  return samples.length;
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
  if (samples.length < GAZE_FEATURE_LENGTH + 2) return false;

  const d = GAZE_FEATURE_LENGTH + 1; // + bias
  // Design rows with a leading bias term.
  const rows = samples.map(s => [1, ...s.features]);

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

  weightsX = sol.map(r => r[0]);
  weightsY = sol.map(r => r[1]);
  return true;
}

export function isCalibrated(): boolean {
  return weightsX !== null && weightsY !== null;
}

// Predict the normalized [0,1] screen position of gaze for a feature vector.
// Returns null when not calibrated or the feature vector is the wrong shape.
export function predictNorm(features: number[]): { x: number; y: number } | null {
  if (!weightsX || !weightsY || features.length !== GAZE_FEATURE_LENGTH) return null;
  const row = [1, ...features];
  let x = 0, y = 0;
  for (let i = 0; i < row.length; i++) {
    x += row[i] * weightsX[i];
    y += row[i] * weightsY[i];
  }
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp01(x), y: clamp01(y) };
}

// Store/read the validation accuracy (mean error in degrees) for display in the UI.
export function setAccuracyDeg(deg: number | null) {
  accuracyDeg = deg;
}
export function getAccuracyDeg(): number | null {
  return accuracyDeg;
}

import type { Fixation } from './fixationDetection';

// Saccades derived from fixations, not detected on their own.
//
// A webcam cannot resolve a saccade's internal trajectory (30-80ms of movement
// sampled 1-5 times), but it resolves very well WHERE the eye came to rest before
// and after. So a saccade here is the transition between two consecutive
// fixations: its amplitude is the distance between their centroids, its direction
// is the sign of that displacement, and its window is the interval separating
// them. Nothing about it depends on the sampling rate.

export interface DerivedSaccade {
  amplitude: number; // signed: positive = rightward (reading direction)
  tStart: number;    // end of the preceding fixation
  tEnd: number;      // start of the following fixation
}

export interface SaccadesFromFixationsOptions {
  // Displacement below this is centroid wobble between two nearby fixations
  // rather than a real jump of the eye.
  minAmplitude?: number;
}

export const DEFAULT_MIN_SACCADE_AMPLITUDE = 0.04;

export function saccadesFromFixations(
  fixations: Fixation[],
  options: SaccadesFromFixationsOptions = {},
): DerivedSaccade[] {
  const minAmplitude = options.minAmplitude ?? DEFAULT_MIN_SACCADE_AMPLITUDE;
  const out: DerivedSaccade[] = [];
  for (let i = 1; i < fixations.length; i++) {
    const from = fixations[i - 1];
    const to = fixations[i];
    const amplitude = to.centroidH - from.centroidH;
    if (Math.abs(amplitude) < minAmplitude) continue;
    out.push({ amplitude, tStart: from.tEnd, tEnd: to.tStart });
  }
  return out;
}

// --- Dispersion threshold, derived from the capture's own signal ---
//
// The same detector runs over two very different scales: calibrated gaze (canvas
// fractions, a line of text spans much of 0..1) and raw iris ratios (which squeeze
// a whole line into ~0.2 — saccadeAnalysis.ts documents this for the line-return
// cut). A fixed dispersion threshold would merge every fixation into one on the
// raw path. Scaling by the capture's own extent keeps the detector honest on both,
// bounded so a degenerate span cannot open or close the gate entirely.

const DISPERSION_RELATIVE_FACTOR = 0.12; // fraction of the capture's total extent
const DISPERSION_FLOOR = 0.01;
const DISPERSION_CAP = 0.20;
const DISPERSION_FALLBACK = 0.05;

export function dispersionThresholdFor(signalSpan: number): number {
  if (!Number.isFinite(signalSpan) || signalSpan <= 0) return DISPERSION_FALLBACK;
  return Math.min(
    DISPERSION_CAP,
    Math.max(DISPERSION_FLOOR, DISPERSION_RELATIVE_FACTOR * signalSpan),
  );
}

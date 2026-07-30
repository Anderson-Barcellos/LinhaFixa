import type { GazeSample } from '@/types';

// Dispersion-threshold (I-DT) fixation detector over webcam gaze samples.
//
// WHY NOT VELOCITY (I-VT): a human saccade lasts 30-80ms. At 30fps (33ms/frame)
// that is 1-2 samples; at 60fps, 2-5. Estimating the velocity *inside* a saccade
// from 1-2 samples is below Nyquist — it is not noisy, it is unresolvable, and no
// threshold tuning fixes it. Worse, a fixed velocity cut makes the smallest
// detectable amplitude a function of dt (0.083 ratio units at 30fps vs 0.042 at
// 60fps), so the same eye yields different saccade counts on different cameras
// and the series stops being comparable with itself.
//
// A fixation, by contrast, lasts 200-300ms — 6 to 18 samples in the same range.
// That IS resolvable. So we detect what the instrument can actually see (the eye
// standing still) and derive saccades as the transitions between fixations.
//
// FPS-INVARIANCE BY CONSTRUCTION: every parameter here is a duration in
// milliseconds or a spatial threshold in signal units. Nothing is expressed in
// frames or in per-sample deltas, so replaying the same eye movement at 30fps and
// 60fps yields the same fixations (proven in fixationDetection.test.ts).
//
// Reference: Salvucci & Goldberg (2000), "Identifying fixations and saccades in
// eye-tracking protocols" — dispersion is defined as the summed horizontal and
// vertical extent of the window.

export interface Fixation {
  tStart: number;
  tEnd: number;
  durationMs: number;
  centroidH: number;
  centroidV: number;
  sampleCount: number;
}

export interface DetectFixationsOptions {
  // Maximum summed h+v extent a window may span and still count as one fixation.
  // Units follow the signal: canvas fractions when calibrated, iris ratios when raw.
  dispersionThreshold: number;
  // Shortest window accepted as a fixation. 100ms is conservative for reading,
  // where fixations run 200-300ms; below this it is more likely a fly-through.
  minDurationMs?: number;
  // A gap longer than this means tracking dropped out (face lost, tab hidden).
  // The eye could have gone anywhere in the hole, so the fixation is closed
  // rather than spanned.
  maxGapMs?: number;
}

export const DEFAULT_MIN_FIXATION_MS = 100;
export const DEFAULT_MAX_GAP_MS = 200;

// --- Full Hooge pipeline: short candidates → merge → post-hoc selection ---
//
// The 100ms cut must happen AFTER merging: applied during detection (the old
// behaviour) it discards 40-99ms fragments before the merge step could recover
// them. 40ms is the candidate floor (≈1 frame at 30fps survives nothing shorter);
// 100ms remains the published minimum — selection just moved to the end.

export const CANDIDATE_MIN_FIXATION_MS = 40;
export const DEFAULT_MERGE_GAP_MS = 100;

export interface DetectMergedFixationsOptions {
  dispersionThreshold: number;
  minDurationMs?: number;   // seleção final, default DEFAULT_MIN_FIXATION_MS (100)
  maxGapMs?: number;        // default DEFAULT_MAX_GAP_MS (200)
  maxMergeGapMs?: number;   // default DEFAULT_MERGE_GAP_MS (100)
}

// Summed horizontal and vertical extent of a window (Salvucci & Goldberg).
export function dispersion(samples: GazeSample[]): number {
  if (samples.length === 0) return 0;
  let minH = Infinity, maxH = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const s of samples) {
    if (s.h < minH) minH = s.h;
    if (s.h > maxH) maxH = s.h;
    if (s.v < minV) minV = s.v;
    if (s.v > maxV) maxV = s.v;
  }
  return (maxH - minH) + (maxV - minV);
}

function toFixation(window: GazeSample[]): Fixation {
  let sumH = 0, sumV = 0;
  for (const s of window) { sumH += s.h; sumV += s.v; }
  const tStart = window[0].t;
  const tEnd = window[window.length - 1].t;
  return {
    tStart,
    tEnd,
    durationMs: tEnd - tStart,
    centroidH: sumH / window.length,
    centroidV: sumV / window.length,
    sampleCount: window.length,
  };
}

export function detectFixations(
  samples: GazeSample[],
  options: DetectFixationsOptions,
): Fixation[] {
  const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_FIXATION_MS;
  const maxGapMs = options.maxGapMs ?? DEFAULT_MAX_GAP_MS;

  const valid = samples
    .filter(s => Number.isFinite(s.t) && Number.isFinite(s.h) && Number.isFinite(s.v))
    .sort((a, b) => a.t - b.t);
  if (valid.length < 2) return [];

  const fixations: Fixation[] = [];
  let start = 0;

  while (start < valid.length) {
    // Grow a window from `start` while the gaze stays within the dispersion
    // threshold and no tracking gap intervenes. The extent is tracked
    // incrementally (min/max per axis) so extending a long fixation stays O(1)
    // per sample instead of rescanning the window.
    let end = start;
    let minH = valid[start].h, maxH = minH;
    let minV = valid[start].v, maxV = minV;

    while (end + 1 < valid.length) {
      const next = valid[end + 1];
      // A gap means tracking dropped out; the eye could have gone anywhere in the
      // hole, so a fixation may never span it.
      if (next.t - valid[end].t > maxGapMs) break;
      const nextMinH = Math.min(minH, next.h), nextMaxH = Math.max(maxH, next.h);
      const nextMinV = Math.min(minV, next.v), nextMaxV = Math.max(maxV, next.v);
      if ((nextMaxH - nextMinH) + (nextMaxV - nextMinV) > options.dispersionThreshold) break;
      minH = nextMinH; maxH = nextMaxH; minV = nextMinV; maxV = nextMaxV;
      end++;
    }

    if (valid[end].t - valid[start].t >= minDurationMs) {
      fixations.push(toFixation(valid.slice(start, end + 1)));
      start = end + 1;
    } else {
      // The eye did not rest long enough here: slide forward one sample and retry.
      start++;
    }
  }

  return fixations;
}

// --- Candidate merging (Hooge et al. 2022) ---
//
// A single bad frame splits one physiological fixation into two candidates. The
// split does double damage: it shortens meanFixationMs AND, when the fragments'
// centroids sit ≥ the saccade floor apart, it fabricates a saccade/regression that
// never happened. Hooge et al. (2022) showed explicit merge+selection lifts
// agreement between seven detectors from F1 0.47 to 0.93 — more decisive than the
// choice of algorithm itself.
//
// Distance uses the same summed h+v metric as dispersion(), for internal coherence.
// Merging cascades: a merged fixation may absorb the next candidate too.

export interface MergeFixationsOptions {
  maxMergeGapMs: number;      // 100ms: one dropped frame at 30fps is ~66ms; 40ms (I2MC) is inert here
  maxMergeDistance: number;   // same units and value as the detection dispersion threshold
}

export interface MergedFixations { fixations: Fixation[]; mergeCount: number; }

export function mergeFixations(
  fixations: Fixation[],
  options: MergeFixationsOptions,
): MergedFixations {
  if (fixations.length < 2) return { fixations: fixations.slice(), mergeCount: 0 };
  const out: Fixation[] = [{ ...fixations[0] }];
  let mergeCount = 0;
  for (let i = 1; i < fixations.length; i++) {
    const prev = out[out.length - 1];
    const next = fixations[i];
    const gap = next.tStart - prev.tEnd;
    const distance = Math.abs(next.centroidH - prev.centroidH)
      + Math.abs(next.centroidV - prev.centroidV);
    if (gap <= options.maxMergeGapMs && distance < options.maxMergeDistance) {
      const total = prev.sampleCount + next.sampleCount;
      prev.centroidH = (prev.centroidH * prev.sampleCount + next.centroidH * next.sampleCount) / total;
      prev.centroidV = (prev.centroidV * prev.sampleCount + next.centroidV * next.sampleCount) / total;
      prev.tEnd = next.tEnd;
      prev.durationMs = prev.tEnd - prev.tStart;
      prev.sampleCount = total;
      mergeCount++;
    } else {
      out.push({ ...next });
    }
  }
  return { fixations: out, mergeCount };
}

// Full Hooge pipeline: detect short candidates (40ms), merge them, then filter
// on final selection threshold (100ms by default). WHY: applying the 100ms cut
// during initial detection discards fragments before the merge step has a chance
// to recover them.
export function detectMergedFixations(
  samples: GazeSample[],
  options: DetectMergedFixationsOptions,
): MergedFixations {
  const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_FIXATION_MS;
  const candidates = detectFixations(samples, {
    dispersionThreshold: options.dispersionThreshold,
    minDurationMs: CANDIDATE_MIN_FIXATION_MS,
    maxGapMs: options.maxGapMs ?? DEFAULT_MAX_GAP_MS,
  });
  const merged = mergeFixations(candidates, {
    maxMergeGapMs: options.maxMergeGapMs ?? DEFAULT_MERGE_GAP_MS,
    maxMergeDistance: options.dispersionThreshold,
  });
  return {
    fixations: merged.fixations.filter(f => f.durationMs >= minDurationMs),
    mergeCount: merged.mergeCount,
  };
}

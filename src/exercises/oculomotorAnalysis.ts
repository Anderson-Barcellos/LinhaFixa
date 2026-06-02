import { FixationMetrics, SaccadeTaskMetrics, PursuitMetrics } from '@/types';

// Analysis of calibrated, screen-space gaze captured during the oculomotor exercises.
// All inputs are in canvas pixels; angular outputs use a caller-provided pxPerDeg
// (pixels subtended by 1 degree at the user's viewing distance).
//
// Honest limits: webcam gaze is ~30Hz and ~1-2 deg accurate. These measure coarse
// FIXATION stability, estimate SACCADE latency/accuracy, and pursuit gain. They do
// not resolve microsaccades and should be read as approximate.

export interface OcSample {
  t: number;                              // ms relative to exercise start
  gaze: { x: number; y: number } | null;  // calibrated gaze point, null when unavailable
  target: { x: number; y: number };       // target position at that frame
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map(v => (v - m) ** 2)));
}

// --- Fixation: how steadily gaze stays on a fixed central target. ---

const FIXATION_THRESHOLD_DEG = 2; // within this angular distance counts as "on target"

export function analyzeFixation(
  samples: OcSample[],
  center: { x: number; y: number },
  pxPerDeg: number
): FixationMetrics {
  const valid = samples.filter(s => s.gaze !== null) as Required<OcSample>[];
  if (valid.length < 5 || pxPerDeg <= 0) {
    return {
      trackingAvailable: false,
      samplesValid: valid.length,
      meanDispersionDeg: 0,
      rmsDispersionDeg: 0,
      percentWithinThreshold: 0,
      fixationBreaks: 0,
    };
  }

  const degs = valid.map(s => dist(s.gaze, center) / pxPerDeg);
  const within = degs.map(d => d <= FIXATION_THRESHOLD_DEG);

  let breaks = 0;
  for (let i = 1; i < within.length; i++) {
    if (within[i - 1] && !within[i]) breaks++;
  }

  return {
    trackingAvailable: true,
    samplesValid: valid.length,
    meanDispersionDeg: mean(degs),
    rmsDispersionDeg: Math.sqrt(mean(degs.map(d => d * d))),
    percentWithinThreshold: (within.filter(Boolean).length / within.length) * 100,
    fixationBreaks: breaks,
  };
}

// --- Saccades: latency to move toward a jumped target, and landing accuracy. ---

// Movement onset = gaze has covered this fraction of the jump amplitude toward the
// new target. Latencies outside this plausible window are discarded as noise.
const ONSET_FRACTION = 0.2;
const MIN_LATENCY_MS = 60;
const MAX_LATENCY_MS = 1000;

export function analyzeSaccadeTask(samples: OcSample[], pxPerDeg: number): SaccadeTaskMetrics {
  const validCount = samples.filter(s => s.gaze !== null).length;
  const empty: SaccadeTaskMetrics = {
    trackingAvailable: false,
    samplesValid: validCount,
    validSaccades: 0,
    meanLatencyMs: 0,
    meanAccuracyDeg: 0,
    meanGain: 0,
  };
  if (validCount < 5 || pxPerDeg <= 0 || samples.length < 2) return empty;

  // Detect target jumps (frames where the target position changed).
  const jumps: { tJump: number; from: { x: number; y: number }; to: { x: number; y: number }; start: number; end: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    if (dist(samples[i].target, samples[i - 1].target) > 1) {
      jumps.push({ tJump: samples[i].t, from: samples[i - 1].target, to: samples[i].target, start: i, end: samples.length });
    }
  }
  for (let j = 0; j < jumps.length - 1; j++) jumps[j].end = jumps[j + 1].start;

  const latencies: number[] = [];
  const accuracies: number[] = [];
  const gains: number[] = [];

  for (const jump of jumps) {
    const window = samples.slice(jump.start, jump.end);
    const validInWindow = window.filter(s => s.gaze !== null) as Required<OcSample>[];
    if (validInWindow.length < 3) continue;

    const amp = dist(jump.to, jump.from);
    if (amp < 1) continue;
    // Unit vector of the jump, to project gaze movement onto.
    const ux = (jump.to.x - jump.from.x) / amp;
    const uy = (jump.to.y - jump.from.y) / amp;

    const gazeAtJump = validInWindow[0].gaze;

    // Latency: first sample whose projected displacement passes the onset fraction.
    let latency = NaN;
    for (const s of validInWindow) {
      const proj = (s.gaze.x - gazeAtJump.x) * ux + (s.gaze.y - gazeAtJump.y) * uy;
      if (proj >= ONSET_FRACTION * amp) {
        latency = s.t - jump.tJump;
        break;
      }
    }

    // Landing: average gaze over the last 40% of the window (settled position).
    const settleStart = jump.tJump + (window[window.length - 1].t - jump.tJump) * 0.6;
    const settle = validInWindow.filter(s => s.t >= settleStart);
    const landingPts = settle.length ? settle : validInWindow.slice(-3);
    const landing = {
      x: mean(landingPts.map(s => s.gaze.x)),
      y: mean(landingPts.map(s => s.gaze.y)),
    };

    const proj = (landing.x - gazeAtJump.x) * ux + (landing.y - gazeAtJump.y) * uy;
    accuracies.push(dist(landing, jump.to) / pxPerDeg);
    gains.push(proj / amp);
    if (Number.isFinite(latency) && latency >= MIN_LATENCY_MS && latency <= MAX_LATENCY_MS) {
      latencies.push(latency);
    }
  }

  if (accuracies.length === 0) return empty;

  return {
    trackingAvailable: true,
    samplesValid: validCount,
    validSaccades: accuracies.length,
    meanLatencyMs: mean(latencies),
    meanAccuracyDeg: mean(accuracies),
    meanGain: mean(gains),
  };
}

// --- Smooth pursuit: how well gaze tracks a continuously moving target. ---

const PURSUIT_ON_TARGET_DEG = 3;

export function analyzePursuit(samples: OcSample[], pxPerDeg: number): PursuitMetrics {
  const valid = samples.filter(s => s.gaze !== null) as Required<OcSample>[];
  if (valid.length < 10 || pxPerDeg <= 0) {
    return {
      trackingAvailable: false,
      samplesValid: valid.length,
      gain: 0,
      rmsErrorDeg: 0,
      percentOnTarget: 0,
    };
  }

  // Gain as the ratio of horizontal spreads (target moves horizontally). This is
  // robust to webcam noise compared with raw velocity ratios.
  const gazeStd = std(valid.map(s => s.gaze.x));
  const targetStd = std(valid.map(s => s.target.x));
  const gain = targetStd > 1e-6 ? gazeStd / targetStd : 0;

  const errorsDeg = valid.map(s => dist(s.gaze, s.target) / pxPerDeg);

  return {
    trackingAvailable: true,
    samplesValid: valid.length,
    gain,
    rmsErrorDeg: Math.sqrt(mean(errorsDeg.map(e => e * e))),
    percentOnTarget: (errorsDeg.filter(e => e <= PURSUIT_ON_TARGET_DEG).length / errorsDeg.length) * 100,
  };
}

import { GazeSample, SaccadeMetrics, SaccadeEvent } from '@/types';

export type { SaccadeEvent };

// Simplified velocity-threshold (I-VT) saccade detector over webcam gaze samples.
//
// Honest limitations: webcam gaze is noisy and device/browser frame-rate dependent.
// This estimates coarse SACCADES and FIXATIONS during reading; it CANNOT detect
// microsaccades. Amplitudes are in normalized gaze-ratio units, not degrees, and
// should be read as relative/approximate.

// Horizontal gaze-ratio change per millisecond above which motion counts as a saccade.
// Time-normalized so the threshold remains interpretable across negotiated FPS.
const VELOCITY_THRESHOLD = 0.0025; // ratio units / ms
// Ignore tiny saccades that are likely tracking noise.
const MIN_SACCADE_AMPLITUDE = 0.04; // ratio units
// Leftward saccades large enough are line-return sweeps (the eye jumping back to
// start the next line), not re-reading regressions. Counting them as regressions
// would inflate the clinical regression ratio by ~1 per line read.
//
// The threshold is ADAPTIVE: a sweep spans roughly the whole line while reading
// saccades and true regressions span a word or two, but the absolute scale of both
// depends on the signal (calibrated canvas ratios vs raw iris ratios, calibration
// gain, viewing distance). A fixed cut in ratio units misclassifies sweeps whenever
// the signal is compressed — raw iris ratios squeeze a full line into ~0.2. So the
// cut is derived per capture from the median progressive (rightward) amplitude,
// bounded by an absolute floor (noise guard) and by the historical 0.35 cap (a
// leftward jump that big is always a sweep). With no progressive saccades to anchor
// on, the cap alone applies. visualSignal.ts keeps its own fixed LINE_RETURN_DH for
// the live candidate hint; this clinical classification is the source of truth.
const LINE_RETURN_RELATIVE_FACTOR = 3;      // × median progressive amplitude
const LINE_RETURN_THRESHOLD_FLOOR = 0.08;   // ratio units (2× MIN_SACCADE_AMPLITUDE)
const LINE_RETURN_THRESHOLD_CAP = 0.35;     // ratio units (previous fixed threshold)
// A gap between consecutive samples longer than this means tracking dropped out
// (face lost, tab hidden); any fixation interval containing such a gap is discarded
// instead of inflating the mean fixation duration.
const MAX_FIXATION_GAP_MS = 200;

export interface AnalyzeSaccadesOptions {
  signalSource?: SaccadeMetrics['signalSource'];
  // When true, the returned metrics carry the individual detected events with
  // timestamps. Off by default so persisted SaccadeMetrics payloads stay unchanged;
  // the ground-truth validation harness opts in to match detections against known
  // target jumps.
  collectEvents?: boolean;
}

// 3-sample median filter over the horizontal channel. MediaPipe occasionally emits
// single-frame landmark spikes that would otherwise register as a pair of fake
// saccades; a real saccade spans several samples at 30-60Hz, so the median passes it
// through while removing isolated outliers. Endpoints are left unchanged.
function medianFilter3(values: number[]): number[] {
  if (values.length < 3) return values.slice();
  const out = values.slice();
  for (let i = 1; i < values.length - 1; i++) {
    const a = values[i - 1], b = values[i], c = values[i + 1];
    out[i] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  }
  return out;
}

export function analyzeSaccades(samples: GazeSample[], options: AnalyzeSaccadesOptions = {}): SaccadeMetrics {
  const valid = samples.filter(s => Number.isFinite(s.h) && Number.isFinite(s.t));

  if (valid.length < 5) {
    return {
      trackingAvailable: false,
      samplesValid: valid.length,
      signalSource: options.signalSource ?? 'unavailable',
      sampleRateHz: sampleRateHz(valid),
      saccadeCount: 0,
      regressionCount: 0,
      lineReturnCount: 0,
      meanSaccadeAmplitude: null,
      meanFixationMs: null,
      ...(options.collectEvents ? { events: [] } : {}),
    };
  }

  valid.sort((a, b) => a.t - b.t);
  const h = medianFilter3(valid.map(s => s.h));

  let inSaccade = false;
  let saccadeStartH = 0;
  let saccadeStartT = valid[0].t;
  let lastSaccadeEndT = valid[0].t;
  // True when the interval since lastSaccadeEndT contains a tracking gap.
  let gapInFixation = false;

  const fixationDurations: number[] = [];
  // Detected saccade candidates, classified in a second pass once the whole
  // capture's progressive amplitudes are known (the line-return cut is relative).
  const candidates: { amplitude: number; tStart: number; tEnd: number }[] = [];

  const closeSaccade = (amplitude: number, tStart: number, tEnd: number) => {
    if (Math.abs(amplitude) < MIN_SACCADE_AMPLITUDE) return;
    candidates.push({ amplitude, tStart, tEnd });
  };

  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1];
    const cur = valid[i];
    const dt = cur.t - prev.t;
    if (dt <= 0) continue;
    if (dt > MAX_FIXATION_GAP_MS) gapInFixation = true;
    const velocity = Math.abs(h[i] - h[i - 1]) / dt;

    if (!inSaccade && velocity > VELOCITY_THRESHOLD) {
      // Saccade begins: close the preceding fixation, unless tracking dropped out
      // somewhere inside it.
      inSaccade = true;
      saccadeStartH = h[i - 1];
      saccadeStartT = prev.t;
      const fixation = prev.t - lastSaccadeEndT;
      if (!gapInFixation && fixation > 0) fixationDurations.push(fixation);
    } else if (inSaccade && velocity <= VELOCITY_THRESHOLD) {
      // Saccade ends.
      inSaccade = false;
      closeSaccade(h[i] - saccadeStartH, saccadeStartT, cur.t);
      lastSaccadeEndT = cur.t;
      gapInFixation = false;
    }
  }

  // If we ended while still in a saccade, close it using the last sample.
  if (inSaccade) {
    closeSaccade(h[h.length - 1] - saccadeStartH, saccadeStartT, valid[valid.length - 1].t);
  }

  // Second pass: derive the line-return cut from this capture's own progressive
  // amplitudes, then route each candidate to its bucket. Line-return sweeps stay
  // OUT of the reading-saccade amplitudes and regression count.
  const progressive = candidates.filter(c => c.amplitude > 0).map(c => c.amplitude);
  const lineReturnThreshold = progressive.length
    ? Math.min(
        LINE_RETURN_THRESHOLD_CAP,
        Math.max(LINE_RETURN_THRESHOLD_FLOOR, LINE_RETURN_RELATIVE_FACTOR * median(progressive))
      )
    : LINE_RETURN_THRESHOLD_CAP;

  const amplitudes: number[] = [];
  let regressionCount = 0;
  let lineReturnCount = 0;
  const events: SaccadeEvent[] | undefined = options.collectEvents ? [] : undefined;
  for (const { amplitude, tStart, tEnd } of candidates) {
    if (amplitude < 0 && Math.abs(amplitude) >= lineReturnThreshold) {
      lineReturnCount++;
      events?.push({ tStart, tEnd, amplitude, kind: 'line-return' });
      continue;
    }
    amplitudes.push(Math.abs(amplitude));
    // Reading is left-to-right (increasing h): a leftward saccade is a regression.
    if (amplitude < 0) regressionCount++;
    events?.push({ tStart, tEnd, amplitude, kind: amplitude < 0 ? 'regression' : 'saccade' });
  }

  const meanOrNull = (values: number[]): number | null =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  return {
    trackingAvailable: true,
    samplesValid: valid.length,
    signalSource: options.signalSource,
    sampleRateHz: sampleRateHz(valid),
    saccadeCount: amplitudes.length,
    regressionCount,
    lineReturnCount,
    meanSaccadeAmplitude: meanOrNull(amplitudes),
    meanFixationMs: meanOrNull(fixationDurations),
    ...(events ? { events } : {}),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sampleRateHz(samples: GazeSample[]): number {
  if (samples.length < 2) return 0;
  const durationMs = samples[samples.length - 1].t - samples[0].t;
  if (durationMs <= 0) return 0;
  return ((samples.length - 1) / durationMs) * 1000;
}

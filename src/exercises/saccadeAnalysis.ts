import { GazeSample, SaccadeMetrics, SaccadeEvent } from '@/types';
import { detectFixations, dispersion } from './fixationDetection';
import { saccadesFromFixations, dispersionThresholdFor } from './saccadesFromFixations';

export type { SaccadeEvent };

// Fixation-first reading analyser over webcam gaze samples.
//
// This used to be a velocity-threshold (I-VT) detector. It was replaced because
// I-VT asks the signal a question it cannot answer: a saccade lasts 30-80ms, so at
// 24-60Hz it spans 1-5 samples and its internal velocity is below Nyquist. Worse,
// a fixed velocity cut makes the smallest detectable amplitude proportional to dt
// (0.083 ratio units at 30fps vs 0.042 at 60fps), so the same eye produced
// different saccade counts on different cameras and a personal baseline stopped
// being comparable with itself.
//
// Fixations last 200-300ms — 6 to 18 samples in the same range — so they ARE
// resolvable. We detect those and derive each saccade from the transition between
// consecutive fixations. Every parameter below is a duration or a spatial extent;
// none is per-frame, so the analysis is invariant to the negotiated frame rate.
//
// Honest limitations, unchanged: this estimates coarse reading saccades and
// fixations; it CANNOT detect microsaccades or a saccade's peak velocity.
// Amplitudes are in normalized gaze-ratio units, not degrees, and should be read
// as relative/approximate.

// Version of the analysis this module produces, stamped onto every SaccadeMetrics.
// 1 (implicit, absent on old records) = velocity-threshold detector, frame-rate
// dependent. 2 = fixation-first. Values from different versions are NOT
// comparable; captureReprocess.ts lifts old records onto the current version by
// re-running this analyser over their persisted raw signal.
export const GAZE_ANALYZER_VERSION = 2;

// Ignore tiny displacements between neighbouring fixations: centroid wobble, not
// a jump of the eye.
const MIN_SACCADE_AMPLITUDE = 0.04; // ratio units
// Shortest rest accepted as a fixation. Reading fixations run 200-300ms; below
// 100ms it is more likely the eye passing through than stopping.
const MIN_FIXATION_MS = 100;
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
      analyzerVersion: GAZE_ANALYZER_VERSION,
      saccadeCount: 0,
      regressionCount: 0,
      lineReturnCount: 0,
      meanSaccadeAmplitude: null,
      meanFixationMs: null,
      ...(options.collectEvents ? { events: [] } : {}),
    };
  }

  valid.sort((a, b) => a.t - b.t);
  // The median filter still earns its place: it removes isolated landmark spikes
  // that would otherwise inflate a fixation window's dispersion and split one
  // fixation into two.
  const h = medianFilter3(valid.map(s => s.h));
  const filtered: GazeSample[] = valid.map((s, i) => ({ ...s, h: h[i] }));

  // Detect what the webcam can actually resolve — the eye standing still — and
  // read the saccades off the transitions between those rests. See
  // fixationDetection.ts for why velocity thresholding cannot work at 24-60Hz.
  const fixations = detectFixations(filtered, {
    dispersionThreshold: dispersionThresholdFor(dispersion(filtered)),
    minDurationMs: MIN_FIXATION_MS,
    maxGapMs: MAX_FIXATION_GAP_MS,
  });
  const fixationDurations = fixations.map(f => f.durationMs);

  // Saccade candidates, classified in a second pass once the whole capture's
  // progressive amplitudes are known (the line-return cut is relative).
  const candidates: { amplitude: number; tStart: number; tEnd: number }[] =
    saccadesFromFixations(fixations, { minAmplitude: MIN_SACCADE_AMPLITUDE });

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
    analyzerVersion: GAZE_ANALYZER_VERSION,
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

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
// Leftward saccades at least this large are line-return sweeps (the eye jumping back
// to start the next line), not re-reading regressions. Counting them as regressions
// would inflate the clinical regression ratio by ~1 per line read. Aligned with
// LINE_RETURN_DH in visualSignal.ts; recalibrate with real PACK 2 capture data.
const LINE_RETURN_MIN_AMPLITUDE = 0.35; // ratio units
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
      meanSaccadeAmplitude: 0,
      meanFixationMs: 0,
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

  const amplitudes: number[] = [];
  const fixationDurations: number[] = [];
  let regressionCount = 0;
  let lineReturnCount = 0;
  const events: SaccadeEvent[] | undefined = options.collectEvents ? [] : undefined;

  // Close a saccade with the given signed amplitude, routing it to the right bucket.
  // Line-return sweeps are counted separately and kept OUT of the reading-saccade
  // amplitudes and regression count.
  const closeSaccade = (amplitude: number, tStart: number, tEnd: number) => {
    if (Math.abs(amplitude) < MIN_SACCADE_AMPLITUDE) return;
    if (amplitude < 0 && Math.abs(amplitude) >= LINE_RETURN_MIN_AMPLITUDE) {
      lineReturnCount++;
      events?.push({ tStart, tEnd, amplitude, kind: 'line-return' });
      return;
    }
    amplitudes.push(Math.abs(amplitude));
    // Reading is left-to-right (increasing h): a leftward saccade is a regression.
    if (amplitude < 0) regressionCount++;
    events?.push({ tStart, tEnd, amplitude, kind: amplitude < 0 ? 'regression' : 'saccade' });
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

  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  return {
    trackingAvailable: true,
    samplesValid: valid.length,
    signalSource: options.signalSource,
    sampleRateHz: sampleRateHz(valid),
    saccadeCount: amplitudes.length,
    regressionCount,
    lineReturnCount,
    meanSaccadeAmplitude: mean(amplitudes),
    meanFixationMs: mean(fixationDurations),
    ...(events ? { events } : {}),
  };
}

function sampleRateHz(samples: GazeSample[]): number {
  if (samples.length < 2) return 0;
  const durationMs = samples[samples.length - 1].t - samples[0].t;
  if (durationMs <= 0) return 0;
  return Math.round(((samples.length - 1) / durationMs) * 1000);
}

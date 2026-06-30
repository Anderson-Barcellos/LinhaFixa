import { GazeSample, SaccadeMetrics } from '@/types';

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

export interface AnalyzeSaccadesOptions {
  signalSource?: SaccadeMetrics['signalSource'];
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
      meanSaccadeAmplitude: 0,
      meanFixationMs: 0,
    };
  }

  valid.sort((a, b) => a.t - b.t);

  let inSaccade = false;
  let saccadeStartH = 0;
  let lastSaccadeEndT = valid[0].t;

  const amplitudes: number[] = [];
  const fixationDurations: number[] = [];
  let regressionCount = 0;

  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1];
    const cur = valid[i];
    const dt = cur.t - prev.t;
    if (dt <= 0) continue;
    const velocity = Math.abs(cur.h - prev.h) / dt;

    if (!inSaccade && velocity > VELOCITY_THRESHOLD) {
      // Saccade begins: close the preceding fixation.
      inSaccade = true;
      saccadeStartH = prev.h;
      fixationDurations.push(prev.t - lastSaccadeEndT);
    } else if (inSaccade && velocity <= VELOCITY_THRESHOLD) {
      // Saccade ends.
      inSaccade = false;
      const amplitude = cur.h - saccadeStartH;
      if (Math.abs(amplitude) >= MIN_SACCADE_AMPLITUDE) {
        amplitudes.push(Math.abs(amplitude));
        // Reading is left-to-right (increasing h): a leftward saccade is a regression.
        if (amplitude < 0) regressionCount++;
      }
      lastSaccadeEndT = cur.t;
    }
  }

  // If we ended while still in a saccade, close it using the last sample.
  if (inSaccade) {
    const last = valid[valid.length - 1];
    const amplitude = last.h - saccadeStartH;
    if (Math.abs(amplitude) >= MIN_SACCADE_AMPLITUDE) {
      amplitudes.push(Math.abs(amplitude));
      if (amplitude < 0) regressionCount++;
    }
  }

  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  return {
    trackingAvailable: true,
    samplesValid: valid.length,
    signalSource: options.signalSource,
    sampleRateHz: sampleRateHz(valid),
    saccadeCount: amplitudes.length,
    regressionCount,
    meanSaccadeAmplitude: mean(amplitudes),
    meanFixationMs: mean(fixationDurations.filter(d => d > 0)),
  };
}

function sampleRateHz(samples: GazeSample[]): number {
  if (samples.length < 2) return 0;
  const durationMs = samples[samples.length - 1].t - samples[0].t;
  if (durationMs <= 0) return 0;
  return Math.round(((samples.length - 1) / durationMs) * 1000);
}

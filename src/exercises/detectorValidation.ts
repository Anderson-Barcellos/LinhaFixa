import { GazeSample, SaccadeEvent } from '@/types';
import { analyzeSaccades } from './saccadeAnalysis';
import { OcSample } from './oculomotorAnalysis';

// Internal ground-truth validation of the I-VT saccade detector ("statistical
// chinrest"). The saccade exercise is a controlled experiment: the target jumps at
// known times with known amplitude, so each jump is a ground-truth event the eye is
// expected to respond to. Running analyzeSaccades over the SAME gaze signal and
// matching detected events against target jumps yields the instrument's error bar —
// detection rate, false positives, latency — without any external hardware.
//
// Honest limits: this validates the detector against the user's actual oculomotor
// response, not against a lab eye tracker. A missed detection can be a detector
// failure OR the user genuinely not making the saccade; over a session the aggregate
// still bounds instrument sensitivity under the current conditions.

// Matching window relative to each target jump. The lower bound absorbs the detector
// timestamp convention (tStart is the last sample BEFORE the velocity crossing, so a
// prompt response can land one sample early). The upper bound matches the plausible
// human latency ceiling used by oculomotorAnalysis (MAX_LATENCY_MS).
const MATCH_MIN_LATENCY_MS = -50;
const MATCH_MAX_LATENCY_MS = 1000;

export interface DetectorValidationMetrics {
  trackingAvailable: boolean;   // false when gaze samples or target jumps are insufficient
  targetJumps: number;          // ground-truth events (target position changes)
  detectedTotal: number;        // all detector events over the run, any kind
  matchedJumps: number;         // jumps paired with a same-direction detector event in window
  detectionRate: number;        // matchedJumps / targetJumps, 0..1
  falsePositives: number;       // detector events left unmatched by any jump
  falsePositivesPerMin: number;
  medianLatencyMs: number | null;   // event tStart - jump time, or null without a matched pair
  latencyIqrMs: number | null;      // p75 - p25, or null without a matched pair
  meanAmplitudeGain: number | null; // mean |detected Δh| / |expected Δh|, or null without a matched pair
  durationMs: number;           // span of the analyzed gaze signal
  samplesValid: number;         // gaze samples available to the detector
}

interface TargetJump {
  t: number;      // ms of the first frame at the new position
  dhNorm: number; // signed expected horizontal displacement in gaze-ratio units
}

// Project canvas-space exercise samples into the normalized gaze-ratio space the
// I-VT detector operates on. Samples without gaze are dropped (the detector's gap
// handling covers the holes).
export function ocSamplesToGazeSamples(
  samples: OcSample[],
  canvasWidth: number,
  canvasHeight: number
): GazeSample[] {
  if (canvasWidth <= 0 || canvasHeight <= 0) return [];
  const out: GazeSample[] = [];
  for (const s of samples) {
    if (!s.gaze) continue;
    out.push({ t: s.t, h: s.gaze.x / canvasWidth, v: s.gaze.y / canvasHeight });
  }
  return out;
}

// Ground-truth events: frames where the target position changed. Same >1px criterion
// as analyzeSaccadeTask so both analyses see identical jumps.
export function extractTargetJumps(samples: OcSample[], canvasWidth: number): TargetJump[] {
  if (canvasWidth <= 0) return [];
  const jumps: TargetJump[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].target.x - samples[i - 1].target.x;
    const dy = samples[i].target.y - samples[i - 1].target.y;
    if (Math.hypot(dx, dy) > 1) {
      jumps.push({ t: samples[i].t, dhNorm: dx / canvasWidth });
    }
  }
  return jumps;
}

function percentileOrNull(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const emptyMetrics = (
  targetJumps: number,
  samplesValid: number,
  durationMs: number
): DetectorValidationMetrics => ({
  trackingAvailable: false,
  targetJumps,
  detectedTotal: 0,
  matchedJumps: 0,
  detectionRate: 0,
  falsePositives: 0,
  falsePositivesPerMin: 0,
  medianLatencyMs: null,
  latencyIqrMs: null,
  meanAmplitudeGain: null,
  durationMs,
  samplesValid,
});

export function validateSaccadeDetector(
  samples: OcSample[],
  canvasWidth: number,
  canvasHeight: number
): DetectorValidationMetrics {
  const gazeSamples = ocSamplesToGazeSamples(samples, canvasWidth, canvasHeight);
  const jumps = extractTargetJumps(samples, canvasWidth);
  const durationMs = gazeSamples.length >= 2
    ? gazeSamples[gazeSamples.length - 1].t - gazeSamples[0].t
    : 0;

  if (gazeSamples.length < 5 || jumps.length === 0) {
    return emptyMetrics(jumps.length, gazeSamples.length, durationMs);
  }

  const detection = analyzeSaccades(gazeSamples, { collectEvents: true });
  const events: SaccadeEvent[] = detection.events ?? [];

  // Greedy chronological matching: each jump takes the earliest unused detector event
  // inside its window whose direction agrees with the jump. Detector kind is ignored
  // on purpose — a large leftward target jump is a "line-return" in the reading
  // taxonomy but is still a correctly detected saccade here.
  const used = new Array(events.length).fill(false);
  const latencies: number[] = [];
  const gains: number[] = [];
  let matchedJumps = 0;

  for (const jump of jumps) {
    if (Math.abs(jump.dhNorm) < 1e-6) continue; // vertical-only jump: no horizontal truth
    for (let e = 0; e < events.length; e++) {
      if (used[e]) continue;
      const latency = events[e].tStart - jump.t;
      if (latency < MATCH_MIN_LATENCY_MS) continue;
      if (latency > MATCH_MAX_LATENCY_MS) break; // events are chronological
      if (Math.sign(events[e].amplitude) !== Math.sign(jump.dhNorm)) continue;
      used[e] = true;
      matchedJumps++;
      latencies.push(latency);
      gains.push(Math.abs(events[e].amplitude) / Math.abs(jump.dhNorm));
      break;
    }
  }

  const falsePositives = used.filter(u => !u).length;
  const sortedLatencies = latencies.slice().sort((a, b) => a - b);
  const medianLatencyMs = percentileOrNull(sortedLatencies, 0.5);
  const latencyP25Ms = percentileOrNull(sortedLatencies, 0.25);
  const latencyP75Ms = percentileOrNull(sortedLatencies, 0.75);
  const meanOrNull = (values: number[]): number | null =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  return {
    trackingAvailable: true,
    targetJumps: jumps.length,
    detectedTotal: events.length,
    matchedJumps,
    detectionRate: jumps.length ? matchedJumps / jumps.length : 0,
    falsePositives,
    falsePositivesPerMin: durationMs > 0 ? (falsePositives / durationMs) * 60000 : 0,
    medianLatencyMs,
    latencyIqrMs: latencyP25Ms !== null && latencyP75Ms !== null
      ? latencyP75Ms - latencyP25Ms
      : null,
    meanAmplitudeGain: meanOrNull(gains),
    durationMs,
    samplesValid: gazeSamples.length,
  };
}

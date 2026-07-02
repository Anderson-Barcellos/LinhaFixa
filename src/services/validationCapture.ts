import { AxisSignalSummary, GazeSample, SaccadeMetrics, ValidationCapture } from '@/types';

export interface CaptureSeriesSelection {
  samples: GazeSample[];
  signalSource: NonNullable<SaccadeMetrics['signalSource']>;
  calibratedSampleCount: number;
  rawSampleCount: number;
}

// Calibrated predictions (canvas-projected positions) and raw iris ratios live in
// different units with different gains, so they must never share one analysis series:
// a mid-capture source flip would create a unit jump the I-VT detector reads as a fake
// saccade. The analysis series is the majority buffer — it reflects what the capture
// mostly was — and the minority buffer is discarded from analysis but kept as counts
// for honest provenance. Ties favor the calibrated buffer.
export function selectCaptureSeries(
  calibrated: GazeSample[],
  raw: GazeSample[],
): CaptureSeriesSelection {
  const counts = { calibratedSampleCount: calibrated.length, rawSampleCount: raw.length };
  if (calibrated.length === 0 && raw.length === 0) {
    return { samples: [], signalSource: 'unavailable', ...counts };
  }
  if (calibrated.length >= raw.length) {
    return { samples: calibrated, signalSource: 'calibrated-mediapipe', ...counts };
  }
  return { samples: raw, signalSource: 'raw-mediapipe', ...counts };
}

// Per-axis dispersion of a captured gaze signal. Horizontal is the reading axis;
// comparing hStd/hRange against vStd/vRange across conditions shows when the vertical
// signal carries real structure vs. noise. Pure and deterministic so it can be tested
// without a browser.
export function summarizeAxisSignal(samples: GazeSample[]): AxisSignalSummary {
  if (samples.length === 0) {
    return { hStd: 0, hRange: 0, vStd: 0, vRange: 0 };
  }
  const h = samples.map(s => s.h);
  const v = samples.map(s => s.v);
  return {
    hStd: round4(std(h)),
    hRange: round4(range(h)),
    vStd: round4(std(v)),
    vRange: round4(range(v)),
  };
}

export interface ValidationExport {
  app: 'linhafixa';
  kind: 'validation-captures';
  version: number;
  exportedAt: number;
  count: number;
  captures: ValidationCapture[];
}

// Serialize captures into a self-describing JSON payload for offline analysis.
// exportedAt is injected by the caller so this stays pure (no Date.now() here).
export function serializeValidationExport(captures: ValidationCapture[], exportedAt: number): string {
  const payload: ValidationExport = {
    app: 'linhafixa',
    kind: 'validation-captures',
    version: 1,
    exportedAt,
    count: captures.length,
    captures,
  };
  return JSON.stringify(payload, null, 2);
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function std(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function range(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

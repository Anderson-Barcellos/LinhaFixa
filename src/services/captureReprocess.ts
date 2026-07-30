import { analyzeSaccades, GAZE_ANALYZER_VERSION } from '@/exercises/saccadeAnalysis';
import type { ValidationCapture } from '@/types';

export { GAZE_ANALYZER_VERSION };

// Lifts captures recorded by an older analyser onto the current one.
//
// WHY THIS EXISTS: the reading analyser was a velocity-threshold detector whose
// smallest detectable saccade scaled with the sampling interval (0.083 ratio
// units at 30fps, 0.042 at 60fps). When the camera started negotiating 60fps, the
// instrument silently doubled in sensitivity, so saccade counts and fixation
// durations recorded before and after that change do not describe the same
// measurement. For a personal baseline that is the whole value of the series.
//
// Because every capture persists its raw GazeSample[] signal, the fix is not to
// discard history but to re-measure it: the same analyser, applied to every
// record, yields one series comparable end to end.
//
// The original metrics are preserved in `legacyMetrics` rather than overwritten,
// so nothing that was ever measured is destroyed and the reprocessing can be
// audited (or reverted) later.

export function needsReprocessing(capture: ValidationCapture): boolean {
  if (!Array.isArray(capture.samples) || capture.samples.length === 0) return false;
  return capture.metrics?.analyzerVersion !== GAZE_ANALYZER_VERSION;
}

export function reprocessCapture(capture: ValidationCapture): ValidationCapture {
  if (!needsReprocessing(capture)) return capture;

  // Feed the persisted capture-time geometry back in so a v3 reprocess of an old
  // capture gets the same angular threshold the live capture would have used —
  // otherwise every reprocessed history entry would silently fall back to the
  // relative threshold even when the geometry to do better was recorded.
  const geometry = capture.pxPerDegAtCapture != null && capture.canvasWidthPx != null
    ? { pxPerDegAtCapture: capture.pxPerDegAtCapture, canvasWidthPx: capture.canvasWidthPx }
    : undefined;
  const metrics = analyzeSaccades(capture.samples, {
    signalSource: capture.metrics?.signalSource,
    geometry,
  });

  return {
    ...capture,
    metrics,
    // Written only on the first lift: a later version must still be able to see
    // the ORIGINAL measurement, not the previous reprocessing.
    legacyMetrics: capture.legacyMetrics ?? capture.metrics,
  };
}

export interface ReprocessSummary {
  total: number;
  reprocessed: number;
  skipped: number; // already current, or no raw signal to re-measure
}

export function reprocessCaptures(
  captures: ValidationCapture[],
): { captures: ValidationCapture[]; summary: ReprocessSummary } {
  let reprocessed = 0;
  const out = captures.map(capture => {
    if (!needsReprocessing(capture)) return capture;
    reprocessed++;
    return reprocessCapture(capture);
  });
  return {
    captures: out,
    summary: { total: captures.length, reprocessed, skipped: captures.length - reprocessed },
  };
}

// Stateful blink gate: the binary threshold catches the middle of a blink but lets
// the partially-occluded edge frames through (score rising/falling through 0.3–0.5).
// At 60fps there are twice as many edge frames per second, so the edges dominate the
// artifact budget. Hysteresis catches the falling edge, the temporal hold covers the
// re-opening wobble, and the leading purge retroactively removes the rising edge from
// sample buffers. All windows are in ms, not frames — fps-independent by design.
import { BLINK_REJECT_THRESHOLD, BLINK_REJECT_GATE_ENABLED, isBlinking } from './faceTracking';

export const BLINK_EXIT_THRESHOLD = 0.25;
export const BLINK_HOLD_MS = 100;
export const BLINK_LEADING_PURGE_MS = 80;

export interface BlinkGateOptions {
  enterThreshold?: number;
  exitThreshold?: number;
  holdMs?: number;
  enabled?: boolean;
}

export interface BlinkGateTracker {
  /** true = descartar a amostra de gaze deste frame. */
  update(score: number | null, tMs: number): boolean;
  reset(): void;
}

export function createBlinkGateTracker(opts: BlinkGateOptions = {}): BlinkGateTracker {
  const enter = opts.enterThreshold ?? BLINK_REJECT_THRESHOLD;
  const exit = opts.exitThreshold ?? BLINK_EXIT_THRESHOLD;
  const holdMs = opts.holdMs ?? BLINK_HOLD_MS;
  const enabled = opts.enabled ?? BLINK_REJECT_GATE_ENABLED;

  let state: 'open' | 'closed' | 'hold' = 'open';
  let holdUntil = 0;

  return {
    update(score, tMs) {
      if (!enabled) return false;
      if (state === 'open') {
        if (isBlinking(score, enter)) { state = 'closed'; return true; }
        return false;
      }
      if (state === 'closed') {
        // Fail-open só para ENTRAR: um null no meio da piscada vira hold, não reabertura.
        if (score == null || score <= exit) { state = 'hold'; holdUntil = tMs + holdMs; }
        return true;
      }
      // state === 'hold'
      if (isBlinking(score, enter)) { state = 'closed'; return true; }
      if (tMs < holdUntil) return true;
      state = 'open';
      return false;
    },
    reset() { state = 'open'; holdUntil = 0; },
  };
}

// Remove in place as amostras dos últimos windowMs — a borda de subida da piscada que
// entrou no buffer antes do score cruzar o enter threshold. Buffers são ordenados por t.
export function purgeLeadingBlinkSamples(
  samples: Array<{ t: number }>,
  nowMs: number,
  windowMs: number = BLINK_LEADING_PURGE_MS,
): void {
  while (samples.length && nowMs - samples[samples.length - 1].t <= windowMs) samples.pop();
}

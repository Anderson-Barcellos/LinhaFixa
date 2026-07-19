// EMA of per-frame inference duration. Pure so the smoothing is testable without
// MediaPipe; alpha 0.15 ≈ ~13-frame memory, stable enough to read live in the UI.
export interface InferenceMeter {
  record(ms: number): void;
  emaMs(): number | null;
  count(): number;
}

export function createInferenceMeter(alpha = 0.15): InferenceMeter {
  let ema: number | null = null;
  let samples = 0;
  return {
    record(ms: number) {
      if (!Number.isFinite(ms) || ms < 0) return;
      samples += 1;
      ema = ema === null ? ms : ema * (1 - alpha) + ms * alpha;
    },
    emaMs: () => ema,
    count: () => samples,
  };
}

// Frame-rate-independent EMA smoothing. The legacy per-frame alphas (0.02 and 0.15)
// were tuned at a 30fps camera; at 60fps they double the effective responsiveness.
// alpha = 1 − exp(−dt/τ) keeps the time constant τ true at any frame rate.

// τ that reproduces the legacy amber-rail alpha (0.02 at 33.3ms frames): ~1.5s rail.
export const RAW_V_EMA_TAU_MS = 1650;
// τ that reproduces the legacy distance alpha (0.15 at 33.3ms frames): ~0.2s.
export const DISTANCE_EMA_TAU_MS = 200;

export function emaAlpha(dtMs: number, tauMs: number): number {
  if (!(dtMs > 0) || !(tauMs > 0)) return 0;
  return 1 - Math.exp(-dtMs / tauMs);
}

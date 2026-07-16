// Stimulus-distance policy for the exercise player: measure the live viewing
// distance at exercise start, FREEZE it (constant stimulus ⇒ comparable metrics),
// then only OBSERVE drift — never resize the text mid-task. Drift compares the
// smoothed EMA (not raw frames): clinical drift is the patient migrating, not
// 200ms tracking jitter; the ~1s lag on the live warning is accepted by design.
import { DISTANCE_DRIFT_TOLERANCE } from './viewingGeometry';
import { clampViewingDistanceCm } from './viewingDistance';

export interface StimulusDistanceSnapshot {
  phase: 'stabilizing' | 'frozen';
  distanceCm: number;
  frozenDistanceCm: number | null;
  distanceSource: 'measured' | 'profile' | null;
  inDrift: boolean;
  maxDeviationPct: number;
  driftTimePct: number;
}

export interface StimulusDistanceOptions {
  profileDistanceCm: number;
  emaAlpha?: number;
  convergenceWindowMs?: number;
  convergenceSpanPct?: number;
  freezeTimeoutMs?: number;
  driftEnterPct?: number;
  driftExitPct?: number;
}

export function createStimulusDistanceTracker(opts: StimulusDistanceOptions) {
  const alpha = opts.emaAlpha ?? 0.15;
  const windowMs = opts.convergenceWindowMs ?? 1000;
  const spanPct = opts.convergenceSpanPct ?? 0.05;
  const timeoutMs = opts.freezeTimeoutMs ?? 3000;
  const enterPct = opts.driftEnterPct ?? DISTANCE_DRIFT_TOLERANCE;
  const exitPct = opts.driftExitPct ?? 0.12;
  const profileCm = clampViewingDistanceCm(opts.profileDistanceCm);

  let ema: number | null = null;
  let startT: number | null = null;
  let emaWindow: { t: number; v: number }[] = [];
  let frozen: number | null = null;
  let source: 'measured' | 'profile' | null = null;
  let frozenAtT = 0;
  let inDrift = false;
  let maxDeviationPct = 0;
  let driftMs = 0;
  let lastT: number | null = null;

  const freeze = (value: number, from: 'measured' | 'profile', t: number) => {
    frozen = clampViewingDistanceCm(value);
    source = from;
    frozenAtT = t;
    lastT = t;
    emaWindow = [];
  };

  const snapshot = (): StimulusDistanceSnapshot => ({
    phase: frozen != null ? 'frozen' : 'stabilizing',
    distanceCm: frozen ?? profileCm,
    frozenDistanceCm: frozen,
    distanceSource: source,
    inDrift,
    maxDeviationPct,
    driftTimePct: frozen != null && lastT != null && lastT > frozenAtT
      ? (driftMs / (lastT - frozenAtT)) * 100
      : 0,
  });

  const update = (sampleCm: number | null, tMs: number): StimulusDistanceSnapshot => {
    if (startT == null) startT = tMs;
    const validSample = sampleCm != null && Number.isFinite(sampleCm) && sampleCm > 0;
    if (validSample) ema = ema == null ? sampleCm! : ema * (1 - alpha) + sampleCm! * alpha;

    if (frozen == null) {
      if (ema != null) {
        emaWindow.push({ t: tMs, v: ema });
        while (emaWindow.length && tMs - emaWindow[0].t > windowMs) emaWindow.shift();
        const covered = emaWindow.length > 1 && tMs - emaWindow[0].t >= windowMs * 0.999;
        if (covered) {
          const vs = emaWindow.map(w => w.v);
          const min = Math.min(...vs);
          const max = Math.max(...vs);
          if (min > 0 && (max - min) / min <= spanPct) freeze(ema, 'measured', tMs);
        }
      }
      if (frozen == null && tMs - startT >= timeoutMs) {
        if (ema != null) freeze(ema, 'measured', tMs);
        else freeze(profileCm, 'profile', tMs);
      }
      if (frozen == null) return snapshot();
    }

    // Post-freeze: observe drift on the smoothed estimate.
    if (lastT != null && tMs > lastT && inDrift) driftMs += tMs - lastT;
    lastT = tMs;
    if (ema != null && frozen! > 0) {
      const dev = Math.abs(ema - frozen!) / frozen!;
      maxDeviationPct = Math.max(maxDeviationPct, dev * 100);
      if (!inDrift && dev > enterPct) inDrift = true;
      else if (inDrift && dev < exitPct) inDrift = false;
    }
    return snapshot();
  };

  return { update, snapshot };
}

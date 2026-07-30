// Stateful blink gate: the binary threshold catches the middle of a blink but lets
// the partially-occluded edge frames through (score rising/falling through 0.3–0.5).
// At 60fps there are twice as many edge frames per second, so the edges dominate the
// artifact budget. Hysteresis catches the falling edge, the temporal hold covers the
// re-opening wobble, and the leading purge retroactively removes the rising edge from
// sample buffers. All windows are in ms, not frames — fps-independent by design.
import { BLINK_REJECT_THRESHOLD, BLINK_REJECT_GATE_ENABLED, isBlinking } from './faceTracking';
import { getDerivedBlinkThresholds, getBlinkBaselineSnapshot, type BlinkBaselineSnapshot } from './blinkBaseline';

export const BLINK_EXIT_THRESHOLD = 0.25;
export const BLINK_HOLD_MS = 100;
export const BLINK_LEADING_PURGE_MS = 80;
// Duração máxima de uma piscada completa (fechamento + reabertura). A literatura
// põe a piscada espontânea em 100-400ms; 500ms cobre a cauda com folga.
export const MAX_BLINK_MS = 500;
// Estabilidade mínima de score abaixo do enter para aceitar que a pálpebra
// reabriu. Necessária porque um baseline de repouso entre exit e enter (0.29
// acontece) nunca cruza o exit — sem ela, toda piscada custaria maxBlinkMs
// inteiro. ~4 frames a 30fps; em ms, não frames, como todas as janelas daqui.
export const BLINK_RECOVERY_STABLE_MS = 120;

export interface BlinkGateOptions {
  enterThreshold?: number;
  exitThreshold?: number;
  holdMs?: number;
  maxBlinkMs?: number;
  recoveryStableMs?: number;
  enabled?: boolean;
}

// Limiares vigentes da sessão: derivados da calibração quando o commit
// aconteceu e passou nas faixas de sanidade; fixos caso contrário. Dono único
// da cadeia de fallback — o tracker e o diagnóstico leem daqui.
export interface ActiveBlinkThresholds {
  enter: number;
  exit: number;
  source: 'calibrated' | 'fixed';
}

export function activeBlinkThresholds(): ActiveBlinkThresholds {
  const derived = getDerivedBlinkThresholds();
  return derived
    ? { enter: derived.enter, exit: derived.exit, source: 'calibrated' }
    : { enter: BLINK_REJECT_THRESHOLD, exit: BLINK_EXIT_THRESHOLD, source: 'fixed' };
}

// Versão do esquema de derivação de limiares (1 = aditivo sobre a mediana do
// settle, spec P3 2026-07-28). Sem este carimbo por captura, a série mistura
// instrumentos (fixed vs calibrated, e futuros esquemas) sem registro.
export const BLINK_SCHEME_VERSION = 1;

export interface CaptureBlinkGateStamp {
  schemeVersion: number;
  source: 'calibrated' | 'fixed';
  baseMedian: number | null; // repouso medido que originou os limiares (null no fallback)
  enter: number;
  exit: number;
}

export function captureBlinkGateStamp(
  active: ActiveBlinkThresholds = activeBlinkThresholds(),
  snapshot: BlinkBaselineSnapshot | null = getBlinkBaselineSnapshot(),
): CaptureBlinkGateStamp {
  return {
    schemeVersion: BLINK_SCHEME_VERSION,
    source: active.source,
    baseMedian: snapshot?.baseline ?? null,
    enter: active.enter,
    exit: active.exit,
  };
}

export interface BlinkGateTracker {
  /** true = descartar a amostra de gaze deste frame. */
  update(score: number | null, tMs: number): boolean;
  /** true sse o último update transicionou de aceitando para rejeitando (borda de subida). */
  wasRisingEdge(): boolean;
  reset(): void;
}

export function createBlinkGateTracker(opts: BlinkGateOptions = {}): BlinkGateTracker {
  // Limiar explícito nas opções vence; sem ele, os vigentes da sessão —
  // resolvidos a cada update porque o commit acontece depois que os gates de
  // longa vida (pipeline) já existem.
  const resolveThresholds = () => {
    const active = activeBlinkThresholds();
    return {
      enter: opts.enterThreshold ?? active.enter,
      exit: opts.exitThreshold ?? active.exit,
    };
  };
  const holdMs = opts.holdMs ?? BLINK_HOLD_MS;
  const maxBlinkMs = opts.maxBlinkMs ?? MAX_BLINK_MS;
  const recoveryStableMs = opts.recoveryStableMs ?? BLINK_RECOVERY_STABLE_MS;
  const enabled = opts.enabled ?? BLINK_REJECT_GATE_ENABLED;

  let state: 'open' | 'closed' | 'hold' = 'open';
  let holdUntil = 0;
  let closedSince = 0;
  let belowEnterSince: number | null = null;
  let risingEdge = false;

  return {
    update(score, tMs) {
      risingEdge = false;
      if (!enabled) return false;
      const { enter, exit } = resolveThresholds();
      if (state === 'open') {
        if (isBlinking(score, enter)) {
          state = 'closed'; closedSince = tMs; belowEnterSince = null; risingEdge = true;
          return true;
        }
        return false;
      }
      if (state === 'closed') {
        // Fail-open só para ENTRAR: um null no meio da piscada vira hold, não reabertura.
        if (score == null || score <= exit) {
          state = 'hold'; holdUntil = tMs + holdMs; belowEnterSince = null;
        } else if (!isBlinking(score, enter)) {
          // Recuperação estável: o score saiu da zona de piscada e se manteve fora
          // por recoveryStableMs — a pálpebra reabriu, mesmo que o baseline (0.29
          // acontece) nunca cruze o exit. Sem esta saída, quem repousa entre exit
          // e enter pagaria maxBlinkMs inteiro em TODA piscada.
          if (belowEnterSince === null) belowEnterSince = tMs;
          const stableRecovery = tMs - belowEnterSince >= recoveryStableMs;
          // Backstop fisiológico: score oscilando em torno do enter nunca acumula
          // estabilidade; passado maxBlinkMs o que sobra é baseline, não piscada.
          const overdue = tMs - closedSince > maxBlinkMs;
          if (stableRecovery || overdue) {
            state = 'hold'; holdUntil = tMs + holdMs; belowEnterSince = null;
          }
        } else {
          belowEnterSince = null; // ainda piscando: janela de recuperação descartada
        }
        return true;
      }
      // state === 'hold'
      if (isBlinking(score, enter)) { state = 'closed'; closedSince = tMs; belowEnterSince = null; return true; }
      if (tMs < holdUntil) return true;
      state = 'open';
      return false;
    },
    wasRisingEdge() { return risingEdge; },
    reset() { state = 'open'; holdUntil = 0; closedSince = 0; belowEnterSince = null; risingEdge = false; },
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

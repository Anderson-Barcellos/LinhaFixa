// Baseline de eyeBlink medido do próprio sujeito, coletado nas janelas de settle
// da calibração (o olho está pousando num ponto e nenhuma amostra de ajuste é
// coletada — ~4s de sinal que era descartado). Piscadas são picos raros e curtos;
// o repouso é o corpo da distribuição, então a mediana é robusta a elas.
//
// Correção de P3 do spec 2026-07-28: os limiares fixos (enter 0.5 / exit 0.25)
// deixam baselines reais (~0.29) numa zona morta em que o exit nunca é cruzado.
// Aqui o exit é derivado ACIMA do baseline; fora das faixas de sanidade a
// derivação devolve null e os limiares fixos continuam valendo — o fallback é
// exatamente o comportamento de hoje, nunca pior.

export interface DerivedBlinkThresholds {
  enter: number;
  exit: number;
}

// Faixas de elevação da grade de calibração (y normalizado): a coleta em alvos
// inferiores embute downgaze no baseline (Read 2006). Fase 1 do §3.4: MEDIR o
// gradiente sem mudar a derivação — slopeProxy >0 recorrente é a evidência que
// justificaria (ou não) um exit elevação-dependente no futuro.
export type BaselineBand = 'top' | 'mid' | 'bottom';
export const MIN_BAND_SAMPLES = 10;

export function bandForCalibY(y: number): BaselineBand {
  if (y < 1 / 3) return 'top';
  if (y < 2 / 3) return 'mid';
  return 'bottom';
}

export const BLINK_EXIT_MIN_MARGIN = 0.05;
export const BLINK_ENTER_GAP = 0.15;
export const BLINK_ENTER_FLOOR = 0.45;
export const BLINK_EXIT_RANGE = Object.freeze({ min: 0.10, max: 0.45 });
export const BLINK_ENTER_RANGE = Object.freeze({ min: 0.45, max: 0.75 });
// ~1s de settle a 30fps; as janelas somadas dão 100-240 frames em condições normais.
export const MIN_BASELINE_SAMPLES = 30;

// Medição crua + resultado da derivação, lado a lado: quando a derivação é
// recusada (fallback fixo), o número medido é exatamente a evidência que
// explica o porquê — sem ela o fallback é indistinguível de "não mediu".
export interface BlinkBaselineSnapshot {
  sampleCount: number;
  /** Mediana dos scores de settle (repouso medido do sujeito). */
  baseline: number | null;
  p90: number | null;
  derived: DerivedBlinkThresholds | null;
  /** Só faixas com n>0 — observação lateral, não alimenta a derivação. */
  perBand: Array<{ band: BaselineBand; n: number; median: number }>;
  /** mediana(bottom) − mediana(top); >0 sugere downgaze elevando o score. */
  slopeProxy: number | null;
}

export interface BlinkBaselineMeter {
  observe(score: number | null, band?: BaselineBand): void;
  sampleCount(): number;
  derive(): DerivedBlinkThresholds | null;
  snapshot(): BlinkBaselineSnapshot;
  reset(): void;
}

function percentile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export function createBlinkBaselineMeter(): BlinkBaselineMeter {
  const scores: number[] = [];
  // Pool por faixa: observacional, nunca lido por derive(). O pool completo
  // acima continua o único dono da derivação de limiares.
  const byBand = new Map<BaselineBand, number[]>();
  return {
    observe(score, band) {
      if (score == null || !Number.isFinite(score)) return;
      scores.push(score);
      if (band != null) {
        let bucket = byBand.get(band);
        if (!bucket) {
          bucket = [];
          byBand.set(band, bucket);
        }
        bucket.push(score);
      }
    },
    sampleCount() {
      return scores.length;
    },
    derive() {
      if (scores.length < MIN_BASELINE_SAMPLES) return null;
      const sorted = scores.slice().sort((a, b) => a - b);
      const baseline = percentile(sorted, 0.5);
      const spread = percentile(sorted, 0.9) - baseline;
      if (!Number.isFinite(baseline) || !Number.isFinite(spread)) return null;
      const exit = baseline + Math.max(spread, BLINK_EXIT_MIN_MARGIN);
      // Fora da faixa não se clampa: um exit "válido" fabricado por clamp
      // esconderia um sinal que o contrato não cobre. Fallback honesto.
      if (exit < BLINK_EXIT_RANGE.min || exit > BLINK_EXIT_RANGE.max) return null;
      const enter = Math.max(exit + BLINK_ENTER_GAP, BLINK_ENTER_FLOOR);
      if (enter < BLINK_ENTER_RANGE.min || enter > BLINK_ENTER_RANGE.max) return null;
      return { enter, exit };
    },
    snapshot() {
      if (scores.length === 0) {
        return { sampleCount: 0, baseline: null, p90: null, derived: null, perBand: [], slopeProxy: null };
      }
      const sorted = scores.slice().sort((a, b) => a - b);
      const perBand: Array<{ band: BaselineBand; n: number; median: number }> = [];
      const medianByBand = new Map<BaselineBand, number>();
      for (const band of ['top', 'mid', 'bottom'] as const) {
        const bucket = byBand.get(band);
        if (!bucket || bucket.length === 0) continue;
        const bucketSorted = bucket.slice().sort((a, b) => a - b);
        const median = percentile(bucketSorted, 0.5);
        medianByBand.set(band, median);
        perBand.push({ band, n: bucket.length, median });
      }
      const topN = byBand.get('top')?.length ?? 0;
      const bottomN = byBand.get('bottom')?.length ?? 0;
      const slopeProxy =
        topN >= MIN_BAND_SAMPLES && bottomN >= MIN_BAND_SAMPLES
          ? medianByBand.get('bottom')! - medianByBand.get('top')!
          : null;
      return {
        sampleCount: scores.length,
        baseline: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        derived: this.derive(),
        perBand,
        slopeProxy,
      };
    },
    reset() {
      scores.length = 0;
      byBand.clear();
    },
  };
}

// --- Fonte única dos limiares vigentes ---
// Estado de sessão, como o modelo de calibração: derivado no aceite da
// calibração, zerado junto com âncoras/baselines. Os gates leem em tempo de
// update — o gate do pipeline nasce antes da calibração existir. O store
// guarda o snapshot inteiro: o gate consome só `derived`, o diagnóstico lê
// também a medição que o originou.
let committedSnapshot: BlinkBaselineSnapshot | null = null;

export function commitBlinkBaselineSnapshot(s: BlinkBaselineSnapshot | null): void {
  committedSnapshot = s;
}

export function getBlinkBaselineSnapshot(): BlinkBaselineSnapshot | null {
  return committedSnapshot;
}

/** Commit de limiares sem medição associada (testes e overrides diretos). */
export function commitDerivedBlinkThresholds(t: DerivedBlinkThresholds | null): void {
  committedSnapshot = t
    ? { sampleCount: 0, baseline: null, p90: null, derived: t, perBand: [], slopeProxy: null }
    : null;
}

export function getDerivedBlinkThresholds(): DerivedBlinkThresholds | null {
  return committedSnapshot?.derived ?? null;
}

export function resetDerivedBlinkThresholds(): void {
  committedSnapshot = null;
}

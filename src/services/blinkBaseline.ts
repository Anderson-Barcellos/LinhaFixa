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

export const BLINK_EXIT_MIN_MARGIN = 0.05;
export const BLINK_ENTER_GAP = 0.15;
export const BLINK_ENTER_FLOOR = 0.45;
export const BLINK_EXIT_RANGE = Object.freeze({ min: 0.10, max: 0.45 });
export const BLINK_ENTER_RANGE = Object.freeze({ min: 0.45, max: 0.75 });
// ~1s de settle a 30fps; as janelas somadas dão 100-240 frames em condições normais.
export const MIN_BASELINE_SAMPLES = 30;

export interface BlinkBaselineMeter {
  observe(score: number | null): void;
  sampleCount(): number;
  derive(): DerivedBlinkThresholds | null;
  reset(): void;
}

function percentile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export function createBlinkBaselineMeter(): BlinkBaselineMeter {
  const scores: number[] = [];
  return {
    observe(score) {
      if (score != null && Number.isFinite(score)) scores.push(score);
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
    reset() {
      scores.length = 0;
    },
  };
}

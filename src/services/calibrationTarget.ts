// Dimensionamento do alvo de calibração em graus de ângulo visual.
//
// Núcleo de 0,6° (Thaler et al. 2013: o alvo que minimiza a dispersão da
// fixação) que nasce em ~2,0° e encolhe durante o settle — o encolhimento
// concentra o olhar no centro (prática recomendada pelo Tobii Pro SDK) e
// sinaliza ao usuário quando a coleta começa. O clamp em px existe porque
// pxPerDeg varia com a distância estimada: um núcleo < 14px é difícil de
// achar na tela; > 32px deixa de ser um ponto e vira uma área.

export const TARGET_CORE_DEG = 0.6;
export const TARGET_START_DEG = 2.0;
export const CORE_PX_RANGE = Object.freeze({ min: 14, max: 32 });
// Sem geometria utilizável (pxPerDeg inválido), o tamanho do dot antigo.
export const CORE_PX_FALLBACK = 20;

export interface TargetSizing {
  corePx: number;
  startScale: number;
}

export function targetSizing(pxPerDeg: number): TargetSizing {
  const startScale = TARGET_START_DEG / TARGET_CORE_DEG;
  if (!Number.isFinite(pxPerDeg) || pxPerDeg <= 0) {
    return { corePx: CORE_PX_FALLBACK, startScale };
  }
  const raw = TARGET_CORE_DEG * pxPerDeg;
  const corePx = Math.min(CORE_PX_RANGE.max, Math.max(CORE_PX_RANGE.min, raw));
  return { corePx, startScale };
}

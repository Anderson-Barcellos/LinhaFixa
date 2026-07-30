// Decisões de re-coleta da calibração: um ponto fraco (piscada longa, tracking
// ruim naquele instante, purga de blink que atravessou a fronteira do ponto)
// não deve custar a tentativa inteira. Cada ponto ganha UMA re-visita antes de
// a rejeição — que continua existindo e usando o mesmo assessment — acontecer.
// Espelho do "Improve Points" do Tobii PCEye / Titta issue #17.

export const MAX_POINT_RETRIES = 1;

export type PointTimeoutOutcome = 'complete' | 'retry' | 'reject';

// Decisão no estouro do timeout de um ponto (MAX_POINT_MS por visita).
export function timeoutOutcome(
  collected: number,
  minSamples: number,
  retriesUsed: number,
  maxRetries: number = MAX_POINT_RETRIES,
): PointTimeoutOutcome {
  if (collected >= minSamples) return 'complete';
  return retriesUsed < maxRetries ? 'retry' : 'reject';
}

// Fim da grade: primeiro ponto abaixo do mínimo que ainda tem re-visita
// disponível (a purga de blink decrementa contadores de pontos já completados,
// então um ponto pode enfraquecer DEPOIS de fechado). null = nada a re-visitar.
export function nextWeakPointIndex(
  counts: number[],
  retries: number[],
  minSamples: number,
  maxRetries: number = MAX_POINT_RETRIES,
): number | null {
  const idx = counts.findIndex(
    (count, i) => count < minSamples && (retries[i] ?? 0) < maxRetries,
  );
  return idx === -1 ? null : idx;
}

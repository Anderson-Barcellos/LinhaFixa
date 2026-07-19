// Turns the /api/generateInsight HTTP outcome into the message shown in the
// dashboard card. Pure so the 429/erro/sucesso branches stay testable.

const FALLBACK_MESSAGE = 'Não foi possível gerar a análise no momento.';
const RATE_LIMIT_MESSAGE =
  'Muitas gerações em sequência — aguarde alguns minutos e tente novamente.';

export function interpretInsightResponse(
  status: number,
  body: Record<string, unknown> | null,
): string {
  if (status === 429) return RATE_LIMIT_MESSAGE;
  if (status >= 200 && status < 300 && typeof body?.text === 'string' && body.text.trim()) {
    return body.text;
  }
  return FALLBACK_MESSAGE;
}

// Silent-reading pace: ~3-4.5 words/s. The floor keeps today's minimum text;
// the cap bounds the OpenAI prompt no matter what duration a caller sends.
export function readingWordRange(targetDurationSec: number): { min: number; max: number } {
  const sec = Number.isFinite(targetDurationSec) && targetDurationSec > 0 ? targetDurationSec : 20;
  const clamp = (n: number) => Math.max(30, Math.min(400, Math.round(n)));
  return { min: clamp(sec * 3), max: clamp(sec * 4.5) };
}

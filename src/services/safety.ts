import { PreTestContext } from '@/types';

// Deterministic gate, never delegated to the AI: a "péssimo" self-report blocks
// training the same way high symptom scores used to before the quick context.
export function checkContextSafety(context: PreTestContext): { safe: boolean; reason?: string } {
  if (context.feeling <= 1) {
    return {
      safe: false,
      reason: 'Você relatou estar se sentindo péssimo agora. Por segurança, adie o treino; se isso persistir, procure seu especialista.'
    };
  }

  return { safe: true };
}

import type {
  AssessmentMode,
  AssessmentResultSummary,
  AssessmentStage,
  RecallTestResult,
} from '@/types';

export interface AssessmentStageInput {
  mode: AssessmentMode;
  readingTextState: 'idle' | 'loading' | 'ready' | 'error';
  capturing: boolean;
  recallGenerating: boolean;
  recallQuizOpen: boolean;
  hasCaptureResult: boolean;
}

export interface AssessmentResultInput {
  mode: AssessmentMode;
  captureTitle: string;
  recallResult: RecallTestResult | null;
}

export function deriveAssessmentStage(input: AssessmentStageInput): AssessmentStage {
  if (input.capturing) return 'capturing';
  if (input.recallGenerating) return 'generating-quiz';
  if (input.recallQuizOpen) return 'quiz';
  if (input.hasCaptureResult) return 'result';
  if (input.readingTextState === 'loading') return 'loading-text';
  if (input.readingTextState === 'ready') return 'text-ready';
  return 'setup';
}

export function canStartAssessment(input: AssessmentStageInput): { ok: boolean; reason: string | null } {
  if (input.readingTextState === 'idle') {
    return {
      ok: false,
      reason: 'Prepare o texto de leitura antes de iniciar a captura.',
    };
  }
  if (input.readingTextState === 'error') {
    return {
      ok: false,
      reason: 'Texto de leitura indisponivel; capture depois que a IA responder.',
    };
  }
  if (input.readingTextState === 'loading') {
    return {
      ok: false,
      reason: 'Gerando texto de leitura para recall…',
    };
  }
  return { ok: true, reason: null };
}

export function buildAssessmentResultSummary(input: AssessmentResultInput): AssessmentResultSummary {
  if (input.mode === 'recall' && input.recallResult) {
    return {
      title: input.captureTitle,
      badge: `Recall ${input.recallResult.score}/${input.recallResult.questions.length}`,
    };
  }
  return {
    title: input.captureTitle,
    badge: 'Captura simples',
  };
}

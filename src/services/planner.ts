import type {
  PlanOrigin,
  PreTestContext,
  SessionResult,
  TreatmentPlanResponse,
  UserProfile,
} from '@/types';
import { apiUrl } from './apiBase';
import {
  BackendRequestError,
  backendFailureFromResponse,
  backendFailureMessage,
  networkBackendFailure,
  type BackendFailureKind,
} from './apiFailure';
import { checkContextSafety } from './safety';

export type GeneratedTreatmentPlan = TreatmentPlanResponse & {
  origin: PlanOrigin;
  fallbackFailure: BackendFailureKind | null;
  fallbackMessage: string | null;
};

function buildFallbackPlan(
  profile: UserProfile,
  fallbackFailure: BackendFailureKind,
  fallbackMessage: string,
): GeneratedTreatmentPlan {
  return {
    sessionTitle: 'Treino Básico de Mobilidade',
    safetyStatus: {
      allowTraining: true,
      reason: 'Sintomas em nível aceitável.',
      recommendPause: false,
      recommendProfessionalReview: false,
    },
    exercises: [
      {
        exerciseId: 'fixation',
        durationSec: 20,
        difficulty: 1,
        parameters: {
          targetSizeMm: 15,
          speedDegPerSec: 0,
          amplitudeDeg: 0,
          lineSpacingMultiplier: 1,
          contrastMode: profile.contrastPreference,
          durationSec: 20,
        },
        rationalePtBR: 'Aquecimento: fixe o olhar no ponto central e toque na tela quando ele mudar de cor.',
        stopRules: ['Excesso de tontura', 'Náusea'],
      },
      {
        exerciseId: 'saccades',
        durationSec: 30,
        difficulty: 1,
        parameters: {
          targetSizeMm: 12,
          speedDegPerSec: 0,
          amplitudeDeg: 15,
          lineSpacingMultiplier: 1,
          contrastMode: profile.contrastPreference,
          durationSec: 30,
        },
        rationalePtBR: 'Acompanhe o ponto com os olhos enquanto ele pula, sem mover a cabeça.',
        stopRules: ['Visão dupla nova', 'Fadiga extrema'],
      },
      {
        exerciseId: 'assistedReading',
        durationSec: 60,
        difficulty: 1,
        parameters: {
          targetSizeMm: 12,
          speedDegPerSec: 0,
          amplitudeDeg: 0,
          lineSpacingMultiplier: 1.5,
          contrastMode: profile.contrastPreference,
          durationSec: 60,
          textComplexity: 'facil',
        },
        rationalePtBR: 'Leitura guiada de texto gerado por IA para treinar varredura visual e ritmo.',
        stopRules: ['Excesso de borramento ocular'],
      },
    ],
    patientFeedbackPtBR: 'Excelente dedicação até agora. Lembre-se de manter a cabeça parada.',
    clinicianSummaryPtBR: 'Protocolo padrão iniciado devido a histórico adequado ou ausência de histórico crítico.',
    origin: 'local-fallback',
    fallbackFailure,
    fallbackMessage,
  };
}

function blockedPlan(reason?: string): GeneratedTreatmentPlan {
  return {
    sessionTitle: 'Sessão Interrompida',
    safetyStatus: {
      allowTraining: false,
      reason: reason || 'Sensação relatada muito baixa antes do treino.',
      recommendPause: true,
      recommendProfessionalReview: true,
    },
    exercises: [],
    patientFeedbackPtBR: 'Notamos que você não está se sentindo bem. Por segurança, recomendamos não treinar agora.',
    clinicianSummaryPtBR: 'Usuário relatou sensação subjetiva mínima (1/5) no contexto pré-teste. Treino bloqueado pelo sistema.',
    origin: 'safety-block',
    fallbackFailure: null,
    fallbackMessage: null,
  };
}

function isValidPlan(plan: unknown): plan is TreatmentPlanResponse {
  const candidate = plan as TreatmentPlanResponse | null;
  return !!candidate
    && typeof candidate.sessionTitle === 'string'
    && !!candidate.safetyStatus
    && typeof candidate.safetyStatus.allowTraining === 'boolean'
    && Array.isArray(candidate.exercises)
    && candidate.exercises.every(exercise => (
      !!exercise
      && typeof exercise.exerciseId === 'string'
      && !!exercise.parameters
    ));
}

export async function generateTreatmentPlan(
  profile: UserProfile,
  context: PreTestContext,
  history: SessionResult[],
): Promise<GeneratedTreatmentPlan> {
  const safety = checkContextSafety(context);
  if (!safety.safe) return blockedPlan(safety.reason);

  try {
    const response = await fetch(apiUrl('/api/generatePlan'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, context, history }),
    });
    if (!response.ok) throw await backendFailureFromResponse(response);
    const data = await response.json().catch(() => null) as { plan?: unknown } | null;
    if (!isValidPlan(data?.plan)) {
      throw new BackendRequestError('invalid-payload', response.status);
    }
    if (!data.plan.safetyStatus.allowTraining) return blockedPlan(data.plan.safetyStatus.reason);
    return {
      ...data.plan,
      origin: 'ai',
      fallbackFailure: null,
      fallbackMessage: null,
    };
  } catch (error) {
    const failure = networkBackendFailure(error);
    return buildFallbackPlan(profile, failure.kind, backendFailureMessage(failure));
  }
}

import { TreatmentPlanResponse, SymptomRating, UserProfile, SessionResult } from '@/types';

// Deterministic, offline-safe plan used as a fallback whenever the AI planner is
// unavailable (no API key, network error, or invalid response).
function buildFallbackPlan(profile: UserProfile): TreatmentPlanResponse {
  return {
    sessionTitle: "Treino Básico de Mobilidade",
    safetyStatus: {
      allowTraining: true,
      reason: "Sintomas em nível aceitável.",
      recommendPause: false,
      recommendProfessionalReview: false
    },
    exercises: [
      {
        exerciseId: "fixation",
        durationSec: 20,
        difficulty: 1,
        parameters: {
          targetSizeMm: 15,
          speedDegPerSec: 0,
          amplitudeDeg: 0,
          lineSpacingMultiplier: 1,
          contrastMode: profile.contrastPreference,
          durationSec: 20
        },
        rationalePtBR: "Aquecimento: fixe o olhar no ponto central e toque na tela quando ele mudar de cor.",
        stopRules: ["Excesso de tontura", "Náusea"]
      },
      {
        exerciseId: "saccades",
        durationSec: 30,
        difficulty: 1,
        parameters: {
          targetSizeMm: 12,
          speedDegPerSec: 0,
          amplitudeDeg: 15,
          lineSpacingMultiplier: 1,
          contrastMode: profile.contrastPreference,
          durationSec: 30
        },
        rationalePtBR: "Acompanhe o ponto com os olhos enquanto ele pula, sem mover a cabeça.",
        stopRules: ["Visão dupla nova", "Fadiga extrema"]
      },
      {
        exerciseId: "assistedReading",
        durationSec: 60,
        difficulty: 1,
        parameters: {
          targetSizeMm: 12,
          speedDegPerSec: 0,
          amplitudeDeg: 0,
          lineSpacingMultiplier: 1.5,
          contrastMode: profile.contrastPreference,
          durationSec: 60,
          textComplexity: "facil"
        },
        rationalePtBR: "Leitura guiada de texto gerado por IA para treinar varredura visual e ritmo.",
        stopRules: ["Excesso de borramento ocular"]
      }
    ],
    patientFeedbackPtBR: "Excelente dedicação até agora. Lembre-se de manter a cabeça parada.",
    clinicianSummaryPtBR: "Protocolo padrão iniciado devido a histórico adequado ou ausência de histórico crítico."
  };
}

function blockedPlan(): TreatmentPlanResponse {
  return {
    sessionTitle: "Sessão Interrompida",
    safetyStatus: {
      allowTraining: false,
      reason: "Sintomas elevados relatados antes do treino.",
      recommendPause: true,
      recommendProfessionalReview: true
    },
    exercises: [],
    patientFeedbackPtBR: "Notamos que seus sintomas base estão altos. Por segurança, recomendamos não treinar agora.",
    clinicianSummaryPtBR: "Usuário apresentou pontuação >= 7 em sintomas de base. Treino bloqueado pelo sistema."
  };
}

// Minimal shape validation so a malformed AI response never breaks the player.
function isValidPlan(p: any): p is TreatmentPlanResponse {
  return p
    && typeof p.sessionTitle === 'string'
    && p.safetyStatus
    && typeof p.safetyStatus.allowTraining === 'boolean'
    && Array.isArray(p.exercises)
    && p.exercises.every((e: any) => e && typeof e.exerciseId === 'string' && e.parameters);
}

export async function generateTreatmentPlan(
  profile: UserProfile,
  symptoms: SymptomRating,
  history: SessionResult[]
): Promise<TreatmentPlanResponse> {
  // Deterministic safety gate ALWAYS runs first and is never delegated to the AI.
  const highSymptoms = Object.values(symptoms).some(v => v >= 7);
  if (highSymptoms) {
    return blockedPlan();
  }

  // Try the AI planner (OpenAI, proxied by the server). Falls back deterministically.
  try {
    const res = await fetch('/api/generatePlan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, symptoms, history })
    });
    if (res.ok) {
      const data = await res.json();
      if (isValidPlan(data?.plan)) {
        // Re-assert the safety gate even on AI output.
        if (!data.plan.safetyStatus.allowTraining) return blockedPlan();
        return data.plan as TreatmentPlanResponse;
      }
    }
  } catch (e) {
    console.warn("Planejador de IA indisponível, usando plano padrão offline.", e);
  }

  return buildFallbackPlan(profile);
}

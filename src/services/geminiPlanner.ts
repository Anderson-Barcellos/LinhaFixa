import { GeminiPlanResponse, SymptomRating, UserProfile, SessionResult } from '@/types';

// Mock planner fallback
export async function generateTreatmentPlan(
  profile: UserProfile,
  symptoms: SymptomRating,
  history: SessionResult[]
): Promise<GeminiPlanResponse> {
  // If an API endpoint for Gemini was available, we would call it here.
  // For safety and offline capability, we use deterministic mock planning directly.
  
  const highSymptoms = Object.values(symptoms).some(v => v >= 7);
  
  if (highSymptoms) {
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
    }
  }

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
  }
}

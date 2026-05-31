export interface UserProfile {
  name: string;
  isAdult: boolean;
  fontSizePreference: 'normal' | 'large' | 'huge';
  contrastPreference: 'light' | 'dark' | 'high-contrast';
  cameraEnabled: boolean;
  viewingDistanceCm: number;
}

export interface SymptomRating {
  dorOcular: number;
  cefaleia: number;
  visaoDupla: number;
  tontura: number;
  nausea: number;
  fotofobia: number;
  fadigaVisual: number;
  borramento: number;
}

export interface ExerciseParameters {
  targetSizeMm: number;
  speedDegPerSec: number;
  amplitudeDeg: number;
  lineSpacingMultiplier: number;
  contrastMode: string;
  durationSec: number;
  textComplexity?: 'facil' | 'dificil';
}

export interface ExerciseDefinition {
  id: string;
  namePtBR: string;
  category: string;
  clinicalPurposePtBR: string;
  evidenceCautionPtBR: string;
  contraindicationNotesPtBR: string;
  defaultParameters: ExerciseParameters;
}

export interface ExerciseResult {
  exerciseId: string;
  completed: boolean;
  score: number; // 0-100
  headStillnessScore: number; // 0-100
  reactionTimeMs?: number;
  parametersUsed: ExerciseParameters;
  timestamp: number;
  extraData?: any;
}

export interface SessionResult {
  id: string;
  timestamp: number;
  durationSec: number;
  symptomsBefore: SymptomRating;
  symptomsAfter: SymptomRating;
  exercises: ExerciseResult[];
  clinicianSummaryPtBR?: string;
}

export interface GeminiPlanResponse {
  sessionTitle: string;
  safetyStatus: {
    allowTraining: boolean;
    reason: string;
    recommendPause: boolean;
    recommendProfessionalReview: boolean;
  };
  exercises: {
    exerciseId: string;
    durationSec: number;
    difficulty: number;
    parameters: ExerciseParameters;
    rationalePtBR: string;
    stopRules: string[];
  }[];
  patientFeedbackPtBR: string;
  clinicianSummaryPtBR: string;
}

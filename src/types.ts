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
  headStillnessScore: number | null; // 0-100, or null when no real face tracking was available
  reactionTimeMs?: number;
  parametersUsed: ExerciseParameters;
  timestamp: number;
  extraData?: any;
}

// A single horizontal/vertical gaze sample (normalized 0..1 ratios) with a timestamp.
export interface GazeSample {
  t: number; // ms relative to exercise start
  h: number; // horizontal gaze ratio (0 = looking left, 1 = looking right)
  v: number; // vertical gaze ratio (0 = up, 1 = down)
}

// Experimental, webcam-based saccade estimate produced from a stream of GazeSamples.
// NOTE: a consumer webcam (~30Hz, ~1-2 deg accuracy) cannot resolve microsaccades.
// These are coarse saccade/fixation estimates only.
export interface SaccadeMetrics {
  trackingAvailable: boolean; // false when no real gaze data was captured
  samplesValid: number;       // number of usable gaze samples
  saccadeCount: number;
  regressionCount: number;        // saccades against the reading direction (re-reading)
  meanSaccadeAmplitude: number;   // mean |Δh| of detected saccades (gaze-ratio units, approx.)
  meanFixationMs: number;         // mean duration between saccades
}

// A gaze point projected into screen/canvas space (pixels) by the calibration model.
export interface GazePoint {
  t: number; // ms relative to exercise start
  x: number; // canvas px
  y: number; // canvas px
}

// Fixation stability during a hold-the-target task (e.g. the fixation exercise),
// measured from calibrated screen-space gaze. All angular values are approximate
// (webcam, ~30Hz, ~1-2 deg accuracy).
export interface FixationMetrics {
  trackingAvailable: boolean;     // false when no calibrated gaze was captured
  samplesValid: number;
  meanDispersionDeg: number;      // mean angular distance of gaze from the target center
  rmsDispersionDeg: number;       // RMS angular distance (penalises larger excursions)
  percentWithinThreshold: number; // % of time gaze stayed within the fixation threshold
  fixationBreaks: number;         // times gaze left the threshold and came back
}

// Saccade task metrics (the saccades exercise): latency to start moving toward the
// new target and landing accuracy, measured from calibrated screen-space gaze.
export interface SaccadeTaskMetrics {
  trackingAvailable: boolean;
  samplesValid: number;
  validSaccades: number;          // jumps with a usable latency/accuracy estimate
  meanLatencyMs: number;          // mean time from target jump to gaze movement onset
  meanAccuracyDeg: number;        // mean angular error of gaze landing vs target
  meanGain: number;               // landing displacement / target displacement (1 = on target)
}

// Smooth pursuit metrics (the smooth-pursuit exercise): how well gaze tracks the
// moving target, from calibrated screen-space gaze.
export interface PursuitMetrics {
  trackingAvailable: boolean;
  samplesValid: number;
  gain: number;                   // gaze speed / target speed (1 = perfect tracking)
  rmsErrorDeg: number;            // RMS angular tracking error (gaze vs target)
  percentOnTarget: number;        // % of time gaze stayed within the on-target threshold
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

export interface TreatmentPlanResponse {
  sessionTitle: string;
  safetyStatus: {
    allowTraining: boolean;
    reason: string;
    recommendPause?: boolean;
    recommendProfessionalReview?: boolean;
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

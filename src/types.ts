import type { PosturalStabilityMetrics } from '@/exercises/posturalStability';
import type { CalibrationAssessment } from '@/services/calibrationValidity';
import type { CaptureValiditySnapshot } from '@/services/captureValidity';

export interface UserProfile {
  name: string;
  isAdult: boolean;
  fontSizePreference: 'normal' | 'large' | 'huge';
  contrastPreference: 'light' | 'dark' | 'high-contrast';
  cameraEnabled: boolean;
  viewingDistanceCm: number;
}

// Legacy 0-10 symptom questionnaire. Kept only so sessions saved before the quick
// context existed remain readable; new sessions record Pre/PostTestContext instead.
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

// Quick pre-test context replacing the long symptom questionnaire (single-user app).
// Scales run 1 (worst) .. 5 (best), except fatigue where 5 = exhausted.
export interface PreTestContext {
  venvanseTakenAt: string | null; // "HH:MM" local time; null = not taken today
  sleepHours: number;             // last night, 0-14 in 0.5 steps
  mood: number;                   // 1..5
  feeling: number;                // subjective readiness right now, 1..5
}

export interface PostTestContext {
  feeling: number; // 1..5
  fatigue: number; // 1..5 (5 = exhausted)
  mood: number;    // 1..5
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

// One detected velocity-threshold crossing from the I-VT detector, closed and routed
// to its bucket. Timestamps follow the aggregate-metric convention: tStart is the last
// sample before velocity crossed above threshold, tEnd the sample where it fell back
// below (or the last sample for a saccade still open at the end of the signal).
export interface SaccadeEvent {
  tStart: number;    // ms, same clock as GazeSample.t
  tEnd: number;      // ms
  amplitude: number; // signed Δh in gaze-ratio units (negative = leftward)
  kind: 'saccade' | 'regression' | 'line-return';
}

// Experimental, webcam-based saccade estimate produced from a stream of GazeSamples.
// NOTE: consumer webcam gaze is noisy and device/browser frame-rate dependent.
// These are coarse saccade/fixation estimates only; they cannot resolve microsaccades.
export interface SaccadeMetrics {
  trackingAvailable: boolean; // false when no real gaze data was captured
  samplesValid: number;       // number of usable gaze samples
  signalSource?: 'calibrated-mediapipe' | 'raw-mediapipe' | 'unavailable';
  sampleRateHz?: number;
  saccadeCount: number;           // reading saccades (progressive + regressions), excludes line returns
  regressionCount: number;        // saccades against the reading direction (re-reading), excludes line returns
  lineReturnCount?: number;       // large leftward sweeps back to the next line start (absent on legacy captures)
  meanSaccadeAmplitude: number | null; // mean |Δh| of detected reading saccades; null when no event is estimable
  meanFixationMs: number | null;       // mean duration between saccades; null when no fixation is estimable
  // Individual detected events, present only when analyzeSaccades ran with
  // collectEvents: true (ground-truth validation); not persisted by default.
  events?: SaccadeEvent[];
}

// A gaze point projected into screen/canvas space (pixels) by the calibration model.
export interface GazePoint {
  t: number; // ms relative to exercise start
  x: number; // canvas px
  y: number; // canvas px
}

// Fixation stability during a hold-the-target task (e.g. the fixation exercise),
// measured from calibrated screen-space gaze. All angular values are approximate
// (webcam, device/browser-dependent frame rate, limited angular accuracy).
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
  validSaccades: number;          // jumps with a usable landing (accuracy/gain) estimate
  validLatencyCount: number;      // jumps whose latency fell in the plausible window
  meanLatencyMs: number | null;   // mean time from target jump to gaze movement onset; null when no latency was valid
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
  // Legacy questionnaire (sessions saved before the quick context existed).
  symptomsBefore?: SymptomRating;
  symptomsAfter?: SymptomRating;
  contextBefore?: PreTestContext;
  contextAfter?: PostTestContext;
  exercises: ExerciseResult[];
  clinicianSummaryPtBR?: string;
}

// --- PACK 2: guided real-world validation captures ---
// A diagnostic capture tagged with the physical conditions it was taken under, so
// the PACK 1 postural thresholds and the ocular signal can be calibrated against
// real iPhone data instead of guessed constants.

export type ValidationLighting = 'dim' | 'normal' | 'bright';
export type ValidationPosture = 'upright' | 'tilted' | 'slouched' | 'reclined';

export interface ValidationConditions {
  lighting: ValidationLighting;
  distanceCm: number; // viewing distance at capture time (from the profile)
  posture: ValidationPosture;
  note?: string;
}

// Lightweight per-axis dispersion of the captured gaze signal, used to see when the
// horizontal/vertical signal carries structure vs. noise across conditions.
export interface AxisSignalSummary {
  hStd: number;
  hRange: number;
  vStd: number;
  vRange: number;
}

export interface CaptureEnvironment {
  layoutMode: 'compact' | 'desktop';
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
    orientation: 'portrait' | 'landscape';
  };
  surfaceRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  video: {
    width: number;
    height: number;
  };
  camera: {
    width?: number;
    height?: number;
    frameRate?: number;
    maxFrameRate?: number;
  };
  rates: {
    detectionFps?: number;
    ocularSampleRateHz?: number;
  };
}

export interface ValidationCapture {
  id: string;
  timestamp: number;
  conditions: ValidationConditions;
  // Quick pre-test context tagged on captures taken after it existed.
  context?: PreTestContext;
  coverage: number; // % of frames with a detected face
  calibrated: boolean; // whether the gaze samples came from the calibrated model
  metrics: SaccadeMetrics;
  postural: PosturalStabilityMetrics;
  axis: AxisSignalSummary;
  environment?: CaptureEnvironment;
  sampleCount: number;
  samples: GazeSample[]; // raw signal kept for offline per-axis analysis
  // Geometric provenance (absent on legacy captures). These make the normalized h/v
  // amplitudes convertible to degrees of visual angle offline, so captures can be
  // compared across devices and sessions.
  distanceEstimatedCm?: number;  // median IPD-based distance estimate during the capture
  pxPerDegAtCapture?: number;    // CSS px per degree of visual angle at capture time
  canvasWidthPx?: number;        // reading-canvas width in CSS px at capture time
  orientation?: 'portrait' | 'landscape';
  // Source provenance (absent on legacy captures). The analysis series is single-source
  // (the majority buffer); these counts expose how consistent that source really was
  // during the capture instead of a binary calibrated/raw label.
  calibratedSampleCount?: number; // frames that produced a calibrated sample
  rawSampleCount?: number;        // frames that fell back to the raw iris ratio
  extrapolatedSampleCount?: number; // frames whose calibrated prediction was rejected as extrapolation (clamped outside [0,1])
  // Validity-v1 evidence. Optional only so captures persisted before the contract
  // remain readable; every newly-created capture satisfies AssessedValidationCapture.
  durationMs?: number;
  calibrationAssessment?: CalibrationAssessment;
  validity?: CaptureValiditySnapshot;
}

export type AssessedValidationCapture = ValidationCapture & {
  durationMs: number;
  validity: CaptureValiditySnapshot;
};

export type AssessmentMode = 'capture' | 'recall';

export type AssessmentStage =
  | 'setup'
  | 'loading-text'
  | 'text-ready'
  | 'capturing'
  | 'generating-quiz'
  | 'quiz'
  | 'result';

export interface AssessmentResultSummary {
  title: string;
  badge: string;
}

// --- Reading + Recall test ---
// AI-generated intermediate text read inside the diagnostics capture window, followed
// by 6 multiple-choice questions (5 options each) also generated from the text.

export interface RecallQuestion {
  question: string;
  options: string[];     // exactly 5
  correctIndex: number;  // 0-4, index into options
  rationale: string;     // short justification quoting the supporting passage
}

export interface RecallTestResult {
  id: string;
  timestamp: number;
  topic: string;
  text: string;
  questions: RecallQuestion[]; // as displayed (options already shuffled)
  answers: number[];           // chosen option index per question
  score: number;               // correct answers (0..questions.length)
  readingDurationMs: number;
  captureId?: string;          // ValidationCapture recorded while reading
  context?: PreTestContext;
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

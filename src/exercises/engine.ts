import { ExerciseParameters, GazeSample } from '@/types';

export interface ExerciseContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  timeMs: number;
  dt: number;
  state: any;
  parameters: ExerciseParameters;
  onEvent: (event: string, value?: any) => void;
  // physical dimensions mapped from distance
  cmToPx: (cm: number) => number;
  // visual angle (degrees) -> pixels, calibrated with the viewing distance
  degToPx: (deg: number) => number;
  viewingDistanceCm: number;
  // Most recent webcam gaze sample for this frame, or null when unavailable.
  latestGaze: GazeSample | null;
  // Calibrated gaze point in canvas pixels for this frame, or null when there is no
  // calibration / no face detected. Exercises use this to measure the eyes directly.
  latestGazePoint: { x: number; y: number } | null;
  // Whether a usable gaze calibration exists for this session.
  isGazeCalibrated: boolean;
  fontSizePreference: string;
  finishExercise: (extraData?: any) => void;
}

export interface ExerciseImplementation {
  id: string;
  init: (context: ExerciseContext) => void;
  update: (context: ExerciseContext) => void;
  draw: (context: ExerciseContext) => void;
  onInput: (x: number, y: number, context: ExerciseContext) => void;
  validateStopCondition?: (context: ExerciseContext) => boolean;
  // Optional hook called when the exercise finishes by timeout, returning result
  // data (and an optional score) to attach to the ExerciseResult.
  getResultData?: (context: ExerciseContext) => { score?: number; [k: string]: any };
}

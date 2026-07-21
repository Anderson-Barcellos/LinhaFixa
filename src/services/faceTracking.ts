import type { FaceLandmarker as FaceLandmarkerInstance } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_PUBLIC_ROOT } from '../../config/mediapipe-assets.mjs';
import { GazeSample } from '@/types';
import { createRetryableSingleFlight, loadMediaPipeRuntime } from './mediaPipeRuntime';
import { createInferenceMeter } from './inferenceMeter';

export interface HeadPose {
  pitch: number;
  yaw: number;
  roll: number;
  x: number;
  y: number;
  scale: number;
}

let faceLandmarker: FaceLandmarkerInstance | null = null;

// Which MediaPipe delegate actually initialized — the GPU→CPU fallback is silent
// (console.warn only) and CPU inference is 3-5x slower; the diagnostics UI needs this.
let activeDelegate: 'GPU' | 'CPU' | null = null;
const inferenceMeter = createInferenceMeter();

const detectorInitialization = createRetryableSingleFlight(async () => {
  const { FilesetResolver, FaceLandmarker } = await loadMediaPipeRuntime();
  const mediaPipeBase = `${import.meta.env.BASE_URL}${MEDIAPIPE_PUBLIC_ROOT}`;
  const vision = await FilesetResolver.forVisionTasks(
    // Self-hosted wasm (copied from the pinned @mediapipe/tasks-vision at build time),
    // served under the app base path so it works at '/' or '/gaze/'. Avoids the runtime
    // CDN dependency for offline/privacy/PWA.
    `${mediaPipeBase}/wasm`
  );
  const create = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      // Self-hosted .task bundle (vendored in public/vendor/mediapipe). Includes the
      // iris mesh (478 landmarks), needed for gaze. Served under the app base path.
      modelAssetPath: `${mediaPipeBase}/face_landmarker.task`,
      delegate,
    },
    // Blendshapes give robust eyeLook* coefficients used as gaze-calibration features.
    outputFaceBlendshapes: true,
    runningMode: 'VIDEO',
    numFaces: 1,
  });
  try {
    faceLandmarker = await create('GPU');
    activeDelegate = 'GPU';
  } catch (gpuErr) {
    console.warn('GPU face tracking unavailable; falling back to CPU.', gpuErr);
    faceLandmarker = await create('CPU');
    activeDelegate = 'CPU';
  }
  return true;
});

export async function initFaceTracking(): Promise<boolean> {
  if (faceLandmarker) return true;
  try {
    return await detectorInitialization.run();
  } catch (err) {
    console.warn('Não foi possível inicializar o rastreamento facial real. O monitoramento de cabeça/olhar ficará indisponível.', err);
    return false;
  }
}

// Whether a real (non-mock) face tracker is loaded. The UI uses this to avoid
// reporting fake "perfect" stability when tracking never actually ran.
export function isFaceTrackingActive(): boolean {
  return faceLandmarker !== null;
}

// Cache of the most recent detection so head pose, gaze and calibration features can
// all be derived from a single detectForVideo() call per frame (the model is
// monotonic on timestamp).
let lastDetectTimestamp = -1;
let lastLandmarks: { x: number; y: number; z: number }[] | null = null;
let lastBlendshapes: Map<string, number> | null = null;
let warnedDetectFailure = false;

function detect(videoElement: HTMLVideoElement, timestamp: number) {
  if (!faceLandmarker) return null;
  // Avoid feeding the VIDEO-mode model a non-increasing timestamp.
  if (timestamp <= lastDetectTimestamp) {
    return lastLandmarks;
  }
  lastDetectTimestamp = timestamp;
  let results;
  const inferenceStart = performance.now();
  try {
    results = faceLandmarker.detectForVideo(videoElement, timestamp);
  } catch (err) {
    lastLandmarks = null;
    lastBlendshapes = null;
    if (!warnedDetectFailure) {
      warnedDetectFailure = true;
      console.warn("Face tracking failed during video detection; continuing without gaze metrics.", err);
    }
    return null;
  }
  // Main-thread cost of the sync inference call — exactly what competes with the
  // camera frame budget (a >33ms EMA at a 30fps camera is the 30→15 harmonic).
  inferenceMeter.record(performance.now() - inferenceStart);
  lastLandmarks = (results.faceLandmarks && results.faceLandmarks.length > 0)
    ? results.faceLandmarks[0]
    : null;
  if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
    const map = new Map<string, number>();
    for (const cat of results.faceBlendshapes[0].categories) {
      map.set(cat.categoryName, cat.score);
    }
    lastBlendshapes = map;
  } else {
    lastBlendshapes = null;
  }
  return lastLandmarks;
}

// Raw landmarks from the most recent detect() (normalized [0,1]). Lets higher layers
// derive measurements we don't model here (e.g. inter-pupillary distance for viewing
// geometry) without re-running detection. Null when no face was found.
export function getLastLandmarks(): { x: number; y: number; z: number }[] | null {
  return lastLandmarks;
}

export function estimateHeadPose(videoElement: HTMLVideoElement, timestamp: number): HeadPose | null {
  // Honest behaviour: if the tracker isn't loaded or no face is found, return null.
  // Callers must treat null as "no measurement", not as a perfect/centered pose.
  const landmarks = detect(videoElement, timestamp);
  if (!landmarks) return null;

  let minX = 1, maxX = 0;
  landmarks.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  });

  const nose = landmarks[1];
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;

  // Coarse 2D approximation of head rotation from facial landmarks.
  const yaw = (nose.x - eyeMidX) * 100;
  const pitch = (nose.y - eyeMidY) * 100;
  // Roll from the tilt of the inter-ocular line.
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

  return {
    pitch,
    yaw,
    roll,
    x: nose.x,
    y: nose.y,
    scale: maxX - minX
  };
}

// Estimate horizontal/vertical gaze from iris position relative to the eye corners.
// Returns normalized ratios in [0,1]; null when no real tracking is available.
export function estimateGaze(videoElement: HTMLVideoElement, timestamp: number, tMs: number): GazeSample | null {
  const landmarks = detect(videoElement, timestamp);
  // Iris landmarks only exist on the 478-point mesh.
  if (!landmarks || landmarks.length < 478) return null;

  // Left eye: outer corner 33, inner corner 133, iris center 468.
  const lOuter = landmarks[33], lInner = landmarks[133], lIris = landmarks[468];
  // Right eye: outer corner 263, inner corner 362, iris center 473.
  const rOuter = landmarks[263], rInner = landmarks[362], rIris = landmarks[473];

  // Horizontal ratio per eye, oriented so 0 = subject looking left, 1 = right.
  // For the left eye the outer corner (33) is on the subject's left.
  const ratio = (iris: number, a: number, b: number) => {
    const span = b - a;
    if (Math.abs(span) < 1e-6) return 0.5;
    return Math.min(1, Math.max(0, (iris - a) / span));
  };

  const hLeft = ratio(lIris.x, lOuter.x, lInner.x);
  const hRight = ratio(rIris.x, rInner.x, rOuter.x);
  const h = (hLeft + hRight) / 2;

  // Vertical ratio using upper/lower eyelid landmarks (159/145 left, 386/374 right).
  const upperL = landmarks[159], lowerL = landmarks[145];
  const upperR = landmarks[386], lowerR = landmarks[374];
  const vLeft = ratio(lIris.y, upperL.y, lowerL.y);
  const vRight = ratio(rIris.y, upperR.y, lowerR.y);
  const v = (vLeft + vRight) / 2;

  return { t: tMs, h, v };
}

// Blink score threshold above which the current frame is treated as a blink and its
// gaze sample is dropped. Tuned for the MediaPipe eyeBlink* blendshapes, which run
// ~0 when the eye is open and approach 1 during a full blink.
export const BLINK_REJECT_THRESHOLD = 0.5;
export const BLINK_REJECT_GATE_ENABLED = true;

// Max of the left/right eyeBlink blendshapes for the most recent frame, or null when
// no blendshapes are available. During a blink the iris drops/disappears and would
// inject spurious vertical (and some horizontal) motion into the reading metrics, so
// callers use this to drop the sample while still counting the face as detected.
export function getBlinkScore(): number | null {
  const bs = lastBlendshapes;
  if (!bs) return null;
  return Math.max(bs.get('eyeBlinkLeft') ?? 0, bs.get('eyeBlinkRight') ?? 0);
}

// Pure decision helper so the blink gate is testable without MediaPipe. A null score
// (no blendshapes) is treated as "not blinking" — we don't reject when we can't tell.
export function isBlinking(score: number | null, threshold: number = BLINK_REJECT_THRESHOLD): boolean {
  return score != null && score > threshold;
}

// Shared gate for dropping gaze samples because of blink score. The gate is active by
// default so blink-corrupted iris/features never feed calibration, capture or exercise
// metrics. A null score remains fail-open, and callers/tests can explicitly disable the
// gate if a future device-specific diagnostic requires it.
export function shouldDropGazeForBlink(score: number | null, enabled: boolean = BLINK_REJECT_GATE_ENABLED): boolean {
  return enabled && isBlinking(score);
}

// Names of the eyeLook blendshapes used as gaze features, in a fixed order so the
// calibration model always sees the same feature layout.
const GAZE_BLENDSHAPES = [
  'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeLookDownLeft',
  'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeLookDownRight',
];

// Number of features produced by extractGazeFeatures (kept in sync with the layout
// below). Consumers can rely on this for fixed-width model matrices.
export const GAZE_FEATURE_LENGTH = 4 + GAZE_BLENDSHAPES.length;

// Live telemetry for the diagnostics UI and capture provenance.
export function getDetectionTelemetry(): { delegate: 'GPU' | 'CPU' | null; inferenceEmaMs: number | null; inferenceCount: number } {
  return { delegate: activeDelegate, inferenceEmaMs: inferenceMeter.emaMs(), inferenceCount: inferenceMeter.count() };
}

// Build the gaze feature vector for the current frame, combining iris ratios,
// head pose (to compensate head movement) and eyeLook* blendshapes. Returns null
// when no face is detected. The values are NOT screen coordinates — the calibration
// model (gazeCalibration.ts) maps them to the screen.
export function extractGazeFeatures(videoElement: HTMLVideoElement, timestamp: number): number[] | null {
  const gaze = estimateGaze(videoElement, timestamp, 0);
  if (!gaze) return null;
  const pose = estimateHeadPose(videoElement, timestamp);

  const bs = lastBlendshapes;
  const blend = GAZE_BLENDSHAPES.map(name => (bs ? bs.get(name) ?? 0 : 0));

  return [
    gaze.h,
    gaze.v,
    pose ? pose.yaw : 0,
    pose ? pose.pitch : 0,
    ...blend,
  ];
}

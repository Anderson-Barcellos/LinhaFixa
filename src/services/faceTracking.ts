import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { GazeSample } from '@/types';

export interface HeadPose {
  pitch: number;
  yaw: number;
  roll: number;
  x: number;
  y: number;
  scale: number;
}

let faceLandmarker: FaceLandmarker | null = null;

export async function initFaceTracking() {
  if (faceLandmarker) return;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        // This .task bundle includes the iris mesh (478 landmarks), needed for gaze.
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU"
      },
      outputFaceBlendshapes: false,
      runningMode: "VIDEO",
      numFaces: 1
    });
  } catch (err) {
    console.warn("Não foi possível inicializar o rastreamento facial real. O monitoramento de cabeça/olhar ficará indisponível.", err);
  }
}

// Whether a real (non-mock) face tracker is loaded. The UI uses this to avoid
// reporting fake "perfect" stability when tracking never actually ran.
export function isFaceTrackingActive(): boolean {
  return faceLandmarker !== null;
}

// Cache of the most recent detection so head pose and gaze can be derived from a
// single detectForVideo() call per frame (the model is monotonic on timestamp).
let lastDetectTimestamp = -1;
let lastLandmarks: { x: number; y: number; z: number }[] | null = null;

function detect(videoElement: HTMLVideoElement, timestamp: number) {
  if (!faceLandmarker) return null;
  // Avoid feeding the VIDEO-mode model a non-increasing timestamp.
  if (timestamp <= lastDetectTimestamp) {
    return lastLandmarks;
  }
  lastDetectTimestamp = timestamp;
  const results = faceLandmarker.detectForVideo(videoElement, timestamp);
  lastLandmarks = (results.faceLandmarks && results.faceLandmarks.length > 0)
    ? results.faceLandmarks[0]
    : null;
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

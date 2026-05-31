import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

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
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU"
      },
      outputFaceBlendshapes: false,
      runningMode: "VIDEO",
      numFaces: 1
    });
  } catch (err) {
    console.warn("Could not initialized real face tracking payload. Using mock fallback.", err);
  }
}

export function estimateHeadPose(videoElement: HTMLVideoElement, timestamp: number): HeadPose | null {
  if (!faceLandmarker) {
    // Mock simulation keeping perfect pose for offline/demo reliability
    return { pitch: 0, yaw: 0, roll: 0, x: 0.5, y: 0.5, scale: 1 };
  }
  
  const results = faceLandmarker.detectForVideo(videoElement, timestamp);
  if (results.faceLandmarks && results.faceLandmarks.length > 0) {
    const landmarks = results.faceLandmarks[0];
    
    // Very coarse approximation of pose based on landmark bounds
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    landmarks.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];

    // Simplified mock rotation estimation from 2D coordinates
    const yaw = (nose.x - ((leftEye.x + rightEye.x)/2)) * 100;
    const pitch = (nose.y - ((leftEye.y + rightEye.y)/2)) * 100;
    
    return {
      pitch,
      yaw,
      roll: 0, 
      x: nose.x,
      y: nose.y,
      scale: maxX - minX
    };
  }
  
  return null;
}

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import {
  estimateHeadPose,
  estimateGaze,
  getBlinkScore,
  getDetectionTelemetry,
  initFaceTracking,
  isFaceTrackingActive,
  shouldDropGazeForBlink,
  type HeadPose,
} from '@/services/faceTracking';
import {
  attachStream,
  discardFrontCameraRequest,
  getActiveCameraStream,
  requestFrontCameraStream,
  retainFrontCameraRequest,
  stopCameraStream,
} from '@/services/cameraStream';
import { requestMotionPermissionFromGesture, startMotionSensor, stopMotionSensor } from '@/services/motionSensor';
import { createAsyncOperationGate, guardedAwait } from '@/services/asyncOperation';
import { startVideoFrameLoop, type VideoFrameLoopHandle } from '@/services/videoFrameLoop';
import type { CaptureCalibrationCameraState } from '@/services/captureLifecycle';
import type { GazeSample } from '@/types';

// Camera/detection pipeline extracted from EyeTrackingTestScreen: owns the
// MediaStream, the per-frame detection loop (MediaPipe via faceTracking) and the
// fps/coverage/inference telemetry. Everything downstream of detection — stimulus
// rendering, capture sample accumulation, live UI snapshots — stays with the
// caller, fed through the onFrame callback. The hook knows nothing about recall,
// pre-test context, persistence or UI.

export type CameraPipelineState = CaptureCalibrationCameraState;

export interface CoverageEntry {
  t: number;
  face: boolean;
}

// FPS over the last second: mutates the rolling window in place (the caller keeps
// a single array alive across frames) and returns the frame count inside it.
export function updateFrameWindow(times: number[], ts: number, windowMs = 1000): number {
  times.push(ts);
  while (times.length && ts - times[0] > windowMs) times.shift();
  return times.length;
}

// Detection coverage over the last 2s: same in-place rolling window contract,
// returns the % of frames inside the window where a face was found.
export function updateCoverageWindow(entries: CoverageEntry[], ts: number, face: boolean, windowMs = 2000): number {
  entries.push({ t: ts, face });
  while (entries.length && ts - entries[0].t > windowMs) entries.shift();
  return entries.length ? (entries.filter(entry => entry.face).length / entries.length) * 100 : 0;
}

// Negotiated track frameRate (what the camera promised), or null when the track
// does not report a finite number.
export function readNegotiatedTrackFps(video: HTMLVideoElement): number | null {
  const negotiated = ((video.srcObject as MediaStream | null)?.getVideoTracks()[0])?.getSettings?.().frameRate;
  return typeof negotiated === 'number' && Number.isFinite(negotiated) ? negotiated : null;
}

export interface CameraPipelineFrame {
  ts: number;
  video: HTMLVideoElement;
  pose: HeadPose | null;
  gaze: GazeSample | null;
  faceFound: boolean;
  eyesFound: boolean;
  blinkScore: number | null;
  blinking: boolean;
  fps: number;        // frames processed in the last second
  coverage: number;   // % of recent frames (2s) with a face
  cameraFps: number | null;   // negotiated track frameRate
  inferenceMs: number | null; // EMA of the sync detectForVideo main-thread cost
  delegate: 'GPU' | 'CPU' | null;
}

export interface UseCameraPipelineOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  // While true (e.g. calibration overlay open) the frame loop is stopped; the
  // stream itself is left to the calibration flow. On resume the loop restarts
  // over the retained active stream.
  suspended: boolean;
  onFrame: (frame: CameraPipelineFrame) => void;
  // Extra per-frame gate evaluated before any detection runs (mirrors the
  // original inline check that skipped the whole frame when the canvas was gone).
  shouldProcessFrame?: () => boolean;
  // Fired whenever the frame loop (re)starts, after the fps/coverage windows reset.
  onLoopStart?: () => void;
  // Fired right after the motion sensor starts during camera startup.
  onMotionSensorStarted?: () => void;
  // Fired during teardown so the caller can reset its own frame-fed buffers/refs.
  onTeardown?: () => void;
}

export interface CameraPipelineHandle {
  cameraState: CameraPipelineState;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  streamRef: MutableRefObject<MediaStream | null>;
}

export function useCameraPipeline(options: UseCameraPipelineOptions): CameraPipelineHandle {
  const { videoRef, suspended } = options;

  const [cameraState, setCameraState] = useState<CameraPipelineState>('idle');

  const mountedRef = useRef(true);
  const startupGateRef = useRef(createAsyncOperationGate());
  const streamRef = useRef<MediaStream | null>(null);
  const frameLoopRef = useRef<VideoFrameLoopHandle | null>(null);
  const runningRef = useRef(false);
  const frameTimesRef = useRef<number[]>([]);
  const coverageWindowRef = useRef<CoverageEntry[]>([]);

  // Latest committed callbacks: the frame loop is created once per camera start,
  // so it reads these refs instead of a render-frozen closure.
  const onFrameRef = useRef(options.onFrame);
  const shouldProcessFrameRef = useRef(options.shouldProcessFrame);
  const onLoopStartRef = useRef(options.onLoopStart);
  const onMotionSensorStartedRef = useRef(options.onMotionSensorStarted);
  const onTeardownRef = useRef(options.onTeardown);
  useLayoutEffect(() => {
    onFrameRef.current = options.onFrame;
    shouldProcessFrameRef.current = options.shouldProcessFrame;
    onLoopStartRef.current = options.onLoopStart;
    onMotionSensorStartedRef.current = options.onMotionSensorStarted;
    onTeardownRef.current = options.onTeardown;
  });

  const loop = (ts: number) => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const shouldProcess = shouldProcessFrameRef.current;
    if (shouldProcess && !shouldProcess()) return;

    // One detection per frame; head pose, gaze and downstream feature extraction
    // (in the caller) share the faceTracking cache for this timestamp.
    const pose = estimateHeadPose(video, ts);
    const gaze = estimateGaze(video, ts, ts);
    const faceFound = pose !== null;
    const eyesFound = gaze !== null;
    // Blink-corrupted gaze is rejected, while coverage still counts the detected face.
    // Missing blendshape data remains fail-open so detection does not look dead.
    const blinkScore = getBlinkScore();
    const blinking = shouldDropGazeForBlink(blinkScore);

    const fps = updateFrameWindow(frameTimesRef.current, ts);
    const coverage = updateCoverageWindow(coverageWindowRef.current, ts, faceFound);
    const detectionTelemetry = getDetectionTelemetry();

    onFrameRef.current({
      ts,
      video,
      pose,
      gaze,
      faceFound,
      eyesFound,
      blinkScore,
      blinking,
      fps,
      coverage,
      cameraFps: readNegotiatedTrackFps(video),
      inferenceMs: detectionTelemetry.inferenceEmaMs,
      delegate: detectionTelemetry.delegate,
    });
  };

  const startFrameLoop = () => {
    runningRef.current = true;
    frameTimesRef.current = [];
    coverageWindowRef.current = [];
    onLoopStartRef.current?.();
    frameLoopRef.current?.stop();
    frameLoopRef.current = startVideoFrameLoop(videoRef.current!, loop);
  };

  const teardown = () => {
    runningRef.current = false;
    onTeardownRef.current?.();
    frameLoopRef.current?.stop();
    frameLoopRef.current = null;
    stopCameraStream();
    stopMotionSensor();
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const stopCamera = () => {
    teardown();
    if (!mountedRef.current) return;
    setCameraState('idle');
  };

  const startCamera = async () => {
    const gate = startupGateRef.current;
    const operation = gate.begin();
    setCameraState('starting');
    const motionPermission = await guardedAwait(
      gate,
      operation,
      requestMotionPermissionFromGesture(),
    );
    if (!motionPermission.current) return;
    if (motionPermission.value === 'granted') {
      startMotionSensor();
      if (!gate.isCurrent(operation)) {
        stopMotionSensor();
        return;
      }
      onMotionSensorStartedRef.current?.();
    }
    const faceTracking = await guardedAwait(gate, operation, initFaceTracking());
    if (!faceTracking.current) return;
    if (!isFaceTrackingActive()) {
      setCameraState('unavailable');
      return;
    }
    const cameraRequest = requestFrontCameraStream();
    let stream: MediaStream | null = null;
    const discardStartupStream = () => {
      if (!stream) return;
      discardFrontCameraRequest(cameraRequest, stream);
      if (streamRef.current === stream) streamRef.current = null;
      if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
    };
    try {
      stream = await cameraRequest.promise;
      if (!gate.isCurrent(operation)) {
        discardStartupStream();
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        await attachStream(videoRef.current, stream);
        if (!gate.isCurrent(operation)) {
          discardStartupStream();
          return;
        }
      }
    } catch {
      discardStartupStream();
      if (!gate.isCurrent(operation)) return;
      setCameraState('unavailable');
      return;
    }
    if (!gate.isCurrent(operation)) {
      discardStartupStream();
      return;
    }
    retainFrontCameraRequest(cameraRequest);
    setCameraState('running');
    startFrameLoop();
  };

  // Suspension (calibration overlay): stop only the loop; on resume, reattach the
  // retained active stream and restart the loop with fresh telemetry windows.
  useEffect(() => {
    if (suspended) {
      runningRef.current = false;
      frameLoopRef.current?.stop();
      frameLoopRef.current = null;
      return;
    }
    const stream = getActiveCameraStream();
    if (!stream) return;

    streamRef.current = stream;
    setCameraState('running');
    if (videoRef.current) {
      attachStream(videoRef.current, stream).catch(() => setCameraState('unavailable'));
    }
    if (!runningRef.current) {
      startFrameLoop();
    }
    // The frame loop and stream refs are stable; only suspension toggles matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspended]);

  useEffect(() => {
    mountedRef.current = true;
    startupGateRef.current.mount();
    return () => {
      mountedRef.current = false;
      startupGateRef.current.unmount();
      teardown();
    };
    // Mount/unmount lifecycle only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { cameraState, startCamera, stopCamera, streamRef };
}

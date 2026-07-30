import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { analyzeSaccades } from '@/exercises/saccadeAnalysis';
import {
  getPosturalBaseline,
  summarizePosturalStability,
  toPosturalSample,
  type PosturalSample,
} from '@/exercises/posturalStability';
import { getDetectionTelemetry, type HeadPose } from '@/services/faceTracking';
import { purgeLeadingBlinkSamples } from '@/services/blinkGate';
import { getMotionQuality } from '@/services/motionSensor';
import { readCameraPipelineTelemetry } from '@/services/cameraTelemetry';
import { cssPxPerDeg } from '@/services/viewingGeometry';
import { selectCaptureSeries, summarizeAxisSignal } from '@/services/validationCapture';
import {
  assessCaptureValidity,
  countTrackingGaps,
  pageInterruptionReason,
  type CaptureInterruptionReason,
} from '@/services/captureValidity';
import { persistValidationCapture, type CapturePersistenceStatus } from '@/services/capturePersistence';
import { createCaptureLifecycleLock } from '@/services/captureLifecycle';
import { saveValidationCapture } from '@/services/storage';
import type { CalibrationAssessment } from '@/services/calibrationValidity';
import type { CalibrationReuseDecision } from '@/services/ocularSignalContract';
import type {
  AssessedValidationCapture,
  CaptureEnvironment,
  GazeSample,
  PreTestContext,
  ValidationConditions,
} from '@/types';

// Capture lifecycle extracted from EyeTrackingTestScreen: owns the start/finish
// orchestration (lifecycle lock, safety cap, interruption listeners), the per-frame
// sample buffers, the capture record assembly and its persistence. Everything
// upstream stays with the caller: the start snapshot (canvas geometry, conditions,
// pre-test context) is built by the screen and handed in, per-frame samples arrive
// through pushFrameSample, and consumers (recall quiz, saved-captures list, frozen
// reading font) are fed through callbacks. The hook knows nothing about recall,
// pre-test context, reading text or UI.

// Safety ceiling only: the capture normally ends when the reader clicks
// "Terminei de ler", so the reading pace (not a fixed timer) sets the duration.
export const CAPTURE_SAFETY_CAP_MS = 120000;

export interface CaptureStartSnapshot {
  captureId: string;
  monotonicStart: number;
  wallClockTimestamp: number;
  conditions: ValidationConditions;
  context?: PreTestContext;
  calibrationAssessment: CalibrationAssessment | null;
  compatibility: CalibrationReuseDecision;
  environment: CaptureEnvironment;
}

export interface CaptureReportState {
  capture: AssessedValidationCapture;
  persistence: CapturePersistenceStatus;
}

// --- Pure per-frame decisions (unit-tested) ---

export type CaptureSampleTarget = 'calibrated' | 'raw' | null;

// Calibrated predictions and raw iris ratios use different units/gains, so each
// source accumulates in its own buffer; finishCapture analyzes the majority buffer
// only (selectCaptureSeries) — mixing them creates unit jumps the detector reads
// as fake saccades. Blinking frames feed neither buffer and never count as
// extrapolation rejections.
export function routeCaptureSample(input: {
  blinking: boolean;
  dotCalibrated: boolean;
  hasDot: boolean;
  hasGaze: boolean;
  dotExtrapolated: boolean;
}): { countExtrapolated: boolean; target: CaptureSampleTarget } {
  if (input.blinking) return { countExtrapolated: false, target: null };
  return {
    countExtrapolated: input.dotExtrapolated,
    target: input.dotCalibrated && input.hasDot ? 'calibrated' : input.hasGaze ? 'raw' : null,
  };
}

// End-of-frame decision while capturing: hit the safety cap → finish; otherwise
// refresh the elapsed readout only when the caller's shared UI throttle allows.
export function captureTickAction(
  tMs: number,
  elapsedUpdateDue: boolean,
  capMs: number = CAPTURE_SAFETY_CAP_MS,
): 'finish' | 'elapsed' | 'none' {
  if (tMs >= capMs) return 'finish';
  return elapsedUpdateDue ? 'elapsed' : 'none';
}

export function captureCoveragePct(faceFrames: number, totalFrames: number): number {
  return totalFrames ? (faceFrames / totalFrames) * 100 : 0;
}

// Borda de subida da piscada durante captura: as amostras dos últimos ~80ms
// entraram nos buffers com a íris parcialmente coberta. O buffer de traçado já
// recebia esta purga; os buffers que viram MEDIDA (spec P2) agora também.
export function purgeCaptureBuffersOnBlinkEdge(
  calSamples: GazeSample[],
  rawSamples: GazeSample[],
  nowMs: number,
): void {
  purgeLeadingBlinkSamples(calSamples, nowMs);
  purgeLeadingBlinkSamples(rawSamples, nowMs);
}

export function captureDeviceClassConfirmed(
  environment: Pick<CaptureEnvironment, 'deviceClassSource'>,
): boolean {
  return environment.deviceClassSource === 'confirmed';
}

// Geometric provenance: median of the live distance estimates (robust to blinks
// and brief tracking losses). Even-length input takes the upper middle, matching
// the original inline Math.floor(length / 2) indexing.
export function medianCaptureDistanceCm(samples: number[]): number | undefined {
  if (!samples.length) return undefined;
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export interface CaptureFrameInput {
  ts: number;
  faceFound: boolean;
  pose: HeadPose | null;
  gaze: GazeSample | null;
  blinking: boolean;
  // Borda de subida do gate de piscada neste frame (transição aceitar→rejeitar).
  blinkRising: boolean;
  // Gaze dot in surface-normalized coordinates (dot.x/cssW, dot.y/cssH), when drawn.
  dot: { h: number; v: number } | null;
  dotCalibrated: boolean;
  dotExtrapolated: boolean;
  // Real IPD-based estimate only (null otherwise): the profile fallback would fake
  // a measurement that never happened in the provenance median.
  distanceEstimateCm: number | null;
  // The caller's shared ~5/s UI throttle window (same one that gates the live
  // snapshot push), so the elapsed readout keeps its original cadence.
  elapsedUpdateDue: boolean;
}

export type CaptureFramePushResult = 'idle' | 'accumulated' | 'finished' | 'aborted';

export interface CaptureFinishedInfo {
  captureId: string;
  durationMs: number;
  interruption: CaptureInterruptionReason | null;
}

export interface UseCaptureLifecycleOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  // Live detection fps at finish time (feeds the measured-rates provenance).
  getDetectionFps: () => number;
  // Fired synchronously as soon as the capture lock releases (before the report is
  // built), so the caller can unfreeze capture-locked stimulus state (e.g. font).
  onCaptureRelease?: () => void;
  // Fired at the very end of finishCapture, after the report is published and
  // persistence kicked off. Fires for interrupted captures too (interruption set).
  onCaptureFinished?: (info: CaptureFinishedInfo) => void;
  // Fired (while mounted) when a capture persists successfully, so the caller can
  // append it to its saved-captures list.
  onCapturePersisted?: (capture: AssessedValidationCapture) => void;
}

export interface CaptureLifecycleHandle {
  capturing: boolean;
  capturingRef: MutableRefObject<boolean>;
  captureElapsed: number;
  captureResult: CaptureReportState | null;
  clearCaptureResult: () => void;
  // Returns false when another capture already owns the lifecycle lock.
  startCapture: (snapshot: CaptureStartSnapshot) => boolean;
  finishCapture: (interruption?: CaptureInterruptionReason | null) => void;
  retryCapturePersistence: () => void;
  pushFrameSample: (input: CaptureFrameInput) => CaptureFramePushResult;
  // Camera teardown residue: drop the in-flight capture flags without touching the
  // lock (the caller finishes the capture before tearing the camera down).
  handleCameraTeardown: () => void;
}

// NOTE: callers must invoke this hook BEFORE useCameraPipeline so that on unmount
// this hook's cleanup (finish the in-flight capture) runs before the pipeline
// teardown — the same declaration order the inline code relied on.
export function useCaptureLifecycle(options: UseCaptureLifecycleOptions): CaptureLifecycleHandle {
  const { videoRef } = options;

  const [capturing, setCapturing] = useState(false);
  const [captureElapsed, setCaptureElapsed] = useState(0);
  const [captureResult, setCaptureResult] = useState<CaptureReportState | null>(null);

  const mountedRef = useRef(true);
  const capturingRef = useRef(false);
  const captureStartSnapshotRef = useRef<CaptureStartSnapshot | null>(null);
  const finishCaptureRef = useRef<(interruption?: CaptureInterruptionReason | null) => void>(() => {});
  const captureLifecycleRef = useRef(createCaptureLifecycleLock());
  const captureOwnerRef = useRef<number | null>(null);
  const persistenceInFlightRef = useRef<Set<string>>(new Set());
  const captureCalSamplesRef = useRef<GazeSample[]>([]);
  const captureRawSamplesRef = useRef<GazeSample[]>([]);
  // Frames whose calibrated prediction was rejected for extrapolation (clamped
  // outside [0,1]); provenance for how often the model left its fitted region.
  const captureExtrapolatedRef = useRef(0);
  const captureFaceRef = useRef(0);
  const captureTotalRef = useRef(0);
  const posturalSamplesRef = useRef<PosturalSample[]>([]);
  const captureShakeRef = useRef(false);
  // Per-frame IPD-based distance estimates gathered during the capture; their median
  // becomes the capture's geometric provenance (distanceEstimatedCm).
  const captureDistanceSamplesRef = useRef<number[]>([]);

  // Latest committed callbacks: DOM listeners and the frame path read these refs
  // instead of a render-frozen closure.
  const getDetectionFpsRef = useRef(options.getDetectionFps);
  const onCaptureReleaseRef = useRef(options.onCaptureRelease);
  const onCaptureFinishedRef = useRef(options.onCaptureFinished);
  const onCapturePersistedRef = useRef(options.onCapturePersisted);
  useLayoutEffect(() => {
    getDetectionFpsRef.current = options.getDetectionFps;
    onCaptureReleaseRef.current = options.onCaptureRelease;
    onCaptureFinishedRef.current = options.onCaptureFinished;
    onCapturePersistedRef.current = options.onCapturePersisted;
  });

  const startCapture = (startSnapshot: CaptureStartSnapshot): boolean => {
    const captureOwner = captureLifecycleRef.current.begin();
    if (captureOwner === null) return false;
    captureStartSnapshotRef.current = startSnapshot;
    captureOwnerRef.current = captureOwner;
    capturingRef.current = true;
    captureCalSamplesRef.current = [];
    captureRawSamplesRef.current = [];
    captureExtrapolatedRef.current = 0;
    captureFaceRef.current = 0;
    captureTotalRef.current = 0;
    posturalSamplesRef.current = [];
    captureShakeRef.current = false;
    captureDistanceSamplesRef.current = [];
    setCaptureResult(null);
    setCaptureElapsed(0);
    setCapturing(true);
    return true;
  };

  const persistCaptureAndPublish = async (capture: AssessedValidationCapture) => {
    if (persistenceInFlightRef.current.has(capture.id)) return;
    persistenceInFlightRef.current.add(capture.id);
    try {
      const result = await persistValidationCapture(capture, saveValidationCapture);
      if (mountedRef.current) {
        setCaptureResult(previous => (
          previous?.capture === capture ? result : previous
        ));
        if (result.persistence === 'saved') {
          onCapturePersistedRef.current?.(capture);
        }
      }
    } finally {
      persistenceInFlightRef.current.delete(capture.id);
    }
  };

  const finishCapture = (interruption: CaptureInterruptionReason | null = null) => {
    const captureOwner = captureOwnerRef.current;
    if (
      captureOwner === null
      || !captureLifecycleRef.current.finish(captureOwner)
    ) return;
    // The synchronous lock is deliberately first: pagehide + visibilitychange can
    // arrive back-to-back, and only the first event may own this immutable record.
    captureOwnerRef.current = null;
    capturingRef.current = false;
    // Let the caller release capture-frozen stimulus state (the locked font) at the
    // same synchronous point the inline code cleared it.
    onCaptureReleaseRef.current?.();
    if (mountedRef.current) setCapturing(false);
    const startSnapshot = captureStartSnapshotRef.current;
    captureStartSnapshotRef.current = null;
    if (!startSnapshot) return;

    // Copy every mutable buffer before analysis or async persistence begins.
    const calibratedSamples = captureCalSamplesRef.current.slice();
    const rawSamples = captureRawSamplesRef.current.slice();
    const posturalSamples = posturalSamplesRef.current.slice();
    const distanceSamples = captureDistanceSamplesRef.current.slice();
    const extrapolatedSampleCount = captureExtrapolatedRef.current;
    const faceFrames = captureFaceRef.current;
    const totalFrames = captureTotalRef.current;
    const motionHighMovement = captureShakeRef.current;

    const durationMs = Math.max(0, performance.now() - startSnapshot.monotonicStart);
    const series = selectCaptureSeries(calibratedSamples, rawSamples);
    // Computed before analysis (not after, as before) so the SAME geometry instance
    // feeds both the analyzer's angular threshold and the persisted capture fields
    // below — otherwise the two independent computations could silently drift
    // (e.g. a distance sample landing differently) and the persisted
    // pxPerDegAtCapture would no longer describe the metrics it sits next to.
    const distanceEstimatedCm = medianCaptureDistanceCm(distanceSamples);
    const pxPerDegAtCapture = cssPxPerDeg(distanceEstimatedCm ?? startSnapshot.conditions.distanceCm);
    const canvasWidthPx = startSnapshot.environment.surfaceRect.width;
    const metrics = analyzeSaccades(series.samples, {
      signalSource: series.signalSource,
      geometry: { pxPerDegAtCapture, canvasWidthPx },
    });
    const detectionTelemetry = getDetectionTelemetry();
    const measuredRates = readCameraPipelineTelemetry(videoRef.current, {
      detectionFps: getDetectionFpsRef.current(),
      ocularSampleRateHz: metrics.sampleRateHz,
      inferenceEmaMs: detectionTelemetry.inferenceEmaMs ?? undefined,
      delegate: detectionTelemetry.delegate ?? undefined,
    }).measured;
    const environment: CaptureEnvironment = {
      ...startSnapshot.environment,
      viewport: { ...startSnapshot.environment.viewport },
      surfaceRect: { ...startSnapshot.environment.surfaceRect },
      video: { ...startSnapshot.environment.video },
      camera: { ...startSnapshot.environment.camera },
      rates: measuredRates,
    };
    const coverage = captureCoveragePct(faceFrames, totalFrames);
    const finalMotionQuality = getMotionQuality();
    const postural = summarizePosturalStability(posturalSamples, {
      baseline: getPosturalBaseline(),
      motionHighMovement,
      motionStatus: finalMotionQuality.status,
      motionDeltaDeg: finalMotionQuality.deltaDeg,
      motionConfidence: finalMotionQuality.confidence,
      durationMs,
      faceCoverage: coverage,
    });

    // Persist the tagged capture so PACK 1 thresholds can be calibrated on real data.
    const samples = series.samples.slice();
    const validity = assessCaptureValidity({
      assessedAt: Date.now(),
      durationMs,
      coverage,
      signalSource: series.signalSource,
      selectedSourceRatio: series.selectedSourceRatio,
      sampleRateHz: metrics.sampleRateHz,
      calibrationAccepted: startSnapshot.calibrationAssessment?.accepted === true,
      calibrationCompatible: startSnapshot.compatibility.reusable,
      deviceClassConfirmed: captureDeviceClassConfirmed(environment),
      gapCount: countTrackingGaps(samples),
      interruption,
    });
    const capture = {
      id: startSnapshot.captureId,
      timestamp: startSnapshot.wallClockTimestamp,
      durationMs,
      conditions: startSnapshot.conditions,
      context: startSnapshot.context,
      coverage,
      calibrated: series.signalSource === 'calibrated-mediapipe',
      metrics,
      postural,
      axis: summarizeAxisSignal(samples),
      environment,
      calibrationAssessment: startSnapshot.calibrationAssessment ?? undefined,
      validity,
      sampleCount: samples.length,
      samples,
      distanceEstimatedCm,
      pxPerDegAtCapture,
      canvasWidthPx,
      orientation: environment.viewport.orientation,
      calibratedSampleCount: series.calibratedSampleCount,
      rawSampleCount: series.rawSampleCount,
      extrapolatedSampleCount,
    } satisfies AssessedValidationCapture;
    // Report first, persist second. A slow/failing IndexedDB can never hide evidence.
    if (mountedRef.current) setCaptureResult({ capture, persistence: 'saving' });
    void persistCaptureAndPublish(capture);

    onCaptureFinishedRef.current?.({
      captureId: capture.id,
      durationMs,
      interruption,
    });
  };

  const retryCapturePersistence = () => {
    const report = captureResult;
    if (!report || report.persistence !== 'failed') return;
    const capture = report.capture;
    setCaptureResult({ capture, persistence: 'saving' });
    void persistCaptureAndPublish(capture);
  };

  const pushFrameSample = (input: CaptureFrameInput): CaptureFramePushResult => {
    if (!capturingRef.current) return 'idle';
    const captureStart = captureStartSnapshotRef.current;
    if (!captureStart) {
      // Defensive: capturing flagged without a start snapshot — drop the capture
      // and abort the caller's frame (mirrors the original inline early return).
      capturingRef.current = false;
      setCapturing(false);
      return 'aborted';
    }
    const tMs = input.ts - captureStart.monotonicStart;
    captureTotalRef.current += 1;
    if (input.faceFound) captureFaceRef.current += 1;
    if (input.pose) posturalSamplesRef.current.push(toPosturalSample(input.pose));
    if (getMotionQuality().status === 'shaking') captureShakeRef.current = true;
    if (input.distanceEstimateCm != null) {
      captureDistanceSamplesRef.current.push(input.distanceEstimateCm);
    }
    if (input.blinkRising) {
      // Buffers guardam t relativo ao início da captura — a janela da purga
      // precisa do mesmo relógio (tMs), não do ts absoluto do pipeline.
      purgeCaptureBuffersOnBlinkEdge(captureCalSamplesRef.current, captureRawSamplesRef.current, tMs);
    }
    const routing = routeCaptureSample({
      blinking: input.blinking,
      dotCalibrated: input.dotCalibrated,
      hasDot: input.dot !== null,
      hasGaze: input.gaze !== null,
      dotExtrapolated: input.dotExtrapolated,
    });
    if (routing.countExtrapolated) captureExtrapolatedRef.current += 1;
    if (routing.target === 'calibrated' && input.dot) {
      captureCalSamplesRef.current.push({ t: tMs, h: input.dot.h, v: input.dot.v });
    } else if (routing.target === 'raw' && input.gaze) {
      captureRawSamplesRef.current.push({ t: tMs, h: input.gaze.h, v: input.gaze.v });
    }
    const tick = captureTickAction(tMs, input.elapsedUpdateDue);
    if (tick === 'finish') {
      finishCapture();
      return 'finished';
    }
    if (tick === 'elapsed') setCaptureElapsed(tMs);
    return 'accumulated';
  };

  const handleCameraTeardown = () => {
    capturingRef.current = false;
    captureStartSnapshotRef.current = null;
  };

  // Publish the latest committed callback after render. The DOM listeners below
  // remain registered once, while their ref never observes an uncommitted closure.
  useLayoutEffect(() => {
    finishCaptureRef.current = finishCapture;
  });

  useEffect(() => {
    const onVisibility = () => {
      const reason = pageInterruptionReason('visibilitychange', document.visibilityState);
      if (reason) finishCaptureRef.current(reason);
    };
    const onPageHide = () => finishCaptureRef.current('pagehide-during-capture');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  // Finish any in-flight capture on unmount. This effect's cleanup must run before
  // the camera pipeline teardown — hence the call-order note in the hook docstring.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (capturingRef.current) {
        finishCaptureRef.current('navigation-during-capture');
      }
    };
    // Mount/unmount lifecycle only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    capturing,
    capturingRef,
    captureElapsed,
    captureResult,
    clearCaptureResult: () => setCaptureResult(null),
    startCapture,
    finishCapture,
    retryCapturePersistence,
    pushFrameSample,
    handleCameraTeardown,
  };
}

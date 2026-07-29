import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Check, Play, RotateCcw, Crosshair, Trash2, Database } from 'lucide-react';
import { AssessmentResultPanel } from '@/components/assessment/AssessmentResultPanel';
import { AssessmentSessionSurface, SESSION_TITLES } from '@/components/assessment/AssessmentSessionSurface';
import { PhonePortraitGate } from '@/components/assessment/PhonePortraitGate';
import { useAppStore } from '@/store/useAppStore';
import { extractGazeFeatures, getLastLandmarks } from '@/services/faceTracking';
import { emaAlpha, RAW_V_EMA_TAU_MS, DISTANCE_EMA_TAU_MS } from '@/services/emaTiming';
import { createStimulusDistanceTracker } from '@/services/stimulusDistance';
import { purgeLeadingBlinkSamples } from '@/services/blinkGate';
import {
  interpupillaryPx, estimateDistanceCm, getDistanceAnchor, readingFontCssPx, readingFontAngleDeg,
  distanceWithinAnchorTolerance,
} from '@/services/viewingGeometry';
import { isCalibrated, predictNorm, getAccuracyDeg, getCalibrationSignature, getCalibrationAssessment } from '@/services/gazeCalibration';
import { getMotionQuality, type MotionQuality } from '@/services/motionSensor';
import { CalibrationOverlay } from '@/components/CalibrationOverlay';
import { CaptureValiditySummary } from '@/components/CaptureValiditySummary';
import { DiagnosticsDrawer } from '@/components/DiagnosticsDrawer';
import { DiagnosticsAccordion, type DiagnosticsSection } from '@/components/DiagnosticsAccordion';
import { ExposureControlCard } from '@/components/ExposureControlCard';
import type { DrawerVariant } from '@/services/diagnosticsDrawerLayout';
import { summarizeReadingDynamics } from '@/exercises/readingDynamics';
import { resetPosturalBaseline } from '@/exercises/posturalStability';
import { CaptureEnvironment, SaccadeMetrics, ValidationCapture, ValidationConditions, ValidationLighting, ValidationPosture } from '@/types';
import { getValidationCaptures, deleteValidationCapture } from '@/services/storage';
import { PreContextForm } from '@/components/QuickContextForm';
import { RecallQuiz } from '@/components/RecallQuiz';
import { serializeValidationExport } from '@/services/validationCapture';
import { summarizeSaccadeSignalQuality } from '@/services/signalQuality';
import type { CaptureInterruptionReason } from '@/services/captureValidity';
import { cameraStopInterruptionReason, canBeginCaptureCalibration } from '@/services/captureLifecycle';
import {
  summarizeFunctionalVisualSignal,
  type FunctionalVisualSignalSummary,
  type VisualSignalSample,
} from '@/services/visualSignal';
import { getReadingContent } from '@/services/contentGenerator';
import { diagnosticsLayoutMode } from '@/services/deviceProfile';
import { computeDiagnosticsSurface } from '@/services/captureGeometry';
import { useMeasuredSurface } from '@/hooks/useMeasuredSurface';
import { useModalDialog } from '@/hooks/useModalDialog';
import { useCameraPipeline, type CameraPipelineFrame } from '@/hooks/useCameraPipeline';
import { useCaptureLifecycle, type CaptureStartSnapshot } from '@/hooks/useCaptureLifecycle';
import { usePreTestContext } from '@/hooks/usePreTestContext';
import { useRecallFlow, type ReadingTextState } from '@/hooks/useRecallFlow';
import { readCameraPipelineTelemetry } from '@/services/cameraTelemetry';
import { formatSampleRateHz } from '@/services/sampleRatePresentation';
import {
  calibrationSignatureMatches,
  calibrationReuseDecision,
  currentOrientation,
  rectFromElement,
  viewportNormToRectPoint,
  type SurfaceRect,
} from '@/services/ocularSignalContract';
import { buildAssessmentWorkspaceSnapshot } from '@/services/assessmentAdapter';
import { resolveDeviceClass } from '@/services/deviceClass';
import { requiresPhonePortrait } from '@/services/measurementViewport';
import { backendFailureMessage, networkBackendFailure } from '@/services/apiFailure';
import { hasUnsavedAssessmentResult } from '@/services/assessmentSessionController';
import {
  assessmentSessionStatus,
  initialAssessmentSessionState,
  transitionAssessmentSession,
} from '@/services/assessmentSessionController';
import {
  sessionGeometryInterruption,
  type SessionGeometry,
} from '@/services/sessionGeometry';

// Standalone diagnostics screen: shows reading text, runs the front camera and
// overlays a live gaze dot + detection status so we can validate that the eyes are
// actually being detected/tracked on the target device (iPhone Pro Max, landscape)
// before relying on the signal inside the exercises.

// Target for the generated reading passage: enough words to sustain ~20s of
// continuous reading (the old fixed 30-50 words ran out in ~10s).
const READING_TARGET_DURATION_SEC = 20;

// Opções de condição compartilhadas entre os botões do card e o resumo do acordeão.
const LIGHTING_OPTIONS: [ValidationLighting, string][] = [['dim', 'Fraca'], ['normal', 'Normal'], ['bright', 'Forte']];
const POSTURE_OPTIONS: [ValidationPosture, string][] = [['upright', 'Reta'], ['tilted', 'Inclinada'], ['slouched', 'Curvada'], ['reclined', 'Recostada']];
const optionLabel = <T extends string>(options: [T, string][], value: T) =>
  options.find(([v]) => v === value)?.[1] ?? value;

// Touch capability selects the compact diagnostics shell. Measurement orientation
// is decided separately so phone portrait does not alter tablet/desktop behavior.
const HAS_TOUCH_INPUT = typeof navigator !== 'undefined'
  && (navigator.maxTouchPoints > 0 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));

interface LiveSnapshot {
  faceFound: boolean;
  eyesFound: boolean;
  h: number | null;
  v: number | null;
  yaw: number | null;
  pitch: number | null;
  roll: number | null;
  fps: number;
  coverage: number; // % of recent frames with a face
  cameraFps: number | null;   // negotiated track frameRate (what the camera promised)
  inferenceMs: number | null; // EMA of the sync detectForVideo main-thread cost
  delegate: 'GPU' | 'CPU' | null;
  blinkScore: number | null;  // live max(eyeBlinkLeft, eyeBlinkRight)
}

const EMPTY_LIVE: LiveSnapshot = {
  faceFound: false, eyesFound: false, h: null, v: null,
  yaw: null, pitch: null, roll: null, fps: 0, coverage: 0,
  cameraFps: null, inferenceMs: null, delegate: null, blinkScore: null,
};
const EMPTY_VISUAL_SIGNAL = summarizeFunctionalVisualSignal([]);

interface EyeTrackingTestScreenProps {
  embedded?: boolean;
  initialMode?: 'capture' | 'recall';
  initialExploratory?: boolean;
  onExit?: () => void;
}

export function EyeTrackingTestScreen({
  embedded = false,
  initialMode = 'capture',
  initialExploratory = false,
  onExit,
}: EyeTrackingTestScreenProps) {
  const navigate = useNavigate();
  const { profile } = useAppStore();
  const isDark = profile?.contrastPreference === 'dark';

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeSessionGeometryRef = useRef<SessionGeometry | null>(null);
  const mountedRef = useRef(true);
  const { ref: surfaceHostRef, surface: measuredHost } = useMeasuredSurface<HTMLDivElement>();

  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 768
  );
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= window.innerHeight : true
  );
  const [showCalibration, setShowCalibration] = useState(false);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [live, setLive] = useState<LiveSnapshot>(EMPTY_LIVE);
  const [text, setText] = useState('Carregando texto de leitura…');
  const [readingTextState, setReadingTextState] = useState<ReadingTextState>('loading');
  const [readingFailure, setReadingFailure] = useState<string | null>(null);
  const [showUnsavedExit, setShowUnsavedExit] = useState(false);
  const [sessionState, dispatchSession] = useReducer(
    transitionAssessmentSession,
    initialMode,
    initialAssessmentSessionState,
  );
  const sessionStatus = assessmentSessionStatus(sessionState);

  useEffect(() => {
    dispatchSession({ type: 'BEGIN' });
    if (initialExploratory) {
      dispatchSession({
        type: 'READINESS_FAILED',
        reason: 'Sessão iniciada como baseline exploratório.',
        canRunExploratory: true,
      });
      dispatchSession({ type: 'RUN_EXPLORATORY' });
    }
  // Route entry owns the initial transition; the live screen remounts for a new run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [motionQuality, setMotionQuality] = useState<MotionQuality>(() => getMotionQuality());
  const [liveSignal, setLiveSignal] = useState<FunctionalVisualSignalSummary>(EMPTY_VISUAL_SIGNAL);
  const [conditions, setConditions] = useState<ValidationConditions>({
    lighting: 'normal',
    distanceCm: profile?.viewingDistanceCm ?? 40,
    posture: 'upright',
  });
  const [captures, setCaptures] = useState<ValidationCapture[]>([]);
  const [showCaptures, setShowCaptures] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  // Quick pre-test context: asked once per session (prefilled from today's first
  // test), tagged onto every capture saved afterwards. Unlike the exercise player
  // this screen never blocks — it's instrument validation, the context is provenance.
  // Adoption, draft, form visibility and the session skip live in the hook; the
  // screen keeps the form JSX and asks shouldOpenContextForm() at capture start.
  const {
    contextDraft,
    setContextDraft,
    contextFormOpen,
    shouldOpenContextForm,
    adoptContextDraft,
    skipContextForNow,
    closeContextForm,
    getPreTestContext,
  } = usePreTestContext({
    // Resume the capture the form interrupted (adopt or skip); startCapture is
    // declared below, called only from user events after render.
    onResume: () => startCapture(),
  });

  // --- Leitura + Recall mode ---
  // Mode, recall passage, post-capture quiz and its persistence live in the hook;
  // the screen keeps the displayed text (setText/readingTextState) and feeds the
  // flow through the callbacks below. isCapturing reads capturingRef lazily —
  // the lifecycle hook is declared right after (same pattern as getDetectionFps).
  const {
    testMode,
    recallContent,
    recallQuiz,
    recallGenState,
    recallFailure,
    recallOutcome,
    recallPersistence,
    pendingRecallResult,
    switchMode,
    registerShortText,
    noteCaptureFinished,
    handleQuizDone,
    retryRecallText,
    retryRecallQuestions,
    retryRecallPersistence,
    dismissRecallError,
    clearRecallOutcome,
  } = useRecallFlow({
    initialMode,
    isCapturing: () => capturingRef.current,
    getPreTestContext,
    onReadingTextChange: (nextText, state) => {
      setText(nextText);
      setReadingTextState(state);
    },
  });

  // Capture lifecycle (lock, buffers, safety cap, persistence) lives in the hook;
  // the screen keeps the start-snapshot provenance and every consumer (recall quiz,
  // saved list, frozen font). Called before useCameraPipeline so its unmount
  // cleanup (finish the in-flight capture) runs before the pipeline teardown —
  // same order as the old inline effects.
  const {
    capturing,
    capturingRef,
    captureElapsed,
    captureResult,
    clearCaptureResult,
    startCapture: startCaptureLifecycle,
    finishCapture,
    retryCapturePersistence,
    pushFrameSample,
    handleCameraTeardown,
  } = useCaptureLifecycle({
    videoRef,
    getDetectionFps: () => liveRef.current.fps,
    // Unfreeze the capture-locked reading font as soon as the capture lock releases.
    onCaptureRelease: () => {
      frozenFontPxRef.current = null;
      activeSessionGeometryRef.current = null;
    },
    // Recall mode reaction (capture link + quiz generation) lives in useRecallFlow.
    onCaptureFinished: info => {
      noteCaptureFinished(info);
      dispatchSession(info.interruption
        ? { type: 'INTERRUPTED', reason: info.interruption }
        : { type: 'CAPTURE_FINISHED', withRecall: testMode === 'recall' });
    },
    onCapturePersisted: capture => {
      setCaptures(previous => (
        previous.some(item => item.id === capture.id) ? previous : [capture, ...previous]
      ));
    },
  });

  const hasUnsavedResult = hasUnsavedAssessmentResult(
    captureResult?.persistence ?? null,
    recallPersistence,
  );
  const closeResult = () => {
    clearCaptureResult();
    clearRecallOutcome();
    setShowUnsavedExit(false);
    dispatchSession({ type: 'RESET', mode: testMode });
    dispatchSession({ type: 'BEGIN' });
    if (initialExploratory) {
      dispatchSession({
        type: 'READINESS_FAILED',
        reason: 'Sessão iniciada como baseline exploratório.',
        canRunExploratory: true,
      });
      dispatchSession({ type: 'RUN_EXPLORATORY' });
    }
  };
  const requestResultClose = () => {
    if (hasUnsavedResult) {
      setShowUnsavedExit(true);
      return;
    }
    closeResult();
  };

  const [calibrationSurfaceRect, setCalibrationSurfaceRect] = useState<SurfaceRect | null>(null);
  const contextDialogRef = useModalDialog({
    open: contextFormOpen,
    onEscape: closeContextForm,
  });
  const recallErrorDialogRef = useModalDialog({
    open: recallGenState === 'error',
    onEscape: dismissRecallError,
  });
  const recallQuizDialogRef = useModalDialog({
    open: recallQuiz !== null && recallContent !== null,
  });
  const captureReportDialogRef = useModalDialog({
    open: captureResult !== null && recallQuiz === null && recallGenState === 'idle',
    onEscape: requestResultClose,
  });
  const unsavedExitDialogRef = useModalDialog({
    open: showUnsavedExit,
    onEscape: () => setShowUnsavedExit(false),
  });
  const capturesDialogRef = useModalDialog({
    open: showCaptures,
    onEscape: () => { setShowCaptures(false); setExportNote(null); },
  });

  // Loop-local mutable state (refs so the frame callback stays allocation-friendly).
  const liveRef = useRef<LiveSnapshot>(EMPTY_LIVE);
  const lastLivePushRef = useRef(0);
  const visualSignalSamplesRef = useRef<VisualSignalSample[]>([]);
  const rawVEmaRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);
  const screenDistanceTrackerRef = useRef<ReturnType<typeof createStimulusDistanceTracker> | null>(null);
  const textRef = useRef(text);
  const layoutRef = useRef<{ w: number; h: number; font: number; lines: string[] } | null>(null);
  // Reading font is sized by visual angle: target angle (from preference) + the live
  // distance estimate. distanceRef is an EMA so the text doesn't "breathe" frame to frame.
  const fontAngleRef = useRef(readingFontAngleDeg(profile?.fontSizePreference || 'normal'));
  const profileDistanceRef = useRef(profile?.viewingDistanceCm ?? 40);
  const distanceRef = useRef(profile?.viewingDistanceCm ?? 40);
  // Font size locked at capture start. Letting the distance-adaptive font change
  // mid-capture would re-wrap the text and silently change what the h/v samples
  // mean; the stimulus geometry must be frozen for the whole measurement window.
  const frozenFontPxRef = useRef<number | null>(null);
  useEffect(() => { textRef.current = text; layoutRef.current = null; }, [text]);

  useEffect(() => {
    if (!hasUnsavedResult) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [hasUnsavedResult]);

  useEffect(() => {
    const updateViewport = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
      setIsLandscape(window.innerWidth >= window.innerHeight);
      layoutRef.current = null;
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  const loadShortReadingContent = () => {
    setReadingTextState('loading');
    setReadingFailure(null);
    void getReadingContent('facil', READING_TARGET_DURATION_SEC)
      .then(generatedText => registerShortText(generatedText.trim()))
      .catch(error => {
        const message = backendFailureMessage(networkBackendFailure(error));
        setReadingTextState('error');
        setReadingFailure(message);
        setText(message);
      });
  };

  // Load reading content once. The generated short text is registered with the
  // recall flow, which restores it as the displayed text while in 'capture' mode.
  useEffect(() => {
    loadShortReadingContent();
  // registerShortText is intentionally not a dependency; this load runs once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load saved validation captures once.
  useEffect(() => {
    getValidationCaptures()
      .then(saved => { if (mountedRef.current) setCaptures(saved); })
      .catch(() => {/* empty list */});
  }, []);

  // Keep the capture distance in sync with the profile once it hydrates.
  useEffect(() => {
    if (profile?.viewingDistanceCm != null) {
      setConditions(prev => ({ ...prev, distanceCm: profile.viewingDistanceCm! }));
      profileDistanceRef.current = profile.viewingDistanceCm;
    }
  }, [profile?.viewingDistanceCm]);

  // Reading preference → target visual angle; re-wrap the text on change.
  useEffect(() => {
    fontAngleRef.current = readingFontAngleDeg(profile?.fontSizePreference || 'normal');
    layoutRef.current = null;
  }, [profile?.fontSizePreference]);

  // Wrap the paragraph into lines that fit the canvas width.
  const computeLines = (ctx: CanvasRenderingContext2D, content: string, maxWidth: number): string[] => {
    const words = content.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const trial = current ? `${current} ${w}` : w;
      if (ctx.measureText(trial).width > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = trial;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // Screen-side residue of the camera teardown: capture bookkeeping and the
  // frame-fed buffers the pipeline hook does not own. Invoked by the hook while
  // it tears the stream/loop down, so the combined sequence matches the old
  // inline teardownCameraResources().
  const handlePipelineTeardown = () => {
    handleCameraTeardown();
    frozenFontPxRef.current = null;
    resetPosturalBaseline();
    liveRef.current = EMPTY_LIVE;
    visualSignalSamplesRef.current = [];
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setMotionQuality(getMotionQuality()), 250);
    return () => window.clearInterval(id);
  }, []);

  const handleFrame = (frame: CameraPipelineFrame) => {
    const { ts, video, pose, gaze, faceFound, eyesFound, blinking, blinkRising } = frame;
    const canvas = canvasRef.current;
    const dtMs = lastFrameTsRef.current != null ? ts - lastFrameTsRef.current : null;
    lastFrameTsRef.current = ts;
    // Borda de subida da piscada: as amostras dos últimos ~80ms já entraram no traçado
    // com a íris parcialmente coberta (score ainda abaixo do enter threshold) — remover.
    // O gate do pipeline é o dono da informação de borda (wasRisingEdge → frame).
    if (blinkRising) {
      purgeLeadingBlinkSamples(visualSignalSamplesRef.current, ts);
    }

    if (canvas) {
      // Distance from IPD (detect already ran in the pipeline hook) → font sized by
      // visual angle so the apparent text size is stable as the user leans in/out
      // and across devices.
      const anchor = getDistanceAnchor();
      const ipdPx = interpupillaryPx(getLastLandmarks(), video.videoWidth || 1280, video.videoHeight || 720);
      const dEst = estimateDistanceCm(ipdPx, anchor, profileDistanceRef.current);
      const distAlpha = dtMs == null ? 1 : emaAlpha(dtMs, DISTANCE_EMA_TAU_MS);
      distanceRef.current = distanceRef.current + (dEst - distanceRef.current) * distAlpha;
      // Calibrated gaze is only trusted while the user stays near the distance the
      // model was calibrated at; outside the tolerance the mapping is extrapolating.
      const distanceOk = distanceWithinAnchorTolerance(distanceRef.current, anchor?.distanceCm ?? null);
      // Fonte estável: mede a distância, congela após convergir e não segue mais a
      // detecção — texto que "respira" com o tracking é inutilizável para leitura.
      // O EMA ao vivo (distanceRef) segue existindo só para o check de tolerância.
      if (!screenDistanceTrackerRef.current) {
        screenDistanceTrackerRef.current = createStimulusDistanceTracker({
          profileDistanceCm: profileDistanceRef.current,
          emaTauMs: DISTANCE_EMA_TAU_MS,
        });
      }
      const stimulusSnap = screenDistanceTrackerRef.current.update(ipdPx != null && anchor ? dEst : null, ts);
      const fontPx = capturingRef.current && frozenFontPxRef.current != null
        ? frozenFontPxRef.current
        : Math.round(readingFontCssPx(fontAngleRef.current, stimulusSnap.distanceCm));

      const coverage = frame.coverage;

      // Resize backing store for crisp text on high-DPR screens (iPhone ≈ 3).
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        layoutRef.current = null;
      }
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px

      // Background + reading text.
      ctx.fillStyle = isDark ? '#0f172a' : '#f8fafc';
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.font = `${fontPx}px Inter, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      const margin = Math.max(24, cssW * 0.06);
      const maxWidth = cssW - margin * 2;
      if (!layoutRef.current || layoutRef.current.w !== cssW || layoutRef.current.h !== cssH || layoutRef.current.font !== fontPx) {
        layoutRef.current = { w: cssW, h: cssH, font: fontPx, lines: computeLines(ctx, textRef.current, maxWidth) };
      }
      const lineHeight = fontPx * 1.6;
      const totalTextH = layoutRef.current.lines.length * lineHeight;
      let y = Math.max(margin, (cssH - totalTextH) / 2);
      ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
      for (const line of layoutRef.current.lines) {
        ctx.fillText(line, margin, y);
        y += lineHeight;
      }

      // Gaze dot: calibrated (blue) when available, else raw direction (amber).
      const calibrated = isCalibrated();
      let dot: { x: number; y: number } | null = null;
      let dotCalibrated = false;
      let dotExtrapolated = false;
      if (calibrated) {
        const feat = extractGazeFeatures(video, ts);
        const norm = feat ? predictNorm(feat) : null;
        if (norm) {
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const trackSettings = ((video.srcObject as MediaStream | null)?.getVideoTracks()[0])?.getSettings?.();
          const signature = getCalibrationSignature();
              const signatureStatus = calibrationSignatureMatches(signature, {
                viewportWidth,
                viewportHeight,
                orientation: currentOrientation(viewportWidth, viewportHeight),
                devicePixelRatio: window.devicePixelRatio || 1,
                surfaceRect: rectFromElement(canvas),
                videoWidth: video.videoWidth || trackSettings?.width,
                videoHeight: video.videoHeight || trackSettings?.height,
            trackFrameRate: trackSettings?.frameRate,
          });
          const localPoint = viewportNormToRectPoint(
            norm,
            rectFromElement(canvas),
            { width: viewportWidth, height: viewportHeight }
          );
          // An extrapolated prediction is clamped to the border — a fabricated
          // position, rejected like an out-of-bounds/stale-signature point (the
          // amber raw dot takes over). It is still counted during captures as a
          // provenance signal of how often the model left its calibrated region.
          dotExtrapolated = norm.extrapolated;
          if (signatureStatus.matches && localPoint.inBounds && distanceOk && !norm.extrapolated) {
            dot = { x: localPoint.x, y: localPoint.y };
            dotCalibrated = true;
          }
        }
      }
      if (!dot && gaze) {
        // Raw iris ratios mapped linearly to the canvas — uncalibrated direction only.
        dot = { x: gaze.h * cssW, y: gaze.v * cssH };
      }
      if (dot) {
        if (!blinking) {
          const sample = dotCalibrated
            ? { t: ts, h: dot.x / cssW, v: dot.y / cssH, calibrated: true }
            : { t: ts, h: dot.x / cssW, v: dot.y / cssH, calibrated: false };
          const samples = visualSignalSamplesRef.current;
          samples.push(sample);
          while (samples.length && ts - samples[0].t > 2600) samples.shift();
        }
        drawFunctionalSignalTrace(ctx, visualSignalSamplesRef.current, cssW, cssH, isDark, dotCalibrated);
      }
      // Slow EMA (~1.5s) of the raw vertical ratio: the amber dot's resting line.
      // Blink frames must NOT enter the rail — the calibrated dot rides it (renderY),
      // so an unguarded EMA turns every eyelid dip into vertical dot motion.
      if (gaze && !blinking) {
        rawVEmaRef.current = rawVEmaRef.current == null || dtMs == null
          ? gaze.v
          : rawVEmaRef.current + (gaze.v - rawVEmaRef.current) * emaAlpha(dtMs, RAW_V_EMA_TAU_MS);
      }
      if (dot && !blinking) {
        const color = dotCalibrated ? '#2563eb' : '#f59e0b';
        // Display-only: the calibrated dot rides that resting line as a fixed rail —
        // same track as the amber dot, calibrated horizontal gain. Capture and
        // live-signal samples keep the true 2D prediction.
        const renderY = dotCalibrated && rawVEmaRef.current != null
          ? rawVEmaRef.current * cssH
          : dot.y;
        ctx.beginPath();
        ctx.arc(dot.x, renderY, 9, 0, Math.PI * 2);
        ctx.fillStyle = color + '33';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(dot.x, renderY, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      // Measured capture: forward this frame's samples to the lifecycle hook.
      const framePush = pushFrameSample({
        ts,
        faceFound,
        pose,
        gaze,
        blinking,
        blinkRising,
        dot: dot ? { h: dot.x / cssW, v: dot.y / cssH } : null,
        dotCalibrated,
        dotExtrapolated,
        // Only real IPD-based estimates enter the provenance median; the profile
        // fallback would fake a measurement that never happened.
        distanceEstimateCm: ipdPx != null && anchor ? dEst : null,
        elapsedUpdateDue: ts - lastLivePushRef.current > 200,
      });
      if (framePush === 'aborted') return;

      // Throttled UI snapshot (~5/s) to avoid re-rendering every frame.
      const snap: LiveSnapshot = {
        faceFound, eyesFound,
        h: gaze ? gaze.h : null, v: gaze ? gaze.v : null,
        yaw: pose ? pose.yaw : null, pitch: pose ? pose.pitch : null, roll: pose ? pose.roll : null,
        fps: frame.fps, coverage,
        cameraFps: frame.cameraFps,
        inferenceMs: frame.inferenceMs,
        delegate: frame.delegate,
        blinkScore: frame.blinkScore,
      };
      liveRef.current = snap;
      if (ts - lastLivePushRef.current > 200) {
        lastLivePushRef.current = ts;
        setLive(snap);
        setLiveSignal(summarizeFunctionalVisualSignal(visualSignalSamplesRef.current, { coverage }));
      }
    }
  };

  const {
    cameraState,
    startCamera: startCameraPipeline,
    stopCamera: stopCameraPipeline,
    streamRef,
  } = useCameraPipeline({
    videoRef,
    suspended: showCalibration,
    onFrame: handleFrame,
    // Mirrors the old inline guard: no canvas mounted → skip the frame entirely
    // (no detection, no fps/coverage advance).
    shouldProcessFrame: () => canvasRef.current !== null,
    onLoopStart: () => { visualSignalSamplesRef.current = []; },
    onMotionSensorStarted: () => setMotionQuality(getMotionQuality()),
    onTeardown: handlePipelineTeardown,
  });

  useEffect(() => {
    if (initialExploratory) return;
    if (sessionState.phase === 'checking-readiness') {
      if (readingTextState === 'error') {
        dispatchSession({
          type: 'READINESS_FAILED',
          reason: readingFailure ?? recallFailure ?? 'Texto de leitura indisponível.',
          canRunExploratory: false,
        });
        return;
      }
      if (readingTextState !== 'ready') return;
      const device = resolveDeviceClass(profile, {
        width: window.innerWidth,
        height: window.innerHeight,
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
        coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      });
      if (device.deviceClassSource !== 'confirmed') {
        dispatchSession({
          type: 'READINESS_FAILED',
          reason: 'Classe de dispositivo não confirmada.',
          canRunExploratory: true,
        });
        return;
      }
      dispatchSession({ type: 'READINESS_PASSED', needsCalibration: !isCalibrated() });
      return;
    }
    if (sessionState.phase === 'validating') {
      if (cameraState === 'running') {
        dispatchSession({ type: 'VALIDATION_PASSED' });
      } else if (cameraState === 'unavailable') {
        dispatchSession({
          type: 'VALIDATION_FAILED',
          reason: 'Câmera indisponível para validar o sinal.',
          canRunExploratory: true,
        });
      }
    }
  }, [
    cameraState,
    initialExploratory,
    profile,
    readingFailure,
    readingTextState,
    recallFailure,
    sessionState.phase,
  ]);

  useEffect(() => {
    if (sessionState.persistence !== 'saving' || !captureResult) return;
    if (captureResult.persistence === 'saved') dispatchSession({ type: 'SAVE_SUCCEEDED' });
    if (captureResult.persistence === 'failed') dispatchSession({ type: 'SAVE_FAILED' });
  }, [captureResult, sessionState.persistence]);

  useEffect(() => {
    if (sessionState.phase !== 'generating-recall') return;
    if (recallQuiz) dispatchSession({ type: 'RECALL_READY' });
    else if (recallGenState === 'error') {
      dispatchSession({
        type: 'RECALL_FAILED',
        reason: recallFailure ?? 'Não foi possível gerar o questionário de recall.',
      });
    }
  }, [recallFailure, recallGenState, recallQuiz, sessionState.phase]);

  useEffect(() => {
    if (sessionState.transitionError && import.meta.env.DEV) {
      console.error(`Transição de avaliação rejeitada: ${sessionState.transitionError}`);
    }
  }, [sessionState.transitionError]);

  useEffect(() => {
    if (!capturing) return;
    const canvas = canvasRef.current;
    const frozen = activeSessionGeometryRef.current;
    if (!canvas || !frozen) return;

    const checkGeometry = () => {
      if (!capturingRef.current || !activeSessionGeometryRef.current || !canvasRef.current) return;
      const interruption = sessionGeometryInterruption(activeSessionGeometryRef.current, {
        orientation: currentOrientation(window.innerWidth, window.innerHeight),
        surfaceRect: rectFromElement(canvasRef.current),
      });
      if (interruption) finishCapture(interruption);
    };

    const observer = new ResizeObserver(checkGeometry);
    observer.observe(canvas);
    window.addEventListener('resize', checkGeometry);
    window.addEventListener('orientationchange', checkGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkGeometry);
      window.removeEventListener('orientationchange', checkGeometry);
    };
  }, [capturing, capturingRef, finishCapture]);

  const stopCamera = (interruption: CaptureInterruptionReason | null = null) => {
    if (capturingRef.current) finishCapture(interruption);
    stopCameraPipeline();
    if (!mountedRef.current) return;
    setLive(EMPTY_LIVE);
    setLiveSignal(EMPTY_VISUAL_SIGNAL);
  };

  const startCamera = () => {
    clearCaptureResult();
    void startCameraPipeline();
  };

  const startCapture = () => {
    setDrawerExpanded(false);
    if (readingTextState !== 'ready' || sessionStatus !== 'ready') return;
    // First capture of the session: collect the quick context before recording.
    if (shouldOpenContextForm()) return;
    const startSnapshot = buildCaptureStartSnapshot();
    if (!startSnapshot) return;
    if (!startCaptureLifecycle(startSnapshot)) return;
    activeSessionGeometryRef.current = {
      orientation: startSnapshot.environment.viewport.orientation,
      surfaceRect: startSnapshot.environment.surfaceRect,
    };
    dispatchSession({ type: 'CAPTURE_STARTED' });
    // Freeze the stimulus geometry for the whole measurement window (the hook owns
    // the provenance snapshot; the font lock is the screen's stimulus concern).
    frozenFontPxRef.current = Math.round(readingFontCssPx(fontAngleRef.current, distanceRef.current));
  };

  const removeCapture = (id: string) => {
    deleteValidationCapture(id)
      .then(() => {
        if (mountedRef.current) setCaptures(prev => prev.filter(c => c.id !== id));
      })
      .catch(() => {/* ignore */});
  };

  const exportCaptures = async () => {
    if (captures.length === 0) return;
    const json = serializeValidationExport(captures, Date.now());
    // Safari on iOS is unreliable with Blob downloads, so try clipboard first and
    // fall back to a download link; report which path worked.
    try {
      await navigator.clipboard.writeText(json);
      setExportNote('JSON copiado para a área de transferência.');
      return;
    } catch {
      try {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `linhafixa-validacao-${captures.length}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setExportNote('Arquivo JSON gerado para download.');
      } catch {
        setExportNote('Não foi possível exportar neste navegador.');
      }
    }
  };

  const exportUnsavedResult = () => {
    const json = JSON.stringify({
      capture: captureResult?.capture ?? null,
      recall: pendingRecallResult,
    }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `linhafixa-resultado-local-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const diagnosticsLayout = diagnosticsLayoutMode({ viewportWidth, hasTouch: HAS_TOUCH_INPUT });
  const isDesktopDiagnosticsLayout = diagnosticsLayout === 'desktop';
  const drawerVariant: DrawerVariant = isLandscape ? 'side' : 'sheet';
  const phonePortraitRequired = requiresPhonePortrait({
    width: viewportWidth,
    height: viewportHeight,
    maxTouchPoints: HAS_TOUCH_INPUT ? Math.max(1, navigator.maxTouchPoints ?? 0) : 0,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
  });
  // Effective display scale (OS scaling × browser zoom). On desktop, ≠100% means the
  // physical size of a CSS px differs from the 96dpi assumption behind the angular
  // stimulus sizes; the value is already persisted per capture via CaptureEnvironment.
  const displayScalePct = Math.round((typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) * 100);
  const diagnosticsSurface = measuredHost
    ? computeDiagnosticsSurface({
      availableWidth: measuredHost.cssWidth,
      availableHeight: measuredHost.cssHeight,
      layoutMode: diagnosticsLayout,
    })
    : null;
  // Antes da primeira medição do RO (1 frame), deixa o CSS preencher; o estilo
  // dimensionado entra assim que a medida real existe — nunca maior que o host.
  const readingSurfaceStyle: React.CSSProperties | undefined =
    isDesktopDiagnosticsLayout && diagnosticsSurface
      ? { width: `${diagnosticsSurface.width}px`, height: `${diagnosticsSurface.height}px` }
      : undefined;

  const beginCalibration = () => {
    if (!canBeginCaptureCalibration({ capturing: capturingRef.current, cameraState })) return;
    // Cinto de segurança: o painel expandido é overlay (rect estável), mas calibrar
    // ou capturar com a gaveta aberta esconderia parte do estímulo.
    setDrawerExpanded(false);
    setCalibrationSurfaceRect(canvasRef.current ? rectFromElement(canvasRef.current) : null);
    setShowCalibration(true);
  };

  const buildCaptureStartSnapshot = (): CaptureStartSnapshot | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const telemetry = readCameraPipelineTelemetry(video);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const device = resolveDeviceClass(profile, {
      width,
      height,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    });
    const environment: CaptureEnvironment = {
      deviceClass: device.deviceClass,
      deviceClassSource: device.deviceClassSource,
      layoutMode: diagnosticsLayoutMode({ viewportWidth: width, hasTouch: HAS_TOUCH_INPUT }),
      viewport: {
        width,
        height,
        devicePixelRatio: window.devicePixelRatio || 1,
        orientation: currentOrientation(width, height),
      },
      surfaceRect: rectFromElement(canvas),
      video: telemetry.video,
      camera: {
        width: telemetry.negotiated.width,
        height: telemetry.negotiated.height,
        frameRate: telemetry.negotiated.frameRate,
        maxFrameRate: telemetry.capabilities?.frameRate?.max,
      },
      rates: {},
    };
    const calibrationAssessment = getCalibrationAssessment();
    const compatibility = calibrationReuseDecision(calibrationAssessment, {
      viewportWidth: environment.viewport.width,
      viewportHeight: environment.viewport.height,
      orientation: environment.viewport.orientation,
      devicePixelRatio: environment.viewport.devicePixelRatio,
      surfaceRect: environment.surfaceRect,
      videoWidth: environment.video.width || environment.camera.width,
      videoHeight: environment.video.height || environment.camera.height,
      trackFrameRate: environment.camera.frameRate,
    });
    const monotonicStart = performance.now();
    const wallClockTimestamp = Date.now();
    const preTestContext = getPreTestContext();
    return {
      captureId: typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${wallClockTimestamp}-${Math.round(monotonicStart * 1000)}`,
      monotonicStart,
      wallClockTimestamp,
      conditions: { ...conditions },
      context: preTestContext ? { ...preTestContext } : undefined,
      calibrationAssessment,
      compatibility,
      environment,
    };
  };

  const leaveScreen = () => {
    stopCamera('navigation-during-capture');
    if (onExit) {
      onExit();
      return;
    }
    navigate('/');
  };

  if (phonePortraitRequired) {
    return <PhonePortraitGate onExit={leaveScreen} />;
  }

  if (showCalibration) {
    return (
      <CalibrationOverlay
        viewingDistanceCm={profile?.viewingDistanceCm || 40}
        onComplete={() => {
          setShowCalibration(false);
          if (sessionState.phase === 'calibrating') {
            dispatchSession({ type: 'CALIBRATION_ACCEPTED' });
          }
        }}
        onSkip={() => {
          setShowCalibration(false);
          if (sessionState.phase === 'calibrating') {
            dispatchSession({ type: 'CALIBRATION_SKIPPED' });
          }
        }}
        keepCameraOnClose
        surfaceRect={calibrationSurfaceRect ?? undefined}
        compactChrome={!isDesktopDiagnosticsLayout}
      />
    );
  }

  const calibrated = isCalibrated();
  const accuracyDeg = getAccuracyDeg();
  const canStartCapture = cameraState === 'running'
    && readingTextState === 'ready'
    && sessionStatus === 'ready';
  const captureBlockReason = readingTextState === 'loading'
    ? 'Aguardando texto de leitura por IA.'
    : readingTextState === 'error'
      ? (testMode === 'recall' ? recallFailure : readingFailure)
        ?? 'Texto de leitura indisponível; capture depois que a IA responder.'
      : sessionState.blockReason
        ?? (sessionStatus === 'calibrating'
          ? 'Conclua ou pule a calibração para continuar.'
          : sessionStatus === 'validating'
            ? 'Inicie a câmera para validar o sinal.'
            : null);
  const reportedCapture = captureResult?.capture ?? null;
  const captureSummary = reportedCapture
    ? summarizeReadingDynamics(reportedCapture.metrics, reportedCapture.coverage)
    : null;
  const workspaceSnapshot = buildAssessmentWorkspaceSnapshot({
    mode: testMode,
    controllerStatus: sessionStatus,
    readingTextState,
    capturing,
    recallGenerating: recallGenState === 'generating',
    recallQuizOpen: recallQuiz !== null,
    hasCaptureResult: captureResult !== null,
    captureCount: captures.length,
    latestSessionLabel: null,
    captureTitle: reportedCapture ? 'Dinamica ocular capturada' : null,
    recallResult: null,
  });
  const sessionIntro =
    testMode === 'recall'
      ? 'Leia o texto, acompanhe a captura ocular e responda ao recall na mesma sessao.'
      : 'Prepare a leitura guiada, valide o enquadramento e capture a dinamica ocular no mesmo fluxo.';
  const Chip = ({ ok, label, neutral }: { key?: React.Key; ok: boolean; label: string; neutral?: boolean }) => (
    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
      neutral ? 'bg-slate-700 text-slate-200'
        : ok ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
             : 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
    }`}>{label}</span>
  );

  const chipData: { ok: boolean; label: string; neutral?: boolean }[] = [
    { ok: cameraState === 'running', label: cameraState === 'running' ? 'Câmera' : 'Câmera off' },
    { ok: live.faceFound, label: 'Rosto' },
    { ok: live.eyesFound, label: 'Olhos' },
    { ok: calibrated, label: calibrated ? `Calib ~${accuracyDeg != null ? accuracyDeg.toFixed(1) : '?'}°` : 'Sem calib', neutral: !calibrated },
    { ok: motionQuality.status === 'stable', label: motionStatusLabel(motionQuality.status), neutral: motionQuality.status === 'unavailable' },
  ];

  // Coluna side tem 48px de largura: chips viram pontos de status com o rótulo no title.
  const StatusDot = ({ ok, label, neutral }: { key?: React.Key; ok: boolean; label: string; neutral?: boolean }) => (
    <span
      title={label}
      aria-label={label}
      className={`h-2.5 w-2.5 rounded-full shrink-0 ${neutral ? 'bg-slate-500' : ok ? 'bg-emerald-400' : 'bg-rose-400'}`}
    />
  );

  // Cards de diagnóstico como dados: o desktop recompõe verbatim (pixel igual),
  // a gaveta mobile empilha os mesmos nós como acordeão com resumo vivo.
  const metricsGrid = (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <Metric label="FPS detecção" value={live.fps ? String(live.fps) : '—'} />
      <Metric label="Cobertura" value={`${live.coverage.toFixed(0)}%`} />
      <Metric label="Câmera fps" value={live.cameraFps != null ? String(Math.round(live.cameraFps)) : '—'} />
      <Metric label="Inferência" value={live.inferenceMs != null ? `${live.inferenceMs.toFixed(0)} ms` : '—'} />
      <Metric label="Delegate" value={live.delegate ?? '—'} />
      <Metric label="Blink" value={live.blinkScore != null ? live.blinkScore.toFixed(2) : '—'} />
      <Metric label="Olhar H" value={fmt(live.h)} />
      <Metric label="Olhar V" value={fmt(live.v)} />
      <Metric label="Yaw idx" value={live.yaw != null ? live.yaw.toFixed(0) : '—'} />
      <Metric label="Pitch idx" value={live.pitch != null ? live.pitch.toFixed(0) : '—'} />
      <Metric label="Delta pos." value={motionQuality.deltaDeg != null ? `${motionQuality.deltaDeg.toFixed(1)}°` : '—'} />
      <Metric label="Confiança" value={confidenceLabel(motionQuality.confidence)} />
    </div>
  );

  const signalCard = (
    <div className="rounded-xl bg-slate-900/60 border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Captação funcional</div>
          <div className="text-sm font-bold text-slate-100 mt-1">{liveSignal.label}</div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${visualToneClass(liveSignal.tone)}`}>
          {liveSignal.sourceLabel}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-3">
        <div
          className={`h-full rounded-full ${liveSignal.tone === 'emerald' ? 'bg-emerald-400' : liveSignal.tone === 'rose' ? 'bg-rose-400' : liveSignal.tone === 'amber' ? 'bg-amber-400' : 'bg-slate-500'}`}
          style={{ width: `${liveSignal.sensitivityScore}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Metric label="Sensibilidade" value={`${liveSignal.sensitivityScore}%`} />
        <Metric label="Evento" value={liveSignal.eventLabel} />
        <Metric label="H range" value={liveSignal.horizontalRange.toFixed(2)} />
        <Metric label="Fixação" value={`${liveSignal.fixationShare}%`} />
        <Metric label="Continuidade" value={`${liveSignal.continuityPct}%`} />
        <Metric label="Taxa janela" value={formatSampleRateHz(liveSignal.sampleRateHz, '—')} />
      </div>
      <p className="text-xs text-slate-400 mt-3">{liveSignal.detail}</p>
    </div>
  );

  // Corpo compartilhado: no desktop dentro do <details>, no mobile como card do acordeão.
  const interpretBody = (
    <>
      Horizontal é o eixo principal da leitura; vertical/diagonal fica como contexto.
      <br />
      O traço inferior mostra a captação funcional do movimento; a bolinha pequena é só apoio técnico.
      <br />
      <span className="text-blue-400 font-bold">Azul</span> = sinal calibrado ·{' '}
      <span className="text-amber-400 font-bold">âmbar</span> = sinal bruto
      <br />
      Motion Assist sinaliza mudança do iPhone desde a calibração; não corrige o olhar automaticamente.
      {isDesktopDiagnosticsLayout && (
        <>
          <br />
          Escala {displayScalePct}% = sistema × zoom do navegador. Os tamanhos angulares do
          estímulo assumem 96 dpi; a escala fica registrada em cada captura.
        </>
      )}
    </>
  );

  // PACK 2: tag the physical conditions so captures are comparable.
  const conditionsCard = (
    <div className="rounded-xl bg-slate-900/50 border border-white/10 p-3 flex flex-col gap-3">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Condição da captura</div>
      <div>
        <div className="text-[11px] text-slate-500 mb-1">Iluminação</div>
        <div className="flex gap-1">
          {LIGHTING_OPTIONS.map(([val, label]) => (
            <button
              key={val}
              onClick={() => setConditions(p => ({ ...p, lighting: val }))}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold ${conditions.lighting === val ? 'bg-indigo-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}
            >{label}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] text-slate-500 mb-1">Postura</div>
        <div className="grid grid-cols-2 gap-1">
          {POSTURE_OPTIONS.map(([val, label]) => (
            <button
              key={val}
              onClick={() => setConditions(p => ({ ...p, posture: val }))}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold ${conditions.posture === val ? 'bg-indigo-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}
            >{label}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Distância (perfil)</span>
        <span className="font-bold text-slate-200">{conditions.distanceCm} cm</span>
      </div>
      <input
        value={conditions.note ?? ''}
        onChange={e => setConditions(p => ({ ...p, note: e.target.value }))}
        placeholder="Nota (opcional)"
        className="w-full px-2 py-1.5 rounded-lg bg-white/10 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:bg-white/15"
      />
    </div>
  );

  const exposureCard = (
    <ExposureControlCard active={cameraState === 'running'} streamRef={streamRef} />
  );

  // Miolo de diagnóstico do <aside> desktop — mesma composição e ordem de sempre.
  const diagnosticsCards = (
    <>
      {metricsGrid}
      {signalCard}
      <details className="rounded-xl bg-slate-900/40 border border-white/10 px-3 py-2 text-xs text-slate-400">
        <summary className="cursor-pointer select-none font-bold text-slate-300">
          Como interpretar os indicadores
        </summary>
        <div className="mt-2">{interpretBody}</div>
      </details>
      {conditionsCard}
      {exposureCard}
    </>
  );

  // Resumos vivos derivam de estado que já existe — nenhum buffer ou cálculo novo.
  const diagnosticsSections: DiagnosticsSection[] = [
    { id: 'metrics', title: 'Métricas', summary: `${live.fps ? `${live.fps}fps` : '—'}${live.cameraFps != null ? `/${Math.round(live.cameraFps)}cam` : ''} · ${live.inferenceMs != null ? `${live.inferenceMs.toFixed(0)}ms` : `H ${fmt(live.h)}`}`, content: metricsGrid },
    { id: 'signal', title: 'Captação', summary: `${liveSignal.sensitivityScore}% · ${liveSignal.sourceLabel}`, content: signalCard },
    { id: 'conditions', title: 'Condição', summary: `${optionLabel(LIGHTING_OPTIONS, conditions.lighting)} · ${optionLabel(POSTURE_OPTIONS, conditions.posture)}`, content: conditionsCard },
    { id: 'exposure', title: 'Exposição', content: exposureCard },
    { id: 'interpret', title: 'Como interpretar', content: <div className="text-xs text-slate-400 px-1">{interpretBody}</div> },
  ];

  const switchSessionMode = (mode: 'capture' | 'recall') => {
    if (mode === testMode || capturing) return;
    switchMode(mode);
    dispatchSession({ type: 'RESET', mode });
    dispatchSession({ type: 'BEGIN' });
    if (initialExploratory) {
      dispatchSession({
        type: 'READINESS_FAILED',
        reason: 'Sessão iniciada como baseline exploratório.',
        canRunExploratory: true,
      });
      dispatchSession({ type: 'RUN_EXPLORATORY' });
    }
  };

  const modeSwitch = (
    <div className="grid grid-cols-2 gap-1 bg-white/5 rounded-xl p-1">
      <button
        onClick={() => switchSessionMode('capture')}
        disabled={capturing}
        className={`px-2 py-2 rounded-lg text-xs font-bold transition-colors ${testMode === 'capture' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
      >Captura simples</button>
      <button
        onClick={() => switchSessionMode('recall')}
        disabled={capturing}
        className={`px-2 py-2 rounded-lg text-xs font-bold transition-colors ${testMode === 'recall' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
      >Leitura + Recall</button>
    </div>
  );

  const capturesButton = (
    <button
      onClick={() => { setExportNote(null); setShowCaptures(true); }}
      className="flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm"
    >
      <Database className="w-4 h-4" /> Capturas salvas ({captures.length})
    </button>
  );

  const stopCameraButton = cameraState === 'running' ? (
    <button onClick={() => stopCamera(cameraStopInterruptionReason(capturingRef.current))} className="flex items-center justify-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200 text-sm">
      <RotateCcw className="w-4 h-4" /> Parar câmera
    </button>
  ) : null;

  const drawerChips = drawerVariant === 'sheet' ? (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto min-w-0">
      {chipData.map(c => <Chip key={c.label} ok={c.ok} label={c.label} neutral={c.neutral} />)}
    </div>
  ) : (
    <div className="flex flex-col items-center gap-2">
      {chipData.map(c => <StatusDot key={c.label} ok={c.ok} label={c.label} neutral={c.neutral} />)}
    </div>
  );

  const retryReadingContent = () => {
    if (!initialExploratory) {
      dispatchSession({ type: 'RESET', mode: testMode });
      dispatchSession({ type: 'BEGIN' });
    }
    if (testMode === 'recall') retryRecallText();
    else loadShortReadingContent();
  };

  const readingRetryButton = readingTextState === 'error' ? (
    <button
      type="button"
      onClick={retryReadingContent}
      className="rounded-lg bg-amber-400/15 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-400/25"
    >
      Tentar gerar texto novamente
    </button>
  ) : null;

  // Ações primárias na faixa colapsada: um toque sem abrir a gaveta. Versão
  // compacta (ícone) dos botões grandes que o desktop mantém no <aside>.
  const drawerActions = (
    <div className={`flex items-center gap-1.5 shrink-0 ${drawerVariant === 'side' ? 'flex-col' : ''}`}>
      <button
        onClick={beginCalibration}
        disabled={!canBeginCaptureCalibration({ capturing, cameraState })}
        aria-label={calibrated ? 'Recalibrar' : 'Calibrar'}
        className="p-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-40 rounded-xl"
      >
        <Crosshair className="w-4 h-4" />
      </button>
      {!capturing ? (
        <button
          onClick={startCapture}
          disabled={!canStartCapture}
          aria-label={testMode === 'recall' ? 'Ler e responder' : 'Iniciar captura de leitura'}
          className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl"
        >
          <Play className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={() => finishCapture()}
          aria-label="Terminei de ler"
          className="flex items-center gap-1 p-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold"
        >
          <Check className="w-4 h-4" />
          <span>{Math.floor(captureElapsed / 1000)}s</span>
        </button>
      )}
    </div>
  );

  return (
    <div
      className={
        embedded
          ? 'relative h-full overflow-hidden text-white'
          : 'fixed inset-0 bg-slate-900 text-white overflow-hidden'
      }
      style={
        embedded
          ? undefined
          : {
              paddingTop: 'env(safe-area-inset-top)',
              paddingRight: 'env(safe-area-inset-right)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
            }
      }
    >
      {/* Hidden source video (mirrored preview is rendered in the panel). */}
      <video ref={videoRef} playsInline muted autoPlay className="hidden" />
      <AssessmentSessionSurface
        stage={workspaceSnapshot.stage}
        text={sessionIntro}
        blockReason={captureBlockReason}
        constrainedHeight={embedded}
      >
        <div className="flex h-full min-h-0 flex-1 flex-col">
          <div className={`flex items-center gap-3 ${embedded ? 'mb-2' : 'mb-4'}`}>
            <button
              onClick={leaveScreen}
              className="p-2 bg-white/10 rounded-full hover:bg-white/20"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className={`${embedded ? 'text-base' : 'text-lg'} font-bold`}>
                {embedded ? SESSION_TITLES[workspaceSnapshot.stage] : 'Dinâmica ocular de leitura'}
              </h1>
              {!embedded ? (
                <p className="text-xs text-slate-400">
                  taxa medida por dispositivo · foco em sacadas e regressões
                </p>
              ) : null}
            </div>
          </div>

          <div className={`flex-1 flex min-h-0 ${isDesktopDiagnosticsLayout ? 'flex-row justify-center gap-4' : isLandscape ? 'flex-row' : 'flex-col'}`}>
            <div ref={surfaceHostRef} className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
              <div
                className={`relative min-w-0 min-h-0 ${isDesktopDiagnosticsLayout ? 'shrink-0 overflow-hidden rounded-2xl border-2 border-indigo-300/70 bg-slate-900/30 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_24px_70px_rgba(15,23,42,0.45)]' : 'w-full h-full'}`}
                style={readingSurfaceStyle}
                aria-label="Área fixa de leitura, captura e calibração"
                // Tap anywhere on the reading surface ends the capture at that exact
                // instant — no eye excursion hunting for the stop button. Inert when
                // not capturing, and finishCapture() already truncates the buffers.
                onPointerDown={() => { if (capturingRef.current) finishCapture(); }}
              >
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
                <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-indigo-400/40">
                  <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-100 shadow-lg backdrop-blur">
                    <span className="h-2 w-2 rounded-full bg-indigo-300" />
                    Área fixa de leitura e calibração
                  </div>
                  {isDesktopDiagnosticsLayout && diagnosticsSurface && (
                    <div className="absolute right-4 top-4 rounded-full bg-slate-950/70 px-3 py-1.5 text-[11px] font-semibold text-slate-200 backdrop-blur">
                      {Math.round(diagnosticsSurface.width)}×{Math.round(diagnosticsSurface.height)} px
                    </div>
                  )}
                  <div className="absolute left-3 top-3 h-10 w-10 rounded-tl-2xl border-l-2 border-t-2 border-indigo-300/90" />
                  <div className="absolute right-3 top-3 h-10 w-10 rounded-tr-2xl border-r-2 border-t-2 border-indigo-300/90" />
                  <div className="absolute bottom-3 left-3 h-10 w-10 rounded-bl-2xl border-b-2 border-l-2 border-indigo-300/90" />
                  <div className="absolute bottom-3 right-3 h-10 w-10 rounded-br-2xl border-b-2 border-r-2 border-indigo-300/90" />
                </div>
                {cameraState !== 'running' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/80">
                    {cameraState === 'idle' && (
                      <>
                        <Camera className="w-12 h-12 text-indigo-400 mb-4" />
                        <p className="text-slate-300 max-w-md mb-6">
                          Toque para iniciar a câmera frontal e, se o Safari permitir, os sensores
                          de movimento para medir a estabilidade da posição do iPhone.
                        </p>
                        <button onClick={startCamera} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-lg">
                          Iniciar câmera + sensores
                        </button>
                      </>
                    )}
                    {cameraState === 'starting' && (
                      <>
                        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-slate-300">Preparando a câmera…</p>
                      </>
                    )}
                    {cameraState === 'unavailable' && (
                      <>
                        <h2 className="text-2xl font-bold mb-3">Câmera indisponível</h2>
                        <p className="text-slate-300 max-w-md mb-6">
                          Não foi possível acessar a câmera (permissão negada ou contexto não seguro).
                          No iPhone, a câmera só funciona em <span className="font-bold">HTTPS</span>.
                        </p>
                        <button onClick={startCamera} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold">
                          Tentar novamente
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isDesktopDiagnosticsLayout ? (
              <aside className="w-72 border-l max-h-none shrink-0 bg-slate-800/80 border-white/10 p-4 flex flex-col gap-4">
                <div className="shrink-0 rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
                  {cameraState === 'running'
                    ? <MirroredPreview stream={streamRef} streamId={streamRef.current?.id ?? ''} />
                    : <span className="text-slate-500 text-sm">sem vídeo</span>}
                </div>

                <div className="shrink-0 flex flex-wrap gap-2">
                  {chipData.map(c => <Chip key={c.label} ok={c.ok} label={c.label} neutral={c.neutral} />)}
                  <Chip ok neutral label={`Escala ${displayScalePct}%`} />
                </div>

                <div className="min-h-0 overflow-y-auto flex flex-col gap-4 -mr-4 pr-4 [scrollbar-width:thin]">
                  {diagnosticsCards}
                </div>

                <div className="shrink-0 flex flex-col gap-2">
                  {modeSwitch}

                  <button
                    onClick={beginCalibration}
                    disabled={!canBeginCaptureCalibration({ capturing, cameraState })}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-40 rounded-xl font-bold"
                  >
                    <Crosshair className="w-4 h-4" /> {calibrated ? 'Recalibrar' : 'Calibrar'}
                  </button>

                  {!capturing ? (
                    <button
                      onClick={startCapture}
                      disabled={!canStartCapture}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl font-bold"
                    >
                      <Play className="w-4 h-4" /> {workspaceSnapshot.primaryAction.label}
                    </button>
                  ) : (
                    <button
                      onClick={() => finishCapture()}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold"
                    >
                      <Check className="w-4 h-4" /> Terminei de ler ({Math.floor(captureElapsed / 1000)}s)
                    </button>
                  )}
                  {captureBlockReason && (
                    <p className="text-xs text-amber-300 font-medium text-center px-2">{captureBlockReason}</p>
                  )}
                  {readingRetryButton}

                  {capturesButton}

                  {stopCameraButton}
                </div>
              </aside>
            ) : (
              <DiagnosticsDrawer
                variant={drawerVariant}
                expanded={drawerExpanded}
                onToggle={() => setDrawerExpanded(e => !e)}
                chips={drawerChips}
                actions={drawerActions}
              >
                <DiagnosticsAccordion sections={diagnosticsSections} />
                {modeSwitch}
                {captureBlockReason && (
                  <p className="text-xs text-amber-300 font-medium text-center px-2">{captureBlockReason}</p>
                )}
                {readingRetryButton}
                {capturesButton}
                {stopCameraButton}
              </DiagnosticsDrawer>
            )}
          </div>
        </div>
      </AssessmentSessionSurface>

      {/* Quick pre-test context, asked before the first capture of the session */}
      {contextFormOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900 p-6 overflow-y-auto">
          <div ref={contextDialogRef} role="dialog" aria-modal="true" aria-labelledby="capture-context-title" tabIndex={-1} className="w-full max-w-2xl">
            <h2 id="capture-context-title" className="sr-only">Contexto antes da captura</h2>
            <PreContextForm
              tone="dark"
              value={contextDraft}
              onChange={setContextDraft}
              submitLabel="Registrar e iniciar captura"
              onSubmit={adoptContextDraft}
            />
            <button
              onClick={skipContextForNow}
              className="w-full mt-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-sm font-bold"
            >
              Pular por agora e iniciar
            </button>
            <button
              onClick={closeContextForm}
              className="w-full mt-3 py-2 text-slate-400 hover:text-slate-200 text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Recall: question generation / quiz overlays (above the capture report) */}
      {recallGenState === 'generating' && (
        <div role="status" aria-live="polite" className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 p-6">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-300 font-medium">Gerando questões sobre o texto…</p>
        </div>
      )}
      {recallGenState === 'error' && (
        <div ref={recallErrorDialogRef} role="dialog" aria-modal="true" aria-labelledby="recall-error-title" tabIndex={-1} className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 p-6 text-center">
          <h2 id="recall-error-title" className="text-rose-300 font-bold mb-2">Não foi possível gerar as questões.</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-md">
            {recallFailure ?? 'A captura ocular permanece preservada; só o questionário falhou.'}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => {
                dispatchSession({ type: 'RETRY_RECALL' });
                retryRecallQuestions();
              }}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold"
            >
              Tentar gerar questões novamente
            </button>
            <button onClick={dismissRecallError} className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold">Fechar</button>
          </div>
        </div>
      )}
      {recallQuiz && recallContent && (
        <div ref={recallQuizDialogRef} role="dialog" aria-modal="true" aria-labelledby="recall-quiz-title" tabIndex={-1} className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/95 p-4 overflow-y-auto">
          <h2 id="recall-quiz-title" className="sr-only">Questionário de recall</h2>
          <RecallQuiz
            topic={recallContent.topic}
            questions={recallQuiz}
            onDone={(answers, score) => {
              handleQuizDone(answers, score);
              dispatchSession({ type: 'QUIZ_FINISHED' });
            }}
          />
        </div>
      )}

      {/* Capture report */}
      {captureResult && reportedCapture && !recallQuiz && recallGenState === 'idle' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/90 p-6">
          <div ref={captureReportDialogRef} role="dialog" aria-modal="true" aria-labelledby="capture-report-title" tabIndex={-1}>
            <h2 id="capture-report-title" className="sr-only">Resultado da captura</h2>
            <AssessmentResultPanel
              capture={reportedCapture}
              persistence={captureResult.persistence}
              recallOutcome={recallOutcome}
              recallPersistence={recallPersistence}
              captureSummary={captureSummary}
              onRetrySave={() => {
                dispatchSession({ type: 'RETRY_SAVE' });
                retryCapturePersistence();
              }}
              onRetryRecallSave={retryRecallPersistence}
              onClose={requestResultClose}
              onRestart={() => {
                if (hasUnsavedResult) {
                  setShowUnsavedExit(true);
                  return;
                }
                closeResult();
              }}
            />
          </div>
        </div>
      )}

      {showUnsavedExit && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-6">
          <div
            ref={unsavedExitDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-result-title"
            tabIndex={-1}
            className="w-full max-w-lg rounded-3xl border border-rose-400/30 bg-slate-800 p-6 shadow-2xl"
          >
            <h2 id="unsaved-result-title" className="text-2xl font-bold text-white">
              Há resultado ainda não salvo
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Tente salvar novamente ou exporte o conteúdo exato que continua em memória antes de sair.
            </p>
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => setShowUnsavedExit(false)}
                className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-500"
              >
                Continuar nesta tela
              </button>
              <button
                type="button"
                onClick={exportUnsavedResult}
                className="rounded-xl bg-white/10 px-5 py-3 font-bold text-white hover:bg-white/20"
              >
                Exportar resultado local
              </button>
              <button
                type="button"
                onClick={closeResult}
                className="rounded-xl px-5 py-3 font-bold text-rose-200 hover:bg-rose-500/15"
              >
                Sair mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved validation captures */}
      {showCaptures && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/90 p-4">
          <div ref={capturesDialogRef} role="dialog" aria-modal="true" aria-labelledby="saved-captures-title" tabIndex={-1} className="bg-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] flex flex-col border border-white/10">
            <div className="flex items-center gap-3 mb-1">
              <Database className="w-5 h-5 text-indigo-400" />
              <h2 id="saved-captures-title" className="text-xl font-bold">Capturas de validação</h2>
              <span className="text-sm text-slate-400">{captures.length}</span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={exportCaptures}
                  disabled={captures.length === 0}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-sm font-bold"
                >Exportar JSON</button>
                <button
                  onClick={() => { setShowCaptures(false); setExportNote(null); }}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold"
                >Fechar</button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Cada captura guarda condição, métricas oculares, índice postural e sinal por eixo
              (H/V) para calibrar os thresholds do app com dado real.
            </p>
            {exportNote && <p className="text-xs text-emerald-300 mb-3">{exportNote}</p>}
            {captures.length === 0 ? (
              <p className="text-slate-400 text-sm py-10 text-center">
                Nenhuma captura salva ainda. Etiquete a condição e inicie uma captura.
              </p>
            ) : (
              <div className="overflow-y-auto flex flex-col gap-2 pr-1">
                {captures.map(c => {
                  const quality = summarizeSaccadeSignalQuality(c.metrics, {
                    coverage: c.coverage,
                    calibrated: c.calibrated,
                    validity: c.validity,
                  });
                  return (
                  <div key={c.id} className="rounded-xl bg-slate-900/70 border border-white/10 p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-300">{new Date(c.timestamp).toLocaleString()}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-[11px] font-bold">{lightingLabel(c.conditions.lighting)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-[11px] font-bold">{c.conditions.distanceCm} cm</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-[11px] font-bold">{postureLabel(c.conditions.posture)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${quality.tone === 'emerald' ? 'bg-emerald-500/15 text-emerald-300' : quality.tone === 'rose' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'}`}>
                        {quality.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-[11px] font-bold">
                        {c.calibratedSampleCount != null || c.rawSampleCount != null
                          ? sourceConsistencyLabel(c.metrics.signalSource, c.calibratedSampleCount, c.rawSampleCount)
                          : quality.sourceLabel}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${c.postural.status === 'stable' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{c.postural.label}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-[11px] font-bold">{c.postural.baselineApplied ? 'Baseline' : 'Sem baseline'}</span>
                      {c.environment && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-[11px] font-bold">
                          {c.environment.layoutMode === 'desktop' ? 'Desktop' : 'Compacto'} · câmera {rateLabel(c.environment.camera.frameRate)}
                        </span>
                      )}
                      <button onClick={() => removeCapture(c.id)} className="ml-auto p-1.5 text-slate-500 hover:text-rose-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center">
                      <CapStat label="Cobertura" value={`${c.coverage.toFixed(0)}%`} />
                      <CapStat label="Taxa" value={formatSampleRateHz(c.metrics.sampleRateHz)} />
                      <CapStat label="Sacadas" value={String(c.metrics.saccadeCount)} />
                      <CapStat label="Retornos" value={c.metrics.lineReturnCount != null ? String(c.metrics.lineReturnCount) : 'N/D'} />
                      <CapStat label="Cervical" value={`${c.postural.cervicalStability}%`} />
                      <CapStat label="Delta pos." value={c.postural.motionDeltaDeg != null ? `${c.postural.motionDeltaDeg.toFixed(1)}°` : 'N/D'} />
                      <CapStat label="H range" value={c.axis.hRange.toFixed(2)} />
                      <CapStat label="Amostras" value={String(c.sampleCount)} />
                    </div>
                    {c.conditions.note && <p className="text-xs text-slate-400 mt-2 italic">{c.conditions.note}</p>}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

function fmt(v: number | null): string {
  return v != null ? v.toFixed(2) : '—';
}

function rateLabel(value: number | undefined): string {
  return formatSampleRateHz(value);
}

// "Calibrada (92%)": which single-source series fed the analysis and how consistently
// that source held during the capture (the minority buffer was dropped, not mixed in).
function sourceConsistencyLabel(
  source: SaccadeMetrics['signalSource'],
  calibratedCount: number | undefined,
  rawCount: number | undefined,
): string {
  const base = source === 'calibrated-mediapipe' ? 'Calibrada' : source === 'raw-mediapipe' ? 'Bruta' : 'N/D';
  const total = (calibratedCount ?? 0) + (rawCount ?? 0);
  if (base === 'N/D' || total === 0) return base;
  const chosen = source === 'calibrated-mediapipe' ? (calibratedCount ?? 0) : (rawCount ?? 0);
  return `${base} (${Math.round((chosen / total) * 100)}%)`;
}

function cameraNegotiatedLabel(environment: CaptureEnvironment): string {
  const { width, height } = environment.camera;
  return width && height ? `${Math.round(width)}×${Math.round(height)}` : 'N/D';
}

function videoSizeLabel(environment: CaptureEnvironment): string {
  const { width, height } = environment.video;
  return width && height ? `${Math.round(width)}×${Math.round(height)}` : 'N/D';
}

function surfaceSizeLabel(environment: CaptureEnvironment): string {
  const { width, height } = environment.surfaceRect;
  return width && height ? `${Math.round(width)}×${Math.round(height)}` : 'N/D';
}

function drawFunctionalSignalTrace(
  ctx: CanvasRenderingContext2D,
  samples: VisualSignalSample[],
  width: number,
  height: number,
  isDark: boolean,
  calibrated: boolean
) {
  const traceW = Math.min(width * 0.62, 520);
  const traceH = 34;
  const x0 = (width - traceW) / 2;
  const y0 = height - 58;
  const r = 17;

  ctx.save();
  ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.82)';
  roundedRect(ctx, x0, y0, traceW, traceH, r);
  ctx.fill();

  ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(100, 116, 139, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0 + 14, y0 + traceH / 2);
  ctx.lineTo(x0 + traceW - 14, y0 + traceH / 2);
  ctx.stroke();

  if (samples.length >= 2) {
    const recent = samples.slice(-36);
    ctx.strokeStyle = calibrated ? '#2563eb' : '#f59e0b';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    recent.forEach((sample, index) => {
      const x = x0 + 14 + sample.h * (traceW - 28);
      const y = y0 + traceH / 2 + (sample.v - 0.5) * traceH * 0.65;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = recent[recent.length - 1];
    const markerX = x0 + 14 + last.h * (traceW - 28);
    const markerY = y0 + traceH / 2 + (last.v - 0.5) * traceH * 0.65;
    ctx.fillStyle = calibrated ? '#2563eb' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
  ctx.fillText('captação funcional do movimento ocular', x0 + traceW / 2, y0 - 10);
  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function visualToneClass(tone: FunctionalVisualSignalSummary['tone']): string {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-500/15 text-emerald-300';
    case 'rose':
      return 'bg-rose-500/15 text-rose-300';
    case 'amber':
      return 'bg-amber-500/15 text-amber-300';
    default:
      return 'bg-slate-700 text-slate-200';
  }
}

function motionStatusLabel(status: MotionQuality['status']): string {
  switch (status) {
    case 'stable':
      return 'Posição estável';
    case 'moved':
      return 'Posição mudou';
    case 'shaking':
      return 'Movimento alto';
    default:
      return 'Sem sensores';
  }
}

function confidenceLabel(confidence: MotionQuality['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'Alta';
    case 'medium':
      return 'Média';
    default:
      return 'Baixa';
  }
}

function lightingLabel(lighting: ValidationLighting): string {
  switch (lighting) {
    case 'dim': return 'Luz fraca';
    case 'bright': return 'Luz forte';
    default: return 'Luz normal';
  }
}

function postureLabel(posture: ValidationPosture): string {
  switch (posture) {
    case 'tilted': return 'Inclinada';
    case 'slouched': return 'Curvada';
    case 'reclined': return 'Recostada';
    default: return 'Reta';
  }
}

function CapStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-bold text-slate-200">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Metric({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="bg-slate-900/60 rounded-xl px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`font-bold ${big ? 'text-xl' : 'text-base'}`}>{value}</div>
    </div>
  );
}

// Small live preview of the active stream, mirrored like a selfie camera.
function MirroredPreview({ stream, streamId }: { stream: React.MutableRefObject<MediaStream | null>; streamId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream.current) {
      ref.current.srcObject = stream.current;
      ref.current.play().catch(() => {});
    }
  }, [stream, streamId]);
  return <video ref={ref} playsInline muted autoPlay className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />;
}

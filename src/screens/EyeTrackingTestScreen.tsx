import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Camera, Check, Eye, Play, RotateCcw, Crosshair, Trash2, Database } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  initFaceTracking, isFaceTrackingActive, estimateHeadPose, estimateGaze, extractGazeFeatures, getLastLandmarks,
  getBlinkScore, shouldDropGazeForBlink,
} from '@/services/faceTracking';
import {
  interpupillaryPx, estimateDistanceCm, getDistanceAnchor, readingFontCssPx, readingFontAngleDeg,
  cssPxPerDeg, distanceWithinAnchorTolerance,
} from '@/services/viewingGeometry';
import { isCalibrated, predictNorm, getAccuracyDeg, getCalibrationSignature } from '@/services/gazeCalibration';
import { attachStream, getActiveCameraStream, getFrontCameraStream, stopCameraStream } from '@/services/cameraStream';
import {
  getMotionQuality,
  requestMotionPermissionFromGesture,
  startMotionSensor,
  stopMotionSensor,
  type MotionQuality,
} from '@/services/motionSensor';
import { CalibrationOverlay } from '@/components/CalibrationOverlay';
import { DiagnosticsDrawer } from '@/components/DiagnosticsDrawer';
import type { DrawerVariant } from '@/services/diagnosticsDrawerLayout';
import { analyzeSaccades } from '@/exercises/saccadeAnalysis';
import { summarizeReadingDynamics } from '@/exercises/readingDynamics';
import {
  getPosturalBaseline,
  resetPosturalBaseline,
  summarizePosturalStability,
  toPosturalSample,
  type PosturalStabilityMetrics,
  type PosturalSample,
} from '@/exercises/posturalStability';
import { CaptureEnvironment, GazeSample, PreTestContext, RecallQuestion, RecallTestResult, SaccadeMetrics, ValidationCapture, ValidationConditions, ValidationLighting, ValidationPosture } from '@/types';
import { saveValidationCapture, getValidationCaptures, deleteValidationCapture, getTodayPreContext, saveRecallTest } from '@/services/storage';
import { PreContextForm } from '@/components/QuickContextForm';
import { RecallQuiz } from '@/components/RecallQuiz';
import { getRecallText, getRecallQuestions, type RecallContent } from '@/services/recallService';
import { summarizeAxisSignal, serializeValidationExport, selectCaptureSeries } from '@/services/validationCapture';
import { summarizeSaccadeSignalQuality } from '@/services/signalQuality';
import {
  summarizeFunctionalVisualSignal,
  type FunctionalVisualSignalSummary,
  type VisualSignalSample,
} from '@/services/visualSignal';
import { getReadingContent } from '@/services/contentGenerator';
import { diagnosticsLayoutMode } from '@/services/deviceProfile';
import { computeDiagnosticsSurface } from '@/services/captureGeometry';
import { readCameraPipelineTelemetry } from '@/services/cameraTelemetry';
import { startVideoFrameLoop, type VideoFrameLoopHandle } from '@/services/videoFrameLoop';
import {
  calibrationSignatureMatches,
  currentOrientation,
  rectFromElement,
  viewportNormToRectPoint,
  type SurfaceRect,
} from '@/services/ocularSignalContract';

// Standalone diagnostics screen: shows reading text, runs the front camera and
// overlays a live gaze dot + detection status so we can validate that the eyes are
// actually being detected/tracked on the target device (iPhone Pro Max, landscape)
// before relying on the signal inside the exercises.

// Safety ceiling only: the capture normally ends when the reader clicks
// "Terminei de ler", so the reading pace (not a fixed timer) sets the duration.
const CAPTURE_SAFETY_CAP_MS = 120000;
const DIAGNOSTICS_PANEL_WIDTH_PX = 288;
const DIAGNOSTICS_HEADER_HEIGHT_PX = 73;
const DIAGNOSTICS_DESKTOP_GUTTER_PX = 48; // horizontal padding + gap around canvas/panel

// Phones expose the front camera off-axis in landscape, but we prefer landscape anyway:
// reading saccades are horizontal, so a wide line gives the webcam a bigger, cleaner
// signal, and the flow (not the exact gaze position) is what we measure. IS_MOBILE gates
// the gentle orientation nudge below; touch is our proxy for "rotates camera with orientation".
const IS_MOBILE = typeof navigator !== 'undefined'
  && (navigator.maxTouchPoints > 0 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));

type CameraState = 'idle' | 'starting' | 'running' | 'unavailable';
type ReadingTextState = 'loading' | 'ready' | 'error';

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
}

const EMPTY_LIVE: LiveSnapshot = {
  faceFound: false, eyesFound: false, h: null, v: null,
  yaw: null, pitch: null, roll: null, fps: 0, coverage: 0,
};
const EMPTY_VISUAL_SIGNAL = summarizeFunctionalVisualSignal([]);

export function EyeTrackingTestScreen() {
  const navigate = useNavigate();
  const { profile } = useAppStore();
  const isDark = profile?.contrastPreference === 'dark';

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraState, setCameraState] = useState<CameraState>('idle');
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
  const [capturing, setCapturing] = useState(false);
  const [captureElapsed, setCaptureElapsed] = useState(0);
  const [captureResult, setCaptureResult] = useState<{ metrics: SaccadeMetrics; coverage: number; postural: PosturalStabilityMetrics; environment?: CaptureEnvironment; calibratedSampleCount?: number; rawSampleCount?: number; extrapolatedSampleCount?: number } | null>(null);
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
  const [preContext, setPreContext] = useState<PreTestContext | null>(null);
  const [contextDraft, setContextDraft] = useState<PreTestContext>({ venvanseTakenAt: null, sleepHours: 7, mood: 3, feeling: 3 });
  const [contextFormOpen, setContextFormOpen] = useState(false);
  const preContextRef = useRef<PreTestContext | null>(null);
  useEffect(() => { preContextRef.current = preContext; }, [preContext]);
  useEffect(() => {
    getTodayPreContext()
      .then(ctx => { if (ctx) setContextDraft(ctx); })
      .catch(() => {/* keep defaults */});
  }, []);

  // --- Leitura + Recall mode ---
  // 'capture' shows the short AI text and just records gaze; 'recall' swaps in an
  // intermediate factual text and, after "Terminei de ler", runs a 6-question quiz.
  const [testMode, setTestMode] = useState<'capture' | 'recall'>('capture');
  const testModeRef = useRef<'capture' | 'recall'>('capture');
  const [recallContent, setRecallContent] = useState<RecallContent | null>(null);
  const recallContentRef = useRef<RecallContent | null>(null);
  const shortTextRef = useRef<string | null>(null);
  const [recallQuiz, setRecallQuiz] = useState<RecallQuestion[] | null>(null);
  const [recallGenState, setRecallGenState] = useState<'idle' | 'generating' | 'error'>('idle');
  const [recallOutcome, setRecallOutcome] = useState<{ score: number; total: number; topic: string } | null>(null);
  const lastRecallCaptureRef = useRef<{ captureId: string; readingDurationMs: number } | null>(null);
  const [calibrationSurfaceRect, setCalibrationSurfaceRect] = useState<SurfaceRect | null>(null);

  // Loop-local mutable state (refs so the rAF loop is created once).
  const streamRef = useRef<MediaStream | null>(null);
  const frameLoopRef = useRef<VideoFrameLoopHandle | null>(null);
  const runningRef = useRef(false);
  const liveRef = useRef<LiveSnapshot>(EMPTY_LIVE);
  const lastLivePushRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const coverageWindowRef = useRef<{ t: number; face: boolean }[]>([]);
  const visualSignalSamplesRef = useRef<VisualSignalSample[]>([]);
  const rawVEmaRef = useRef<number | null>(null);
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

  // Capture state.
  const capturingRef = useRef(false);
  const captureStartRef = useRef(0);
  // Calibrated predictions and raw iris ratios use different units/gains, so each
  // source accumulates in its own buffer; finishCapture analyzes the majority buffer
  // only (selectCaptureSeries) — mixing them creates unit jumps the detector reads
  // as fake saccades.
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
  // The frame loop closure is created once when the camera starts; reading conditions
  // through a ref keeps the auto-finish path (timer inside the loop) from persisting a
  // stale condition tag when the user changed lighting/posture after starting.
  const conditionsRef = useRef(conditions);
  useEffect(() => { conditionsRef.current = conditions; }, [conditions]);

  useEffect(() => { textRef.current = text; layoutRef.current = null; }, [text]);

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

  // Load reading content once.
  useEffect(() => {
    getReadingContent('facil')
      .then(generatedText => {
        const cleanText = generatedText.trim();
        if (!cleanText) throw new Error('empty generated reading text');
        shortTextRef.current = cleanText;
        setText(cleanText);
        setReadingTextState('ready');
      })
      .catch(() => {
        setText('Não foi possível gerar o texto de leitura por IA.');
        setReadingTextState('error');
      });
  }, []);

  const loadRecallText = () => {
    setReadingTextState('loading');
    setText('Gerando texto de leitura para recall…');
    setRecallContent(null);
    recallContentRef.current = null;
    getRecallText()
      .then(content => {
        setRecallContent(content);
        recallContentRef.current = content;
        setText(content.text);
        setReadingTextState('ready');
      })
      .catch(() => {
        setText('Não foi possível gerar o texto de recall por IA.');
        setReadingTextState('error');
      });
  };

  const switchMode = (mode: 'capture' | 'recall') => {
    if (mode === testMode || capturingRef.current) return;
    setTestMode(mode);
    testModeRef.current = mode;
    setRecallOutcome(null);
    if (mode === 'recall') {
      loadRecallText();
    } else if (shortTextRef.current) {
      setText(shortTextRef.current);
      setReadingTextState('ready');
    }
  };

  const handleQuizDone = (answers: number[], score: number) => {
    const content = recallContentRef.current;
    if (content && recallQuiz) {
      const result: RecallTestResult = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        topic: content.topic,
        text: content.text,
        questions: recallQuiz,
        answers,
        score,
        readingDurationMs: lastRecallCaptureRef.current?.readingDurationMs ?? 0,
        captureId: lastRecallCaptureRef.current?.captureId,
        context: preContextRef.current ?? undefined,
      };
      saveRecallTest(result).catch(() => {/* keep the on-screen result */});
      setRecallOutcome({ score, total: recallQuiz.length, topic: content.topic });
    }
    setRecallQuiz(null);
    // Fresh text for the next run — rereading the same passage would inflate recall.
    loadRecallText();
  };

  // Load saved validation captures once.
  useEffect(() => {
    getValidationCaptures().then(setCaptures).catch(() => {/* empty list */});
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

  const stopCamera = () => {
    runningRef.current = false;
    capturingRef.current = false;
    frozenFontPxRef.current = null;
    setCapturing(false);
    frameLoopRef.current?.stop();
    frameLoopRef.current = null;
    stopCameraStream();
    stopMotionSensor();
    resetPosturalBaseline();
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
    setLive(EMPTY_LIVE);
    setLiveSignal(EMPTY_VISUAL_SIGNAL);
    liveRef.current = EMPTY_LIVE;
    visualSignalSamplesRef.current = [];
  };

  useEffect(() => () => stopCamera(), []); // cleanup on unmount

  useEffect(() => {
    const id = window.setInterval(() => setMotionQuality(getMotionQuality()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (showCalibration) {
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
      runningRef.current = true;
      frameTimesRef.current = [];
      coverageWindowRef.current = [];
      visualSignalSamplesRef.current = [];
      frameLoopRef.current = startVideoFrameLoop(videoRef.current!, loop);
    }
  }, [showCalibration]);

  const startCamera = async () => {
    setCameraState('starting');
    setCaptureResult(null);
    const motionPermission = await requestMotionPermissionFromGesture();
    if (motionPermission === 'granted') {
      startMotionSensor();
      setMotionQuality(getMotionQuality());
    }
    await initFaceTracking();
    if (!isFaceTrackingActive()) {
      setCameraState('unavailable');
      return;
    }
    try {
      const stream = await getFrontCameraStream();
      streamRef.current = stream;
      if (videoRef.current) {
        await attachStream(videoRef.current, stream);
      }
    } catch {
      setCameraState('unavailable');
      return;
    }
    setCameraState('running');
    runningRef.current = true;
    frameTimesRef.current = [];
    coverageWindowRef.current = [];
    visualSignalSamplesRef.current = [];
    frameLoopRef.current?.stop();
    frameLoopRef.current = startVideoFrameLoop(videoRef.current!, loop);
  };

  const loop = (ts: number) => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState >= 2) {
      // One detection per frame; head pose, gaze and features share the cache.
      const pose = estimateHeadPose(video, ts);
      const gaze = estimateGaze(video, ts, ts);
      const faceFound = pose !== null;
      const eyesFound = gaze !== null;
      // Blink score is measured, but hard rejection is disabled by default until tuned
      // on real iPhone/Safari data. Coverage still counts the face either way.
      const blinking = shouldDropGazeForBlink(getBlinkScore());

      // Distance from IPD (detect already ran above) → font sized by visual angle so the
      // apparent text size is stable as the user leans in/out and across devices.
      const anchor = getDistanceAnchor();
      const ipdPx = interpupillaryPx(getLastLandmarks(), video.videoWidth || 1280, video.videoHeight || 720);
      const dEst = estimateDistanceCm(ipdPx, anchor, profileDistanceRef.current);
      distanceRef.current = distanceRef.current * 0.85 + dEst * 0.15; // EMA smoothing
      // Calibrated gaze is only trusted while the user stays near the distance the
      // model was calibrated at; outside the tolerance the mapping is extrapolating.
      const distanceOk = distanceWithinAnchorTolerance(distanceRef.current, anchor?.distanceCm ?? null);
      const fontPx = capturingRef.current && frozenFontPxRef.current != null
        ? frozenFontPxRef.current
        : Math.round(readingFontCssPx(fontAngleRef.current, distanceRef.current));

      // FPS over the last second.
      const ft = frameTimesRef.current;
      ft.push(ts);
      while (ft.length && ts - ft[0] > 1000) ft.shift();
      // Detection coverage over the last 2s.
      const cw = coverageWindowRef.current;
      cw.push({ t: ts, face: faceFound });
      while (cw.length && ts - cw[0].t > 2000) cw.shift();
      const coverage = cw.length ? (cw.filter(c => c.face).length / cw.length) * 100 : 0;

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
      // Slow EMA (~1.5s) of the raw vertical ratio: the amber dot's resting line,
      // stripped of frame jitter and blink dips.
      if (gaze) {
        rawVEmaRef.current = rawVEmaRef.current == null
          ? gaze.v
          : rawVEmaRef.current * 0.98 + gaze.v * 0.02;
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

      // Measured capture.
      if (capturingRef.current) {
        const tMs = ts - captureStartRef.current;
        captureTotalRef.current += 1;
        if (faceFound) captureFaceRef.current += 1;
        if (pose) posturalSamplesRef.current.push(toPosturalSample(pose));
        if (getMotionQuality().status === 'shaking') captureShakeRef.current = true;
        // Only real IPD-based estimates enter the provenance median; the profile
        // fallback would fake a measurement that never happened.
        if (ipdPx != null && anchor) captureDistanceSamplesRef.current.push(dEst);
        if (!blinking && dotExtrapolated) captureExtrapolatedRef.current += 1;
        if (!blinking && dotCalibrated && dot) {
          captureCalSamplesRef.current.push({ t: tMs, h: dot.x / cssW, v: dot.y / cssH });
        } else if (!blinking && gaze) {
          captureRawSamplesRef.current.push({ t: tMs, h: gaze.h, v: gaze.v });
        }
        if (tMs >= CAPTURE_SAFETY_CAP_MS) {
          finishCapture();
        } else if (ts - lastLivePushRef.current > 200) {
          setCaptureElapsed(tMs);
        }
      }

      // Throttled UI snapshot (~5/s) to avoid re-rendering every frame.
      const snap: LiveSnapshot = {
        faceFound, eyesFound,
        h: gaze ? gaze.h : null, v: gaze ? gaze.v : null,
        yaw: pose ? pose.yaw : null, pitch: pose ? pose.pitch : null, roll: pose ? pose.roll : null,
        fps: ft.length, coverage,
      };
      liveRef.current = snap;
      if (ts - lastLivePushRef.current > 200) {
        lastLivePushRef.current = ts;
        setLive(snap);
        setLiveSignal(summarizeFunctionalVisualSignal(visualSignalSamplesRef.current, { coverage }));
      }
    }
  };

  const startCapture = () => {
    setDrawerExpanded(false);
    if (readingTextState !== 'ready') return;
    // First capture of the session: collect the quick context before recording.
    if (!preContextRef.current) {
      setContextFormOpen(true);
      return;
    }
    // Freeze the stimulus geometry for the whole measurement window.
    frozenFontPxRef.current = Math.round(readingFontCssPx(fontAngleRef.current, distanceRef.current));
    capturingRef.current = true;
    captureStartRef.current = performance.now();
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
  };

  const finishCapture = () => {
    if (!capturingRef.current) return;
    capturingRef.current = false;
    frozenFontPxRef.current = null;
    setCapturing(false);
    const durationMs = performance.now() - captureStartRef.current;
    const series = selectCaptureSeries(captureCalSamplesRef.current, captureRawSamplesRef.current);
    const metrics = analyzeSaccades(series.samples, { signalSource: series.signalSource });
    const environment = buildCaptureEnvironment(metrics);
    const coverage = captureTotalRef.current
      ? (captureFaceRef.current / captureTotalRef.current) * 100
      : 0;
    const finalMotionQuality = getMotionQuality();
    const postural = summarizePosturalStability(posturalSamplesRef.current, {
      baseline: getPosturalBaseline(),
      motionHighMovement: captureShakeRef.current,
      motionStatus: finalMotionQuality.status,
      motionDeltaDeg: finalMotionQuality.deltaDeg,
      motionConfidence: finalMotionQuality.confidence,
      durationMs,
      faceCoverage: coverage,
    });
    setCaptureResult({
      metrics, coverage, postural, environment,
      calibratedSampleCount: series.calibratedSampleCount,
      rawSampleCount: series.rawSampleCount,
      extrapolatedSampleCount: captureExtrapolatedRef.current,
    });

    // Persist the tagged capture so PACK 1 thresholds can be calibrated on real data.
    const samples = series.samples.slice();
    const conditionsAtFinish = conditionsRef.current;
    // Geometric provenance: median of the live distance estimates (robust to blinks
    // and brief tracking losses) and the px/deg it implies, so normalized amplitudes
    // stay convertible to degrees offline.
    const distSamples = captureDistanceSamplesRef.current.slice().sort((a, b) => a - b);
    const distanceEstimatedCm = distSamples.length ? distSamples[Math.floor(distSamples.length / 2)] : undefined;
    const capture: ValidationCapture = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      conditions: conditionsAtFinish,
      context: preContextRef.current ?? undefined,
      coverage,
      calibrated: series.signalSource === 'calibrated-mediapipe',
      metrics,
      postural,
      axis: summarizeAxisSignal(samples),
      environment,
      sampleCount: samples.length,
      samples,
      distanceEstimatedCm,
      pxPerDegAtCapture: cssPxPerDeg(distanceEstimatedCm ?? conditionsAtFinish.distanceCm),
      canvasWidthPx: canvasRef.current?.clientWidth,
      orientation: currentOrientation(),
      calibratedSampleCount: series.calibratedSampleCount,
      rawSampleCount: series.rawSampleCount,
      extrapolatedSampleCount: captureExtrapolatedRef.current,
    };
    saveValidationCapture(capture)
      .then(() => setCaptures(prev => [capture, ...prev]))
      .catch(() => {/* keep the on-screen report even if persistence fails */});

    // Recall mode: the reading just ended, generate the quiz over the text that was
    // actually on screen. The capture above is saved either way — only the quiz is
    // at the mercy of the AI call.
    lastRecallCaptureRef.current = { captureId: capture.id, readingDurationMs: Math.round(durationMs) };
    if (testModeRef.current === 'recall' && recallContentRef.current) {
      setRecallGenState('generating');
      getRecallQuestions(recallContentRef.current.text)
        .then(questions => { setRecallQuiz(questions); setRecallGenState('idle'); })
        .catch(() => setRecallGenState('error'));
    }
  };

  const removeCapture = (id: string) => {
    deleteValidationCapture(id)
      .then(() => setCaptures(prev => prev.filter(c => c.id !== id)))
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

  const diagnosticsLayout = diagnosticsLayoutMode({ viewportWidth, hasTouch: IS_MOBILE });
  const isDesktopDiagnosticsLayout = diagnosticsLayout === 'desktop';
  const drawerVariant: DrawerVariant = isLandscape ? 'side' : 'sheet';
  // Effective display scale (OS scaling × browser zoom). On desktop, ≠100% means the
  // physical size of a CSS px differs from the 96dpi assumption behind the angular
  // stimulus sizes; the value is already persisted per capture via CaptureEnvironment.
  const displayScalePct = Math.round((typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) * 100);
  const diagnosticsSurface = computeDiagnosticsSurface({
    viewportWidth,
    viewportHeight,
    layoutMode: diagnosticsLayout,
    panelWidth: DIAGNOSTICS_PANEL_WIDTH_PX + DIAGNOSTICS_DESKTOP_GUTTER_PX,
    headerHeight: DIAGNOSTICS_HEADER_HEIGHT_PX,
  });
  const readingSurfaceStyle: React.CSSProperties | undefined = isDesktopDiagnosticsLayout
    ? {
      width: `${diagnosticsSurface.width}px`,
      height: `${diagnosticsSurface.height}px`,
      maxWidth: '100%',
      maxHeight: '100%',
    }
    : undefined;

  const beginCalibration = () => {
    // Cinto de segurança: o painel expandido é overlay (rect estável), mas calibrar
    // ou capturar com a gaveta aberta esconderia parte do estímulo.
    setDrawerExpanded(false);
    setCalibrationSurfaceRect(canvasRef.current ? rectFromElement(canvasRef.current) : null);
    setShowCalibration(true);
  };

  const buildCaptureEnvironment = (metrics: SaccadeMetrics): CaptureEnvironment | undefined => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return undefined;
    const telemetry = readCameraPipelineTelemetry(video, {
      detectionFps: liveRef.current.fps,
      ocularSampleRateHz: metrics.sampleRateHz,
    });
    const width = window.innerWidth;
    const height = window.innerHeight;
    return {
      layoutMode: diagnosticsLayout,
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
      rates: telemetry.measured,
    };
  };

  if (showCalibration) {
    return (
      <CalibrationOverlay
        viewingDistanceCm={profile?.viewingDistanceCm || 40}
        onComplete={() => setShowCalibration(false)}
        onSkip={() => setShowCalibration(false)}
        keepCameraOnClose
        surfaceRect={calibrationSurfaceRect ?? undefined}
      />
    );
  }

  const calibrated = isCalibrated();
  const accuracyDeg = getAccuracyDeg();
  const canStartCapture = cameraState === 'running' && readingTextState === 'ready';
  const captureBlockReason = readingTextState === 'loading'
    ? 'Aguardando texto de leitura por IA.'
    : readingTextState === 'error'
      ? 'Texto de leitura indisponível; capture depois que a IA responder.'
      : null;
  const captureSummary = captureResult
    ? summarizeReadingDynamics(captureResult.metrics, captureResult.coverage)
    : null;

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

  // Miolo de diagnóstico compartilhado entre o <aside> desktop e a gaveta compacta.
  const diagnosticsCards = (
    <>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Metric label="FPS detecção" value={live.fps ? String(live.fps) : '—'} />
        <Metric label="Cobertura" value={`${live.coverage.toFixed(0)}%`} />
        <Metric label="Olhar H" value={fmt(live.h)} />
        <Metric label="Olhar V" value={fmt(live.v)} />
        <Metric label="Yaw idx" value={live.yaw != null ? live.yaw.toFixed(0) : '—'} />
        <Metric label="Pitch idx" value={live.pitch != null ? live.pitch.toFixed(0) : '—'} />
        <Metric label="Delta pos." value={motionQuality.deltaDeg != null ? `${motionQuality.deltaDeg.toFixed(1)}°` : '—'} />
        <Metric label="Confiança" value={confidenceLabel(motionQuality.confidence)} />
      </div>

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
          <Metric label="Taxa janela" value={liveSignal.sampleRateHz ? `${liveSignal.sampleRateHz} Hz` : '—'} />
        </div>
        <p className="text-xs text-slate-400 mt-3">{liveSignal.detail}</p>
      </div>

      <details className="rounded-xl bg-slate-900/40 border border-white/10 px-3 py-2 text-xs text-slate-400">
        <summary className="cursor-pointer select-none font-bold text-slate-300">
          Como interpretar os indicadores
        </summary>
        <div className="mt-2">
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
        </div>
      </details>

      {/* PACK 2: tag the physical conditions so captures are comparable. */}
      <div className="rounded-xl bg-slate-900/50 border border-white/10 p-3 flex flex-col gap-3">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Condição da captura</div>
        <div>
          <div className="text-[11px] text-slate-500 mb-1">Iluminação</div>
          <div className="flex gap-1">
            {([['dim', 'Fraca'], ['normal', 'Normal'], ['bright', 'Forte']] as [ValidationLighting, string][]).map(([val, label]) => (
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
            {([['upright', 'Reta'], ['tilted', 'Inclinada'], ['slouched', 'Curvada'], ['reclined', 'Recostada']] as [ValidationPosture, string][]).map(([val, label]) => (
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
    </>
  );

  const modeSwitch = (
    <div className="grid grid-cols-2 gap-1 bg-white/5 rounded-xl p-1">
      <button
        onClick={() => switchMode('capture')}
        disabled={capturing}
        className={`px-2 py-2 rounded-lg text-xs font-bold transition-colors ${testMode === 'capture' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
      >Captura simples</button>
      <button
        onClick={() => switchMode('recall')}
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
    <button onClick={stopCamera} className="flex items-center justify-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200 text-sm">
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

  // Ações primárias na faixa colapsada: um toque sem abrir a gaveta. Versão
  // compacta (ícone) dos botões grandes que o desktop mantém no <aside>.
  const drawerActions = (
    <div className={`flex items-center gap-1.5 shrink-0 ${drawerVariant === 'side' ? 'flex-col' : ''}`}>
      <button
        onClick={beginCalibration}
        disabled={cameraState !== 'running' && cameraState !== 'idle'}
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
          onClick={finishCapture}
          aria-label="Terminei de ler"
          className="flex items-center gap-1 p-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold"
        >
          <Check className="w-4 h-4" />
          {drawerVariant === 'sheet' && <span>{Math.floor(captureElapsed / 1000)}s</span>}
        </button>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-slate-900 text-white overflow-hidden flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      {/* Hidden source video (mirrored preview is rendered in the panel). */}
      <video ref={videoRef} playsInline muted autoPlay className="hidden" />

      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-2 shrink-0">
        <button onClick={() => { stopCamera(); navigate('/'); }} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">Dinâmica ocular de leitura</h1>
        <span className="ml-auto text-xs text-slate-400 hidden sm:block">taxa medida por dispositivo · foco em sacadas e regressões</span>
      </header>

      {/* Main area: iPhone/touch stays stacked; only wide non-touch desktop gets a side panel. */}
      <div className={`flex-1 flex min-h-0 ${isDesktopDiagnosticsLayout ? 'flex-row justify-center gap-4 p-4' : isLandscape ? 'flex-row' : 'flex-col'}`}>
        <div
          className={`relative min-w-0 min-h-0 ${isDesktopDiagnosticsLayout ? 'self-center shrink-0 overflow-hidden rounded-2xl border-2 border-indigo-300/70 bg-slate-900/30 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_24px_70px_rgba(15,23,42,0.45)]' : 'flex-1'}`}
          style={readingSurfaceStyle}
          aria-label="Área fixa de leitura, captura e calibração"
        >
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-indigo-400/40">
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-100 shadow-lg backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-indigo-300" />
              Área fixa de leitura e calibração
            </div>
            {/* Desktop only: on the phone it collides with the left chip and the
                compact surface is the element itself, not the computed bounds. */}
            {isDesktopDiagnosticsLayout && (
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

        {/* Diagnostics panel: desktop mantém o <aside> lateral fixo; compacto usa a
            gaveta overlay colapsável pra superfície de leitura tomar a tela. */}
        {isDesktopDiagnosticsLayout ? (
        <aside className="w-72 border-l max-h-none shrink-0 bg-slate-800/80 border-white/10 p-4 flex flex-col gap-4">
          {/* Mirrored camera preview — desktop only; no phone os chips (Rosto/Olhos)
              já dão o feedback de enquadramento. */}
          <div className="shrink-0 rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
            {cameraState === 'running'
              ? <MirroredPreview stream={streamRef} streamId={streamRef.current?.id ?? ''} />
              : <span className="text-slate-500 text-sm">sem vídeo</span>}
          </div>

          <div className="shrink-0 flex flex-wrap gap-2">
            {chipData.map(c => <Chip key={c.label} ok={c.ok} label={c.label} neutral={c.neutral} />)}
            <Chip ok neutral label={`Escala ${displayScalePct}%`} />
          </div>

          {/* On desktop the preview/chips above and the action buttons below stay
              pinned; only this middle section scrolls, so the camera never leaves
              view while reaching the controls. -mr-4/pr-4 park a classic
              (non-overlay) scrollbar inside the panel's own padding so the cards
              keep the same width as the pinned rows. */}
          <div className="min-h-0 overflow-y-auto flex flex-col gap-4 -mr-4 pr-4 [scrollbar-width:thin]">
            {diagnosticsCards}
          </div>

          <div className="shrink-0 flex flex-col gap-2">
            {modeSwitch}

            <button
              onClick={beginCalibration}
              disabled={cameraState !== 'running' && cameraState !== 'idle'}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold"
            >
              <Crosshair className="w-4 h-4" /> {calibrated ? 'Recalibrar' : 'Calibrar'}
            </button>

            {!capturing ? (
              <button
                onClick={startCapture}
                disabled={!canStartCapture}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl font-bold"
              >
                <Play className="w-4 h-4" /> {testMode === 'recall' ? 'Ler e responder' : 'Iniciar captura de leitura'}
              </button>
            ) : (
              <button
                onClick={finishCapture}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold"
              >
                <Check className="w-4 h-4" /> Terminei de ler ({Math.floor(captureElapsed / 1000)}s)
              </button>
            )}
            {captureBlockReason && (
              <p className="text-xs text-amber-300 font-medium text-center px-2">{captureBlockReason}</p>
            )}

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
          {diagnosticsCards}
          {modeSwitch}
          {captureBlockReason && (
            <p className="text-xs text-amber-300 font-medium text-center px-2">{captureBlockReason}</p>
          )}
          {capturesButton}
          {stopCameraButton}
        </DiagnosticsDrawer>
        )}
      </div>

      {/* Quick pre-test context, asked before the first capture of the session */}
      {contextFormOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/90 p-6 overflow-y-auto">
          <div className="w-full max-w-2xl">
            <PreContextForm
              tone="dark"
              value={contextDraft}
              onChange={setContextDraft}
              submitLabel="Registrar e iniciar captura"
              onSubmit={() => {
                // The ref is set directly so the capture that starts right now (before
                // the state effect runs) already sees the context.
                preContextRef.current = contextDraft;
                setPreContext(contextDraft);
                setContextFormOpen(false);
                startCapture();
              }}
            />
            <button
              onClick={() => setContextFormOpen(false)}
              className="w-full mt-3 py-2 text-slate-400 hover:text-slate-200 text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Recall: question generation / quiz overlays (above the capture report) */}
      {recallGenState === 'generating' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 p-6">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-300 font-medium">Gerando questões sobre o texto…</p>
        </div>
      )}
      {recallGenState === 'error' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 p-6 text-center">
          <p className="text-rose-300 font-bold mb-2">Não foi possível gerar as questões.</p>
          <p className="text-slate-400 text-sm mb-6 max-w-md">A captura da leitura foi salva normalmente; só o questionário falhou. Tente outra rodada.</p>
          <button onClick={() => setRecallGenState('idle')} className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold">Fechar</button>
        </div>
      )}
      {recallQuiz && recallContent && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/95 p-4 overflow-y-auto">
          <RecallQuiz topic={recallContent.topic} questions={recallQuiz} onDone={handleQuizDone} />
        </div>
      )}

      {/* Capture report */}
      {captureResult && !recallQuiz && recallGenState === 'idle' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/90 p-6">
          <div className="bg-slate-800 rounded-3xl p-8 max-w-lg w-full border border-white/10">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-5 h-5 text-indigo-400" />
              <h2 className="text-2xl font-bold">Dinâmica ocular capturada</h2>
            </div>
            <p className="text-xs text-slate-400 mb-6">
              Estimativa experimental por webcam. Prioriza movimento relativo, ritmo e eventos
              de leitura; não promete palavra exata nem detecta microssacadas.
            </p>

            {recallOutcome && (
              <div className="rounded-2xl bg-indigo-500/15 border border-indigo-400/30 p-4 mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-1">Recall · {recallOutcome.topic}</div>
                  <div className="text-2xl font-bold text-white">{recallOutcome.score}/{recallOutcome.total} corretas</div>
                </div>
                <BookOpen className="w-8 h-8 text-indigo-300 shrink-0" />
              </div>
            )}

            {captureResult.metrics.trackingAvailable && captureSummary ? (
              <>
                <div className="rounded-2xl bg-slate-900/70 border border-white/10 p-4 mb-4">
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      captureSummary.signalQuality.tone === 'emerald'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : captureSummary.signalQuality.tone === 'rose'
                          ? 'bg-rose-500/15 text-rose-300'
                          : 'bg-amber-500/15 text-amber-300'
                    }`}>
                      {captureSummary.signalQuality.label}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 text-xs font-bold">
                      {captureSummary.signalQuality.sourceLabel}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-slate-700 text-slate-200 text-xs font-bold">
                      {captureSummary.signalQuality.sampleRateLabel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">{captureSummary.signalLabel} · {captureSummary.positionLabel}</p>
                  <p className="text-sm text-slate-200 font-medium">{captureSummary.primaryInsight}</p>
                  <p className="text-xs text-slate-400 mt-2">{captureSummary.confidenceNote}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Cobertura (rosto)" value={`${captureResult.coverage.toFixed(0)}%`} big />
                  <Metric label="Amostras válidas" value={String(captureResult.metrics.samplesValid)} big />
                  <Metric label="Taxa efetiva" value={captureResult.metrics.sampleRateHz ? `${captureResult.metrics.sampleRateHz} Hz` : 'N/D'} big />
                  <Metric label="Fonte" value={sourceConsistencyLabel(captureResult.metrics.signalSource, captureResult.calibratedSampleCount, captureResult.rawSampleCount)} big />
                  {(captureResult.extrapolatedSampleCount ?? 0) > 0 && (
                    <Metric label="Extrapolação rejeitada" value={`${captureResult.extrapolatedSampleCount} frames`} big />
                  )}
                  <Metric label="Sacadas" value={String(captureResult.metrics.saccadeCount)} big />
                  <Metric label="Regressões" value={String(captureResult.metrics.regressionCount)} big />
                  <Metric label="Retornos de linha" value={captureResult.metrics.lineReturnCount != null ? String(captureResult.metrics.lineReturnCount) : 'N/D'} big />
                  <Metric label="Amplitude média" value={captureResult.metrics.meanSaccadeAmplitude.toFixed(3)} big />
                  <Metric label="Fixação média" value={`${captureResult.metrics.meanFixationMs.toFixed(0)} ms`} big />
                </div>
                {captureResult.environment && (
                  <div className="rounded-2xl bg-slate-900/70 border border-white/10 p-4 mt-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Ambiente e câmera</h3>
                      <span className="px-2.5 py-1 rounded-full bg-slate-700 text-slate-200 text-xs font-bold">
                        {captureResult.environment.layoutMode === 'desktop' ? 'Layout desktop' : 'Layout compacto'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Metric label="Câmera negociada" value={cameraNegotiatedLabel(captureResult.environment)} />
                      <Metric label="Vídeo recebido" value={videoSizeLabel(captureResult.environment)} />
                      <Metric label="FPS câmera" value={rateLabel(captureResult.environment.camera.frameRate)} />
                      <Metric label="FPS detecção" value={rateLabel(captureResult.environment.rates.detectionFps)} />
                      <Metric label="Taxa ocular" value={rateLabel(captureResult.environment.rates.ocularSampleRateHz)} />
                      <Metric label="Superfície" value={surfaceSizeLabel(captureResult.environment)} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-amber-300 font-medium">
                Detecção insuficiente para estimar sacadas ({captureResult.metrics.samplesValid} amostras,
                cobertura {captureResult.coverage.toFixed(0)}%). Ajuste o enquadramento, a iluminação e a
                distância e tente novamente.
              </p>
            )}

            {captureResult.postural.status !== 'insufficient' && (
              <div className="rounded-2xl bg-slate-900/70 border border-white/10 p-4 mt-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    captureResult.postural.status === 'stable'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}>
                    {captureResult.postural.label}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-700 text-slate-200 text-xs font-bold">
                    Estabilidade cervical {captureResult.postural.cervicalStability}%
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-700 text-slate-200 text-xs font-bold">
                    {captureResult.postural.baselineApplied ? 'Baseline aplicado' : 'Sem baseline'}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">
                    Confiança {confidenceLabel(captureResult.postural.confidence)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Metric label="Delta aparelho" value={captureResult.postural.motionDeltaDeg != null ? `${captureResult.postural.motionDeltaDeg.toFixed(1)}°` : 'N/D'} />
                  <Metric label="Taxa postura" value={captureResult.postural.sampleRateHz ? `${captureResult.postural.sampleRateHz} Hz` : 'N/D'} />
                  <Metric label="Yaw Δ" value={captureResult.postural.baselineApplied ? captureResult.postural.yawOffset.toFixed(1) : 'N/D'} />
                  <Metric label="Pitch Δ" value={captureResult.postural.baselineApplied ? captureResult.postural.pitchOffset.toFixed(1) : 'N/D'} />
                </div>
                <p className="text-xs text-slate-400">{captureResult.postural.insight}</p>
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button onClick={() => { setCaptureResult(null); setRecallOutcome(null); }} className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold">
                Fechar
              </button>
              <button onClick={() => { setCaptureResult(null); setRecallOutcome(null); startCapture(); }} className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold">
                Nova captura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved validation captures */}
      {showCaptures && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/90 p-4">
          <div className="bg-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] flex flex-col border border-white/10">
            <div className="flex items-center gap-3 mb-1">
              <Database className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold">Capturas de validação</h2>
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
                      <CapStat label="Taxa" value={c.metrics.sampleRateHz ? `${c.metrics.sampleRateHz} Hz` : 'N/D'} />
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

      {/* On phones we nudge toward landscape: reading saccades are horizontal, so a wide
          line gives the webcam a bigger, cleaner signal. Gentle — portrait still works. */}
      {cameraState === 'running' && IS_MOBILE && !isLandscape && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-600/90 backdrop-blur text-sm font-semibold shadow-lg pointer-events-none max-w-[90%]">
          <RotateCcw className="w-4 h-4 shrink-0" />
          <span>Gire para paisagem — a leitura flui melhor deitada</span>
        </div>
      )}
    </div>
  );
}

function fmt(v: number | null): string {
  return v != null ? v.toFixed(2) : '—';
}

function rateLabel(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)} Hz` : 'N/D';
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

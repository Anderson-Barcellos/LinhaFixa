import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Eye, Play, Square, RotateCcw, Crosshair, Trash2, Database } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  initFaceTracking, isFaceTrackingActive, estimateHeadPose, estimateGaze, extractGazeFeatures, getLastLandmarks,
} from '@/services/faceTracking';
import {
  interpupillaryPx, estimateDistanceCm, getDistanceAnchor, readingFontCssPx, readingFontAngleDeg,
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
import { analyzeSaccades } from '@/exercises/saccadeAnalysis';
import { summarizeReadingDynamics } from '@/exercises/readingDynamics';
import {
  getPosturalBaseline,
  resetPosturalBaseline,
  summarizePosturalStability,
  type PosturalStabilityMetrics,
  type PosturalSample,
} from '@/exercises/posturalStability';
import { GazeSample, SaccadeMetrics, ValidationCapture, ValidationConditions, ValidationLighting, ValidationPosture } from '@/types';
import { saveValidationCapture, getValidationCaptures, deleteValidationCapture } from '@/services/storage';
import { summarizeAxisSignal, serializeValidationExport } from '@/services/validationCapture';
import { summarizeSaccadeSignalQuality } from '@/services/signalQuality';
import {
  summarizeFunctionalVisualSignal,
  type FunctionalVisualSignalSummary,
  type VisualSignalSample,
} from '@/services/visualSignal';
import { getReadingContent } from '@/services/contentGenerator';
import { startVideoFrameLoop, type VideoFrameLoopHandle } from '@/services/videoFrameLoop';
import {
  calibrationSignatureMatches,
  currentOrientation,
  fullViewportRect,
  rectFromElement,
  viewportNormToRectPoint,
} from '@/services/ocularSignalContract';

// Standalone diagnostics screen: shows reading text, runs the front camera and
// overlays a live gaze dot + detection status so we can validate that the eyes are
// actually being detected/tracked on the target device (iPhone Pro Max, landscape)
// before relying on the signal inside the exercises.

const CAPTURE_MS = 20000; // measured reading capture window

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
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= window.innerHeight : true
  );
  const [showCalibration, setShowCalibration] = useState(false);
  const [live, setLive] = useState<LiveSnapshot>(EMPTY_LIVE);
  const [text, setText] = useState('Carregando texto de leitura…');
  const [readingTextState, setReadingTextState] = useState<ReadingTextState>('loading');
  const [capturing, setCapturing] = useState(false);
  const [captureRemaining, setCaptureRemaining] = useState(0);
  const [captureResult, setCaptureResult] = useState<{ metrics: SaccadeMetrics; coverage: number; postural: PosturalStabilityMetrics } | null>(null);
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

  // Loop-local mutable state (refs so the rAF loop is created once).
  const streamRef = useRef<MediaStream | null>(null);
  const frameLoopRef = useRef<VideoFrameLoopHandle | null>(null);
  const runningRef = useRef(false);
  const liveRef = useRef<LiveSnapshot>(EMPTY_LIVE);
  const lastLivePushRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const coverageWindowRef = useRef<{ t: number; face: boolean }[]>([]);
  const visualSignalSamplesRef = useRef<VisualSignalSample[]>([]);
  const textRef = useRef(text);
  const layoutRef = useRef<{ w: number; h: number; font: number; lines: string[] } | null>(null);
  // Reading font is sized by visual angle: target angle (from preference) + the live
  // distance estimate. distanceRef is an EMA so the text doesn't "breathe" frame to frame.
  const fontAngleRef = useRef(readingFontAngleDeg(profile?.fontSizePreference || 'normal'));
  const profileDistanceRef = useRef(profile?.viewingDistanceCm ?? 40);
  const distanceRef = useRef(profile?.viewingDistanceCm ?? 40);

  // Capture state.
  const capturingRef = useRef(false);
  const captureStartRef = useRef(0);
  const captureSamplesRef = useRef<GazeSample[]>([]);
  const captureFaceRef = useRef(0);
  const captureTotalRef = useRef(0);
  const captureCalibratedSamplesRef = useRef(0);
  const captureRawSamplesRef = useRef(0);
  const posturalSamplesRef = useRef<PosturalSample[]>([]);
  const captureShakeRef = useRef(false);

  useEffect(() => { textRef.current = text; layoutRef.current = null; }, [text]);

  // Load reading content once.
  useEffect(() => {
    getReadingContent('facil')
      .then(generatedText => {
        const cleanText = generatedText.trim();
        if (!cleanText) throw new Error('empty generated reading text');
        setText(cleanText);
        setReadingTextState('ready');
      })
      .catch(() => {
        setText('Não foi possível gerar o texto de leitura por IA.');
        setReadingTextState('error');
      });
  }, []);

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

  // Track orientation (Safari iOS cannot lock it, so we detect and guide instead).
  useEffect(() => {
    const onResize = () => {
      setIsLandscape(window.innerWidth >= window.innerHeight);
      layoutRef.current = null; // re-wrap text on size change
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

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

      // Distance from IPD (detect already ran above) → font sized by visual angle so the
      // apparent text size is stable as the user leans in/out and across devices.
      const ipdPx = interpupillaryPx(getLastLandmarks(), video.videoWidth || 1280, video.videoHeight || 720);
      const dEst = estimateDistanceCm(ipdPx, getDistanceAnchor(), profileDistanceRef.current);
      distanceRef.current = distanceRef.current * 0.85 + dEst * 0.15; // EMA smoothing
      const fontPx = Math.round(readingFontCssPx(fontAngleRef.current, distanceRef.current));

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
            surfaceRect: fullViewportRect(viewportWidth, viewportHeight),
            videoWidth: video.videoWidth || trackSettings?.width,
            videoHeight: video.videoHeight || trackSettings?.height,
            trackFrameRate: trackSettings?.frameRate,
          });
          const localPoint = viewportNormToRectPoint(
            norm,
            rectFromElement(canvas),
            { width: viewportWidth, height: viewportHeight }
          );
          if (signatureStatus.matches && localPoint.inBounds) {
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
        const sample = dotCalibrated
          ? { t: ts, h: dot.x / cssW, v: dot.y / cssH, calibrated: true }
          : { t: ts, h: dot.x / cssW, v: dot.y / cssH, calibrated: false };
        const samples = visualSignalSamplesRef.current;
        samples.push(sample);
        while (samples.length && ts - samples[0].t > 2600) samples.shift();
        drawFunctionalSignalTrace(ctx, samples, cssW, cssH, isDark, dotCalibrated);
      }
      if (dot) {
        const color = dotCalibrated ? '#2563eb' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = color + '33';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      // Measured capture.
      if (capturingRef.current) {
        const tMs = ts - captureStartRef.current;
        captureTotalRef.current += 1;
        if (faceFound) captureFaceRef.current += 1;
        if (pose) posturalSamplesRef.current.push({ yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll });
        if (getMotionQuality().status === 'shaking') captureShakeRef.current = true;
        if (dotCalibrated && dot) {
          captureSamplesRef.current.push({ t: tMs, h: dot.x / cssW, v: dot.y / cssH });
          captureCalibratedSamplesRef.current += 1;
        } else if (gaze) {
          captureSamplesRef.current.push({ t: tMs, h: gaze.h, v: gaze.v });
          captureRawSamplesRef.current += 1;
        }
        const remaining = Math.max(0, CAPTURE_MS - tMs);
        if (remaining <= 0) {
          finishCapture();
        } else if (ts - lastLivePushRef.current > 200) {
          setCaptureRemaining(remaining);
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
    if (readingTextState !== 'ready') return;
    capturingRef.current = true;
    captureStartRef.current = performance.now();
    captureSamplesRef.current = [];
    captureFaceRef.current = 0;
    captureTotalRef.current = 0;
    captureCalibratedSamplesRef.current = 0;
    captureRawSamplesRef.current = 0;
    posturalSamplesRef.current = [];
    captureShakeRef.current = false;
    setCaptureResult(null);
    setCaptureRemaining(CAPTURE_MS);
    setCapturing(true);
  };

  const finishCapture = () => {
    if (!capturingRef.current) return;
    capturingRef.current = false;
    setCapturing(false);
    const durationMs = performance.now() - captureStartRef.current;
    const signalSource = captureCalibratedSamplesRef.current > 0
      ? 'calibrated-mediapipe'
      : captureRawSamplesRef.current > 0
        ? 'raw-mediapipe'
        : 'unavailable';
    const metrics = analyzeSaccades(captureSamplesRef.current, { signalSource });
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
    setCaptureResult({ metrics, coverage, postural });

    // Persist the tagged capture so PACK 1 thresholds can be calibrated on real data.
    const samples = captureSamplesRef.current.slice();
    const capture: ValidationCapture = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      conditions,
      coverage,
      calibrated: signalSource === 'calibrated-mediapipe',
      metrics,
      postural,
      axis: summarizeAxisSignal(samples),
      sampleCount: samples.length,
      samples,
    };
    saveValidationCapture(capture)
      .then(() => setCaptures(prev => [capture, ...prev]))
      .catch(() => {/* keep the on-screen report even if persistence fails */});
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

  if (showCalibration) {
    return (
      <CalibrationOverlay
        viewingDistanceCm={profile?.viewingDistanceCm || 40}
        onComplete={() => setShowCalibration(false)}
        onSkip={() => setShowCalibration(false)}
        keepCameraOnClose
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

  const Chip = ({ ok, label, neutral }: { ok: boolean; label: string; neutral?: boolean }) => (
    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
      neutral ? 'bg-slate-700 text-slate-200'
        : ok ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
             : 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
    }`}>{label}</span>
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

      {/* Main area: reading canvas + diagnostics panel (stacked on phones, side-by-side on desktop) */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <div className="relative flex-1 min-w-0 min-h-0">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
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

        {/* Diagnostics panel */}
        <aside className="w-full md:w-72 shrink-0 bg-slate-800/80 border-t md:border-t-0 md:border-l border-white/10 p-4 overflow-y-auto flex flex-col gap-4 max-h-[42vh] md:max-h-none">
          {/* Mirrored camera preview */}
          <div className="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
            {cameraState === 'running'
              ? <MirroredPreview stream={streamRef} streamId={streamRef.current?.id ?? ''} />
              : <span className="text-slate-500 text-sm">sem vídeo</span>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip ok={cameraState === 'running'} label={cameraState === 'running' ? 'Câmera' : 'Câmera off'} />
            <Chip ok={live.faceFound} label="Rosto" />
            <Chip ok={live.eyesFound} label="Olhos" />
            <Chip ok={calibrated} label={calibrated ? `Calib ~${accuracyDeg != null ? accuracyDeg.toFixed(1) : '?'}°` : 'Sem calib'} neutral={!calibrated} />
            <Chip
              ok={motionQuality.status === 'stable'}
              label={motionStatusLabel(motionQuality.status)}
              neutral={motionQuality.status === 'unavailable'}
            />
          </div>

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

          <div className="text-xs text-slate-400">
            Horizontal é o eixo principal da leitura; vertical/diagonal fica como contexto.
            <br />
            O traço inferior mostra a captação funcional do movimento; a bolinha pequena é só apoio técnico.
            <br />
            <span className="text-blue-400 font-bold">Azul</span> = sinal calibrado ·{' '}
            <span className="text-amber-400 font-bold">âmbar</span> = sinal bruto
            <br />
            Motion Assist sinaliza mudança do iPhone desde a calibração; não corrige o olhar automaticamente.
          </div>

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

          <div className="mt-auto flex flex-col gap-2">
            <button
              onClick={() => setShowCalibration(true)}
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
                <Play className="w-4 h-4" /> Iniciar captura ({CAPTURE_MS / 1000}s)
              </button>
            ) : (
              <button
                onClick={finishCapture}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold"
              >
                <Square className="w-4 h-4" /> Parar ({Math.ceil(captureRemaining / 1000)}s)
              </button>
            )}
            {captureBlockReason && (
              <p className="text-xs text-amber-300 font-medium text-center px-2">{captureBlockReason}</p>
            )}

            <button
              onClick={() => { setExportNote(null); setShowCaptures(true); }}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm"
            >
              <Database className="w-4 h-4" /> Capturas salvas ({captures.length})
            </button>

            {cameraState === 'running' && (
              <button onClick={stopCamera} className="flex items-center justify-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200 text-sm">
                <RotateCcw className="w-4 h-4" /> Parar câmera
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* Capture report */}
      {captureResult && (
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
                  <Metric label="Fonte" value={captureResult.metrics.signalSource === 'calibrated-mediapipe' ? 'Calibrada' : captureResult.metrics.signalSource === 'raw-mediapipe' ? 'Bruta' : 'N/D'} big />
                  <Metric label="Sacadas" value={String(captureResult.metrics.saccadeCount)} big />
                  <Metric label="Regressões" value={String(captureResult.metrics.regressionCount)} big />
                  <Metric label="Amplitude média" value={captureResult.metrics.meanSaccadeAmplitude.toFixed(3)} big />
                  <Metric label="Fixação média" value={`${captureResult.metrics.meanFixationMs.toFixed(0)} ms`} big />
                </div>
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
              <button onClick={() => setCaptureResult(null)} className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold">
                Fechar
              </button>
              <button onClick={() => { setCaptureResult(null); startCapture(); }} className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold">
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
                      <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-[11px] font-bold">{quality.sourceLabel}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${c.postural.status === 'stable' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{c.postural.label}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-[11px] font-bold">{c.postural.baselineApplied ? 'Baseline' : 'Sem baseline'}</span>
                      <button onClick={() => removeCapture(c.id)} className="ml-auto p-1.5 text-slate-500 hover:text-rose-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 text-center">
                      <CapStat label="Cobertura" value={`${c.coverage.toFixed(0)}%`} />
                      <CapStat label="Taxa" value={c.metrics.sampleRateHz ? `${c.metrics.sampleRateHz} Hz` : 'N/D'} />
                      <CapStat label="Sacadas" value={String(c.metrics.saccadeCount)} />
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

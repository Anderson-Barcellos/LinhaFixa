import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Eye, Play, Square, RotateCcw, Crosshair } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import {
  initFaceTracking, isFaceTrackingActive, estimateHeadPose, estimateGaze, extractGazeFeatures,
} from '@/services/faceTracking';
import { isCalibrated, predictNorm, getAccuracyDeg } from '@/services/gazeCalibration';
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
import { GazeSample, SaccadeMetrics } from '@/types';
import { getReadingContent } from '@/services/contentGenerator';

// Standalone diagnostics screen: shows reading text, runs the front camera and
// overlays a live gaze dot + detection status so we can validate that the eyes are
// actually being detected/tracked on the target device (iPhone Pro Max, landscape)
// before relying on the signal inside the exercises.

const CAPTURE_MS = 20000; // measured reading capture window

function readingFontPx(pref: string): number {
  switch (pref) {
    case 'small': return 26;
    case 'large': return 40;
    case 'huge': return 48;
    default: return 32; // 'normal'
  }
}

type CameraState = 'idle' | 'starting' | 'running' | 'unavailable';

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

export function EyeTrackingTestScreen() {
  const navigate = useNavigate();
  const { profile } = useAppStore();
  const fontPx = readingFontPx(profile?.fontSizePreference || 'normal');
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
  const [capturing, setCapturing] = useState(false);
  const [captureRemaining, setCaptureRemaining] = useState(0);
  const [captureResult, setCaptureResult] = useState<{ metrics: SaccadeMetrics; coverage: number } | null>(null);
  const [motionQuality, setMotionQuality] = useState<MotionQuality>(() => getMotionQuality());

  // Loop-local mutable state (refs so the rAF loop is created once).
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const liveRef = useRef<LiveSnapshot>(EMPTY_LIVE);
  const lastLivePushRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const coverageWindowRef = useRef<{ t: number; face: boolean }[]>([]);
  const textRef = useRef(text);
  const layoutRef = useRef<{ w: number; h: number; font: number; lines: string[] } | null>(null);

  // Capture state.
  const capturingRef = useRef(false);
  const captureStartRef = useRef(0);
  const captureSamplesRef = useRef<GazeSample[]>([]);
  const captureFaceRef = useRef(0);
  const captureTotalRef = useRef(0);

  useEffect(() => { textRef.current = text; layoutRef.current = null; }, [text]);

  // Load reading content once.
  useEffect(() => {
    getReadingContent('facil').then(setText).catch(() => {/* keep placeholder */});
  }, []);

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
    cancelAnimationFrame(rafRef.current);
    stopCameraStream();
    stopMotionSensor();
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
    setLive(EMPTY_LIVE);
    liveRef.current = EMPTY_LIVE;
  };

  useEffect(() => () => stopCamera(), []); // cleanup on unmount

  useEffect(() => {
    const id = window.setInterval(() => setMotionQuality(getMotionQuality()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (showCalibration) return;
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
      rafRef.current = requestAnimationFrame(loop);
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
    rafRef.current = requestAnimationFrame(loop);
  };

  const loop = () => {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState >= 2) {
      const ts = performance.now();

      // One detection per frame; head pose, gaze and features share the cache.
      const pose = estimateHeadPose(video, ts);
      const gaze = estimateGaze(video, ts, ts);
      const faceFound = pose !== null;
      const eyesFound = gaze !== null;

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
        if (norm) { dot = { x: norm.x * cssW, y: norm.y * cssH }; dotCalibrated = true; }
      }
      if (!dot && gaze) {
        // Raw iris ratios mapped linearly to the canvas — uncalibrated direction only.
        dot = { x: gaze.h * cssW, y: gaze.v * cssH };
      }
      if (dot) {
        const color = dotCalibrated ? '#2563eb' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = color + '33';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      // Measured capture.
      if (capturingRef.current) {
        const tMs = ts - captureStartRef.current;
        captureTotalRef.current += 1;
        if (faceFound) captureFaceRef.current += 1;
        if (dotCalibrated && dot) {
          captureSamplesRef.current.push({ t: tMs, h: dot.x / cssW, v: dot.y / cssH });
        } else if (gaze) {
          captureSamplesRef.current.push({ t: tMs, h: gaze.h, v: gaze.v });
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
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  };

  const startCapture = () => {
    capturingRef.current = true;
    captureStartRef.current = performance.now();
    captureSamplesRef.current = [];
    captureFaceRef.current = 0;
    captureTotalRef.current = 0;
    setCaptureResult(null);
    setCaptureRemaining(CAPTURE_MS);
    setCapturing(true);
  };

  const finishCapture = () => {
    if (!capturingRef.current) return;
    capturingRef.current = false;
    setCapturing(false);
    const metrics = analyzeSaccades(captureSamplesRef.current);
    const coverage = captureTotalRef.current
      ? (captureFaceRef.current / captureTotalRef.current) * 100
      : 0;
    setCaptureResult({ metrics, coverage });
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
        <span className="ml-auto text-xs text-slate-400 hidden sm:block">webcam ~30Hz · foco em sacadas e regressões</span>
      </header>

      {/* Main area: reading canvas + diagnostics panel */}
      <div className="flex-1 flex min-h-0">
        <div className="relative flex-1 min-w-0">
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
        <aside className="w-72 shrink-0 bg-slate-800/80 border-l border-white/10 p-4 overflow-y-auto flex flex-col gap-4">
          {/* Mirrored camera preview */}
          <div className="rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
            {cameraState === 'running'
              ? <MirroredPreview stream={streamRef} />
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
            <Metric label="Yaw" value={live.yaw != null ? `${live.yaw.toFixed(0)}°` : '—'} />
            <Metric label="Pitch" value={live.pitch != null ? `${live.pitch.toFixed(0)}°` : '—'} />
            <Metric label="Delta pos." value={motionQuality.deltaDeg != null ? `${motionQuality.deltaDeg.toFixed(1)}°` : '—'} />
            <Metric label="Confiança" value={confidenceLabel(motionQuality.confidence)} />
          </div>

          <div className="text-xs text-slate-400">
            Horizontal é o eixo principal da leitura; vertical/diagonal fica como contexto.
            <br />
            Ponto <span className="text-blue-400 font-bold">azul</span> = posição calibrada ·{' '}
            <span className="text-amber-400 font-bold">âmbar</span> = movimento bruto
            <br />
            Motion Assist sinaliza mudança do iPhone desde a calibração; não corrige o olhar automaticamente.
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
                disabled={cameraState !== 'running'}
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
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                      {captureSummary.signalLabel}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 text-xs font-bold">
                      {captureSummary.positionLabel}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 font-medium">{captureSummary.primaryInsight}</p>
                  <p className="text-xs text-slate-400 mt-2">{captureSummary.confidenceNote}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Cobertura (rosto)" value={`${captureResult.coverage.toFixed(0)}%`} big />
                  <Metric label="Amostras válidas" value={String(captureResult.metrics.samplesValid)} big />
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

      {/* Require landscape on phones */}
      {cameraState === 'running' && !isLandscape && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-center p-8">
          <RotateCcw className="w-14 h-14 text-indigo-400 mb-6 animate-pulse" />
          <h2 className="text-2xl font-bold mb-2">Gire o aparelho</h2>
          <p className="text-slate-300 max-w-xs">
            Este teste é otimizado para <span className="font-bold">landscape</span> (deitado).
            Vire o iPhone para continuar.
          </p>
        </div>
      )}
    </div>
  );
}

function fmt(v: number | null): string {
  return v != null ? v.toFixed(2) : '—';
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

function Metric({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="bg-slate-900/60 rounded-xl px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`font-bold ${big ? 'text-xl' : 'text-base'}`}>{value}</div>
    </div>
  );
}

// Small live preview of the active stream, mirrored like a selfie camera.
function MirroredPreview({ stream }: { stream: React.MutableRefObject<MediaStream | null> }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream.current) {
      ref.current.srcObject = stream.current;
      ref.current.play().catch(() => {});
    }
  });
  return <video ref={ref} playsInline muted autoPlay className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />;
}

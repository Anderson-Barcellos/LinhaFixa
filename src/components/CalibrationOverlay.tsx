import React, { useEffect, useRef, useState } from 'react';
import { initFaceTracking, isFaceTrackingActive, extractGazeFeatures, getLastLandmarks, estimateHeadPose } from '@/services/faceTracking';
import {
  resetCalibration, addCalibrationSample, fitCalibration, predictNorm, setAccuracyDeg, setCalibrationSignature,
} from '@/services/gazeCalibration';
import { interpupillaryPx, setDistanceAnchor, resetDistanceAnchor } from '@/services/viewingGeometry';
import { attachStream, getFrontCameraStream, stopCameraStream } from '@/services/cameraStream';
import { setMotionBaseline, stopMotionSensor } from '@/services/motionSensor';
import {
  resetPosturalBaseline,
  setPosturalBaseline,
  summarizePosturalBaseline,
  type PosturalSample,
} from '@/exercises/posturalStability';
import { startVideoFrameLoop, type VideoFrameLoopHandle } from '@/services/videoFrameLoop';
import { currentOrientation, fullViewportRect } from '@/services/ocularSignalContract';

interface CalibrationOverlayProps {
  viewingDistanceCm: number;
  onComplete: () => void; // calibrated successfully and user chose to continue
  onSkip: () => void;      // proceed without eye metrics
  keepCameraOnClose?: boolean;
}

// Normalized screen positions (0..1) for the calibration grid and validation checks.
const CALIB_POINTS = [
  { x: 0.14, y: 0.18 }, { x: 0.5, y: 0.18 }, { x: 0.86, y: 0.18 },
  { x: 0.14, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.86, y: 0.5 },
  { x: 0.14, y: 0.82 }, { x: 0.5, y: 0.82 }, { x: 0.86, y: 0.82 },
];
const VALID_POINTS = [
  { x: 0.32, y: 0.32 }, { x: 0.68, y: 0.32 }, { x: 0.5, y: 0.5 },
  { x: 0.32, y: 0.68 }, { x: 0.68, y: 0.68 },
];

const SETTLE_MS = 450;          // let the eyes land on a new dot before collecting
const MIN_POINT_MS = 550;       // avoid advancing from a burst of adjacent frames
const MAX_POINT_MS = 2200;      // avoid hanging forever on dropped video frames
const MIN_SAMPLES_PER_POINT = 12;
const PX_PER_CM = 37.8;         // CSS reference (~96 dpi); used only for the deg readout

type Phase = 'warmup' | 'calibrating' | 'validating' | 'done' | 'unavailable';

export function CalibrationOverlay({ viewingDistanceCm, onComplete, onSkip, keepCameraOnClose = false }: CalibrationOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('warmup');
  const [mode, setMode] = useState<'calib' | 'valid'>('calib');
  const [index, setIndex] = useState(0);
  const [accuracyDeg, setAccuracy] = useState<number | null>(null);

  // Transient per-point state lives in refs so the rAF loop is not re-created.
  const runningRef = useRef(true);
  const phaseRef = useRef<Phase>('warmup');
  const modeRef = useRef<'calib' | 'valid'>('calib');
  const idxRef = useRef(0);
  const pointStartRef = useRef(0);
  const collectedRef = useRef(0);
  const validErrorsRef = useRef<number[]>([]);
  const validAccumRef = useRef<{ x: number; y: number; n: number }>({ x: 0, y: 0, n: 0 });
  // IPD (px) samples gathered across the routine; their median anchors distance estimation.
  const ipdSamplesRef = useRef<number[]>([]);
  const posturalSamplesRef = useRef<PosturalSample[]>([]);
  // Trigger a re-render to nudge progress without spamming state every frame.
  const [, setTick] = useState(0);

  const pxPerDeg = 2 * viewingDistanceCm * Math.tan((1 * Math.PI / 180) / 2) * PX_PER_CM;

  useEffect(() => {
    let frameLoop: VideoFrameLoopHandle | null = null;
    runningRef.current = true;

    const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };
    const setModeBoth = (m: 'calib' | 'valid') => { modeRef.current = m; setMode(m); };
    const setIdxBoth = (i: number) => { idxRef.current = i; setIndex(i); };

    const startPoint = () => {
      pointStartRef.current = performance.now();
      collectedRef.current = 0;
      validAccumRef.current = { x: 0, y: 0, n: 0 };
    };

    const setup = async () => {
      resetCalibration();
      resetDistanceAnchor();
      resetPosturalBaseline();
      ipdSamplesRef.current = [];
      posturalSamplesRef.current = [];
      await initFaceTracking();
      if (!isFaceTrackingActive()) {
        setPhaseBoth('unavailable');
        return;
      }
      try {
        const stream = await getFrontCameraStream();
        if (videoRef.current) {
          await attachStream(videoRef.current, stream);
        }
      } catch {
        setPhaseBoth('unavailable');
        return;
      }

      setPhaseBoth('calibrating');
      setModeBoth('calib');
      setIdxBoth(0);
      startPoint();
      if (videoRef.current) {
        frameLoop = startVideoFrameLoop(videoRef.current, loop);
      }
    };

    const loop = () => {
      if (!runningRef.current) return;
      const video = videoRef.current;
      const phaseNow = phaseRef.current;

      if (video && video.readyState >= 2 && (phaseNow === 'calibrating' || phaseNow === 'validating')) {
        const points = phaseNow === 'calibrating' ? CALIB_POINTS : VALID_POINTS;
        const target = points[idxRef.current];
        const elapsed = performance.now() - pointStartRef.current;

        if (elapsed >= SETTLE_MS) {
          const now = performance.now();
          const feat = extractGazeFeatures(video, now);
          const pose = estimateHeadPose(video, now);
          if (pose) {
            posturalSamplesRef.current.push({ yaw: pose.yaw, pitch: pose.pitch, roll: pose.roll });
          }
          if (feat) {
            // detect() just ran inside extractGazeFeatures, so the landmarks are fresh.
            const ipd = interpupillaryPx(getLastLandmarks(), video.videoWidth || 1280, video.videoHeight || 720);
            if (ipd) ipdSamplesRef.current.push(ipd);
            if (phaseNow === 'calibrating') {
              addCalibrationSample(feat, target);
            } else {
              const pred = predictNorm(feat);
              if (pred) {
                validAccumRef.current.x += pred.x;
                validAccumRef.current.y += pred.y;
                validAccumRef.current.n += 1;
              }
            }
            collectedRef.current += 1;
          }

          const collectionElapsed = elapsed - SETTLE_MS;
          const hasEnoughSamples = collectedRef.current >= MIN_SAMPLES_PER_POINT && collectionElapsed >= MIN_POINT_MS;
          const timedOutWithSignal = collectedRef.current > 0 && collectionElapsed >= MAX_POINT_MS;

          if (hasEnoughSamples || timedOutWithSignal) {
            // Close out validation point: record its mean prediction error.
            if (phaseNow === 'validating' && validAccumRef.current.n > 0) {
              const mx = validAccumRef.current.x / validAccumRef.current.n;
              const my = validAccumRef.current.y / validAccumRef.current.n;
              const errPx = Math.hypot(
                (mx - target.x) * window.innerWidth,
                (my - target.y) * window.innerHeight
              );
              validErrorsRef.current.push(errPx / pxPerDeg);
            }

            const nextIdx = idxRef.current + 1;
            if (nextIdx < points.length) {
              setIdxBoth(nextIdx);
              startPoint();
            } else if (phaseNow === 'calibrating') {
              // Fit the model, then move to validation.
              const ok = fitCalibration();
              if (!ok) {
                setPhaseBoth('unavailable');
              } else {
                validErrorsRef.current = [];
                setPhaseBoth('validating');
                setModeBoth('valid');
                setIdxBoth(0);
                startPoint();
              }
            } else {
              // Validation finished: compute and store accuracy. The loop keeps
              // idling (rescheduled below) so "Recalibrar" can resume it.
              const errs = validErrorsRef.current;
              const meanDeg = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
              setAccuracyDeg(meanDeg);
              setAccuracy(meanDeg);
              // Anchor distance estimation: median IPD (robust to blinks) at the profile distance.
              const ipds = ipdSamplesRef.current.slice().sort((a, b) => a - b);
              if (ipds.length) {
                const medianIpd = ipds[Math.floor(ipds.length / 2)];
                setDistanceAnchor({ distanceCm: viewingDistanceCm, ipdPx: medianIpd });
              }
              const trackSettings = ((video.srcObject as MediaStream | null)?.getVideoTracks()[0])?.getSettings?.();
              const viewportWidth = window.innerWidth;
              const viewportHeight = window.innerHeight;
              setCalibrationSignature({
                viewportWidth,
                viewportHeight,
                orientation: currentOrientation(viewportWidth, viewportHeight),
                devicePixelRatio: window.devicePixelRatio || 1,
                surfaceRect: fullViewportRect(viewportWidth, viewportHeight),
                videoWidth: video.videoWidth || trackSettings?.width,
                videoHeight: video.videoHeight || trackSettings?.height,
                trackFrameRate: trackSettings?.frameRate,
              });
              setPosturalBaseline(summarizePosturalBaseline(posturalSamplesRef.current));
              setMotionBaseline('calibration');
              setPhaseBoth('done');
            }
          }
        }
        setTick(t => (t + 1) % 1000);
      }
    };

    setup();

    return () => {
      runningRef.current = false;
      frameLoop?.stop();
      if (!keepCameraOnClose) {
        stopCameraStream();
        stopMotionSensor();
      }
    };
  }, [keepCameraOnClose, pxPerDeg]);

  const restart = () => {
    // Re-run the whole flow by remounting the loop via a phase reset.
    resetCalibration();
    resetDistanceAnchor();
    resetPosturalBaseline();
    ipdSamplesRef.current = [];
    posturalSamplesRef.current = [];
    validErrorsRef.current = [];
    phaseRef.current = 'calibrating';
    modeRef.current = 'calib';
    idxRef.current = 0;
    pointStartRef.current = performance.now();
    collectedRef.current = 0;
    validAccumRef.current = { x: 0, y: 0, n: 0 };
    setAccuracy(null);
    setMode('calib');
    setIndex(0);
    setPhase('calibrating');
  };

  const points = mode === 'calib' ? CALIB_POINTS : VALID_POINTS;
  const target = points[Math.min(index, points.length - 1)];
  const totalThisMode = points.length;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900 overflow-hidden"
      style={{
        width: '100dvw',
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      <video ref={videoRef} playsInline muted className="hidden" />

      {(phase === 'calibrating' || phase === 'validating') && (
        <>
          {/* The moving dot the user must follow with their eyes. */}
          <div
            className="absolute w-5 h-5 md:w-6 md:h-6 rounded-full bg-blue-400 ring-4 ring-blue-400/30 -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
          >
            <div className="absolute inset-0 rounded-full bg-blue-200 animate-ping opacity-60" />
          </div>
          <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2 text-center text-white px-4">
            <p className="text-base md:text-xl font-semibold mb-1">
              {phase === 'calibrating' ? 'Calibrando posição do olhar' : 'Verificando mapeamento'}
            </p>
            <p className="text-slate-400 text-xs md:text-sm whitespace-nowrap">
              Olhe para o ponto azul e siga-o sem mover a cabeça · {index + 1}/{totalThisMode}
            </p>
          </div>
        </>
      )}

      {phase === 'warmup' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-6">
          <div className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6" />
          <p className="text-xl font-medium text-slate-200">Preparando a câmera…</p>
        </div>
      )}

      {phase === 'unavailable' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-6">
          <h2 className="text-3xl font-bold mb-4">Calibração indisponível</h2>
          <p className="text-slate-300 max-w-md mb-8">
            Não foi possível usar a câmera para calibrar o olhar (permissão negada ou
            rosto não detectado). Os exercícios funcionam normalmente, mas sem as
            métricas oculares.
          </p>
          <button onClick={onSkip} className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-lg font-bold">
            Continuar sem métricas
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-6">
          <h2 className="text-3xl font-bold mb-3">Calibração concluída</h2>
          <p className="text-slate-300 max-w-md mb-2">
            Erro espacial estimado:&nbsp;
            <span className="font-bold text-blue-300">
              {accuracyDeg != null ? `~${accuracyDeg.toFixed(1)}°` : 'não medida'}
            </span>
          </p>
          <p className="text-slate-500 text-sm max-w-md mb-8">
            A calibração ajuda a posicionar o ponto na tela. A análise de leitura
            continua priorizando movimento relativo, sacadas e regressões.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button onClick={onComplete} className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-lg font-bold">
              Continuar
            </button>
            <button onClick={restart} className="px-10 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl text-lg font-bold">
              Recalibrar
            </button>
            <button onClick={onSkip} className="px-6 py-4 text-slate-400 hover:text-slate-200 rounded-2xl text-lg font-medium">
              Pular
            </button>
          </div>
        </div>
      )}

      {(phase === 'calibrating' || phase === 'validating') && (
        <button onClick={onSkip} className="absolute bottom-3 md:bottom-6 right-4 md:right-6 px-5 py-2 text-slate-400 hover:text-slate-200 text-sm">
          Pular calibração
        </button>
      )}
    </div>
  );
}

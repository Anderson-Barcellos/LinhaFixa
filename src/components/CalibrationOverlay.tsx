import React, { useEffect, useRef, useState } from 'react';
import { initFaceTracking, isFaceTrackingActive, extractGazeFeatures } from '@/services/faceTracking';
import {
  resetCalibration, addCalibrationSample, fitCalibration, predictNorm, setAccuracyDeg,
} from '@/services/gazeCalibration';

interface CalibrationOverlayProps {
  viewingDistanceCm: number;
  onComplete: () => void; // calibrated successfully and user chose to continue
  onSkip: () => void;      // proceed without eye metrics
}

// Normalized screen positions (0..1) for the calibration grid and validation checks.
const CALIB_POINTS = [
  { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1 },
  { x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 },
  { x: 0.1, y: 0.9 }, { x: 0.5, y: 0.9 }, { x: 0.9, y: 0.9 },
];
const VALID_POINTS = [
  { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.5, y: 0.5 },
  { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 },
];

const SETTLE_MS = 700;          // let the eyes land on a new dot before collecting
const SAMPLES_PER_POINT = 30;   // frames collected per dot
const PX_PER_CM = 37.8;         // CSS reference (~96 dpi); used only for the deg readout

type Phase = 'warmup' | 'calibrating' | 'validating' | 'done' | 'unavailable';

export function CalibrationOverlay({ viewingDistanceCm, onComplete, onSkip }: CalibrationOverlayProps) {
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
  // Trigger a re-render to nudge progress without spamming state every frame.
  const [, setTick] = useState(0);

  const pxPerDeg = 2 * viewingDistanceCm * Math.tan((1 * Math.PI / 180) / 2) * PX_PER_CM;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
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
      await initFaceTracking();
      if (!isFaceTrackingActive()) {
        setPhaseBoth('unavailable');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setPhaseBoth('unavailable');
        return;
      }

      setPhaseBoth('calibrating');
      setModeBoth('calib');
      setIdxBoth(0);
      startPoint();
      raf = requestAnimationFrame(loop);
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
          const feat = extractGazeFeatures(video, performance.now());
          if (feat) {
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

          if (collectedRef.current >= SAMPLES_PER_POINT) {
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
              setPhaseBoth('done');
            }
          }
        }
        setTick(t => (t + 1) % 1000);
      }

      raf = requestAnimationFrame(loop);
    };

    setup();

    return () => {
      runningRef.current = false;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [pxPerDeg]);

  const restart = () => {
    // Re-run the whole flow by remounting the loop via a phase reset.
    resetCalibration();
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
    <div className="fixed inset-0 z-50 bg-slate-900 overflow-hidden">
      <video ref={videoRef} playsInline muted className="hidden" />

      {(phase === 'calibrating' || phase === 'validating') && (
        <>
          {/* The moving dot the user must follow with their eyes. */}
          <div
            className="absolute w-6 h-6 rounded-full bg-blue-400 ring-4 ring-blue-400/30 -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
            style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
          >
            <div className="absolute inset-0 rounded-full bg-blue-200 animate-ping opacity-60" />
          </div>
          <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center text-white">
            <p className="text-xl font-semibold mb-1">
              {phase === 'calibrating' ? 'Calibrando o olhar' : 'Verificando precisão'}
            </p>
            <p className="text-slate-400 text-sm">
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
            Precisão estimada:&nbsp;
            <span className="font-bold text-blue-300">
              {accuracyDeg != null ? `~${accuracyDeg.toFixed(1)}°` : 'não medida'}
            </span>
          </p>
          <p className="text-slate-500 text-sm max-w-md mb-8">
            Estimativa por webcam (~30Hz). Iluminação e movimento da cabeça afetam a
            precisão; recalibre se notar desvios.
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
        <button onClick={onSkip} className="absolute bottom-6 right-6 px-5 py-2 text-slate-400 hover:text-slate-200 text-sm">
          Pular calibração
        </button>
      )}
    </div>
  );
}

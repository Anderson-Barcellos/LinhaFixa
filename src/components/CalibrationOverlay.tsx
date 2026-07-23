import React, { useEffect, useRef, useState } from 'react';
import { initFaceTracking, isFaceTrackingActive, extractGazeFeatures, getLastLandmarks, estimateHeadPose, getBlinkScore } from '@/services/faceTracking';
import { createBlinkGateTracker } from '@/services/blinkGate';
import {
  acceptPendingCalibration,
  addCalibrationSample,
  fitCalibration,
  predictPendingNorm,
  rejectCalibration,
  resetCalibration,
} from '@/services/gazeCalibration';
import {
  assessCalibration,
  CALIBRATION_VALIDITY_CONTRACT,
  describeCalibrationAssessment,
  type CalibrationAssessment,
  type CalibrationValidationPointEvidence,
} from '@/services/calibrationValidity';
import { interpupillaryPx, setDistanceAnchor, resetDistanceAnchor } from '@/services/viewingGeometry';
import { attachStream, getFrontCameraStream, stopCameraStream } from '@/services/cameraStream';
import {
  getMotionSnapshot,
  setMotionBaseline,
  startMotionSensor,
  stopMotionSensor,
} from '@/services/motionSensor';
import {
  resetPosturalBaseline,
  setPosturalBaseline,
  summarizePosturalBaseline,
  toPosturalSample,
  type PosturalSample,
} from '@/exercises/posturalStability';
import { startVideoFrameLoop, type VideoFrameLoopHandle } from '@/services/videoFrameLoop';
import { currentOrientation, fullViewportRect, type SurfaceRect } from '@/services/ocularSignalContract';

interface CalibrationOverlayProps {
  viewingDistanceCm: number;
  onComplete: () => void; // calibrated successfully and user chose to continue
  onSkip: () => void;      // proceed without eye metrics
  keepCameraOnClose?: boolean;
  surfaceRect?: SurfaceRect;
  /** Mobile: oculta badge/contador e reduz o texto-guia a uma linha fora do rect. */
  compactChrome?: boolean;
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
const MIN_SAMPLES_PER_POINT = CALIBRATION_VALIDITY_CONTRACT.minimumSamplesPerPoint;
const PX_PER_CM = 37.8;         // CSS reference (~96 dpi); used only for the deg readout

type Phase = 'warmup' | 'calibrating' | 'validating' | 'done' | 'rejected' | 'unavailable';

export function CalibrationOverlay({ viewingDistanceCm, onComplete, onSkip, keepCameraOnClose = false, surfaceRect, compactChrome = false }: CalibrationOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('warmup');
  const [mode, setMode] = useState<'calib' | 'valid'>('calib');
  const [index, setIndex] = useState(0);
  const [accuracyDeg, setAccuracy] = useState<number | null>(null);
  const [rejection, setRejection] = useState<{
    assessment: CalibrationAssessment;
    failedPointHadNoSamples: boolean;
  } | null>(null);

  // Transient per-point state lives in refs so the rAF loop is not re-created.
  const runningRef = useRef(true);
  const phaseRef = useRef<Phase>('warmup');
  const modeRef = useRef<'calib' | 'valid'>('calib');
  const idxRef = useRef(0);
  const pointStartRef = useRef(0);
  const collectedRef = useRef(0);
  const pointTimeoutRef = useRef<number | null>(null);
  const pointTimerGenerationRef = useRef(0);
  const startPointRef = useRef<(() => void) | null>(null);
  const fitSampleCountsRef = useRef<number[]>(Array(CALIB_POINTS.length).fill(0));
  const validationEvidenceRef = useRef<CalibrationValidationPointEvidence[]>(
    createEmptyValidationEvidence(),
  );
  // IPD (px) samples gathered across the routine; their median anchors distance estimation.
  const ipdSamplesRef = useRef<number[]>([]);
  const posturalSamplesRef = useRef<PosturalSample[]>([]);
  // Trigger a re-render to nudge progress without spamming state every frame.
  const [, setTick] = useState(0);

  const pxPerDeg = 2 * viewingDistanceCm * Math.tan((1 * Math.PI / 180) / 2) * PX_PER_CM;

  useEffect(() => {
    let frameLoop: VideoFrameLoopHandle | null = null;
    let cancelled = false;
    runningRef.current = true;

    const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };
    const setModeBoth = (m: 'calib' | 'valid') => { modeRef.current = m; setMode(m); };
    const setIdxBoth = (i: number) => { idxRef.current = i; setIndex(i); };

    function clearPointTimeout() {
      pointTimerGenerationRef.current += 1;
      if (pointTimeoutRef.current !== null) {
        window.clearTimeout(pointTimeoutRef.current);
        pointTimeoutRef.current = null;
      }
    }

    function buildSignature() {
      const video = videoRef.current;
      const trackSettings = ((video?.srcObject as MediaStream | null)?.getVideoTracks()[0])?.getSettings?.();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      return {
        viewportWidth,
        viewportHeight,
        orientation: currentOrientation(viewportWidth, viewportHeight),
        devicePixelRatio: window.devicePixelRatio || 1,
        surfaceRect: activeSurfaceRect(),
        videoWidth: video?.videoWidth || trackSettings?.width,
        videoHeight: video?.videoHeight || trackSettings?.height,
        trackFrameRate: trackSettings?.frameRate,
      };
    }

    function buildAssessment(): CalibrationAssessment {
      const signature = buildSignature();
      const createdAt = Date.now();
      return assessCalibration({
        id: `calibration-${createdAt}`,
        createdAt,
        fitSampleCounts: fitSampleCountsRef.current,
        validationPoints: validationEvidenceRef.current,
        signature,
      });
    }

    function rejectAttempt(assessment: CalibrationAssessment, failedPointHadNoSamples: boolean) {
      clearPointTimeout();
      rejectCalibration(assessment);
      resetCalibrationAnchorsAndBaselines();
      setAccuracy(null);
      setRejection({ assessment, failedPointHadNoSamples });
      setPhaseBoth('rejected');
    }

    function completeCurrentPoint() {
      const phaseNow = phaseRef.current;
      if (phaseNow !== 'calibrating' && phaseNow !== 'validating') return;
      clearPointTimeout();

      const points = phaseNow === 'calibrating' ? CALIB_POINTS : VALID_POINTS;
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
          setPhaseBoth('validating');
          setModeBoth('valid');
          setIdxBoth(0);
          startPoint();
        }
      } else {
        const assessment = buildAssessment();
        if (acceptPendingCalibration(assessment)) {
          setAccuracy(assessment.meanErrorDeg);
          // Anchor distance estimation only after the calibration model and
          // its evidence have been accepted in the same transaction.
          const ipds = ipdSamplesRef.current.slice().sort((a, b) => a - b);
          if (ipds.length) {
            const medianIpd = ipds[Math.floor(ipds.length / 2)];
            setDistanceAnchor({ distanceCm: viewingDistanceCm, ipdPx: medianIpd });
          }
          setPosturalBaseline(summarizePosturalBaseline(posturalSamplesRef.current));
          setMotionBaseline('calibration');
          setPhaseBoth('done');
        } else if (!assessment.accepted) {
          rejectAttempt(assessment, false);
        } else {
          setPhaseBoth('unavailable');
        }
      }
    }

    function startPoint() {
      clearPointTimeout();
      pointStartRef.current = performance.now();
      collectedRef.current = 0;
      const generation = pointTimerGenerationRef.current;
      pointTimeoutRef.current = window.setTimeout(() => {
        if (
          cancelled
          || !runningRef.current
          || generation !== pointTimerGenerationRef.current
          || (phaseRef.current !== 'calibrating' && phaseRef.current !== 'validating')
        ) return;

        pointTimeoutRef.current = null;
        if (collectedRef.current < MIN_SAMPLES_PER_POINT) {
          rejectAttempt(buildAssessment(), collectedRef.current === 0);
        } else {
          completeCurrentPoint();
        }
      }, MAX_POINT_MS);
    }

    startPointRef.current = startPoint;

    const setup = async () => {
      resetCalibration();
      resetCalibrationAnchorsAndBaselines();
      ipdSamplesRef.current = [];
      posturalSamplesRef.current = [];
      fitSampleCountsRef.current = Array(CALIB_POINTS.length).fill(0);
      validationEvidenceRef.current = createEmptyValidationEvidence();
      setRejection(null);
      await initFaceTracking();
      if (cancelled) return;
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
        if (cancelled) return;
        setPhaseBoth('unavailable');
        return;
      }
      if (cancelled) return;

      setPhaseBoth('calibrating');
      setModeBoth('calib');
      setIdxBoth(0);
      startPoint();
      if (videoRef.current) {
        frameLoop = startVideoFrameLoop(videoRef.current, loop);
      }
    };

    const blinkGate = createBlinkGateTracker();
    const loop = () => {
      if (cancelled || !runningRef.current) return;
      const video = videoRef.current;
      const phaseNow = phaseRef.current;

      if (video && video.readyState >= 2 && (phaseNow === 'calibrating' || phaseNow === 'validating')) {
        const points = phaseNow === 'calibrating' ? CALIB_POINTS : VALID_POINTS;
        const target = points[idxRef.current];
        const targetAbs = targetToViewportNorm(target, activeSurfaceRect());
        const elapsed = performance.now() - pointStartRef.current;

        if (elapsed >= SETTLE_MS) {
          const now = performance.now();
          const feat = extractGazeFeatures(video, now);
          const pose = estimateHeadPose(video, now);
          if (pose) {
            posturalSamplesRef.current.push(toPosturalSample(pose));
          }
          // During a blink the iris drops/disappears: both the gaze features and the
          // iris-based IPD are corrupted, so the frame must not feed the ridge fit,
          // the validation error, or the distance anchor. Head pose (mesh-wide) stays.
          // The shared gate rejects blink-corrupted samples before fit/validation;
          // the point timeout turns an abnormally high eyeBlink baseline into an
          // explicit rejected attempt instead of silently training a distorted model.
          const blinking = blinkGate.update(getBlinkScore(), now);
          if (feat && !blinking) {
            // detect() just ran inside extractGazeFeatures, so the landmarks are fresh.
            const ipd = interpupillaryPx(getLastLandmarks(), video.videoWidth || 1280, video.videoHeight || 720);
            if (ipd) ipdSamplesRef.current.push(ipd);
            if (phaseNow === 'calibrating') {
              addCalibrationSample(feat, targetAbs);
              fitSampleCountsRef.current[idxRef.current] += 1;
              collectedRef.current += 1;
            } else {
              const pred = predictPendingNorm(feat);
              if (pred) {
                // pred and targetAbs are both viewport-normalized (the model is
                // trained on surface targets projected to viewport coords).
                const errPx = Math.hypot(
                  (pred.x - targetAbs.x) * window.innerWidth,
                  (pred.y - targetAbs.y) * window.innerHeight
                );
                const evidence = validationEvidenceRef.current[idxRef.current];
                evidence.errorsDeg.push(errPx / pxPerDeg);
                evidence.sampleCount += 1;
                if (pred.extrapolated) evidence.extrapolatedCount += 1;
                collectedRef.current += 1;
              }
            }
          }

          const hasEnoughSamples = collectedRef.current >= MIN_SAMPLES_PER_POINT
            && elapsed >= SETTLE_MS + MIN_POINT_MS;

          if (hasEnoughSamples) {
            completeCurrentPoint();
          }
        }
        setTick(t => (t + 1) % 1000);
      }
    };

    setup();

    return () => {
      cancelled = true;
      runningRef.current = false;
      startPointRef.current = null;
      clearPointTimeout();
      frameLoop?.stop();
      if (!keepCameraOnClose) {
        stopCameraStream();
        stopMotionSensor();
      }
    };
  }, [keepCameraOnClose, pxPerDeg, surfaceRect]);

  const restart = () => {
    // Re-run the whole flow by remounting the loop via a phase reset.
    resetCalibration();
    resetCalibrationAnchorsAndBaselines();
    ipdSamplesRef.current = [];
    posturalSamplesRef.current = [];
    fitSampleCountsRef.current = Array(CALIB_POINTS.length).fill(0);
    validationEvidenceRef.current = createEmptyValidationEvidence();
    phaseRef.current = 'calibrating';
    modeRef.current = 'calib';
    idxRef.current = 0;
    setAccuracy(null);
    setRejection(null);
    setMode('calib');
    setIndex(0);
    setPhase('calibrating');
    startPointRef.current?.();
  };

  const points = mode === 'calib' ? CALIB_POINTS : VALID_POINTS;
  const target = points[Math.min(index, points.length - 1)];
  const totalThisMode = points.length;
  const surface = activeSurfaceRect();
  const targetPx = targetToViewportPx(target, surface);

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
          <div
            className="pointer-events-none absolute rounded-2xl border-2 border-blue-300/80 bg-slate-950/20 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_24px_70px_rgba(15,23,42,0.55)]"
            style={surfaceRectStyle(surface)}
            data-testid="calibration-frame"
            aria-hidden="true"
          >
            {/* Badge e contador consomem área útil do rect pequeno do celular;
                os cantos decorativos abaixo já enquadram nos dois modos. */}
            {!compactChrome && (
              <>
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-slate-950/85 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-100 shadow-lg backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-blue-300" />
                  Área calibrada do teste
                </div>
                <div className="absolute right-4 top-4 rounded-full bg-slate-950/75 px-3 py-1.5 text-[11px] font-semibold text-slate-200 backdrop-blur">
                  {Math.round(surface.width)}×{Math.round(surface.height)} px
                </div>
              </>
            )}
            <div className="absolute left-3 top-3 h-10 w-10 rounded-tl-2xl border-l-2 border-t-2 border-blue-200/90" />
            <div className="absolute right-3 top-3 h-10 w-10 rounded-tr-2xl border-r-2 border-t-2 border-blue-200/90" />
            <div className="absolute bottom-3 left-3 h-10 w-10 rounded-bl-2xl border-b-2 border-l-2 border-blue-200/90" />
            <div className="absolute bottom-3 right-3 h-10 w-10 rounded-br-2xl border-b-2 border-r-2 border-blue-200/90" />
          </div>
          {/* The moving dot the user must follow with their eyes. */}
          <div
            className="absolute w-5 h-5 md:w-6 md:h-6 rounded-full bg-blue-400 ring-4 ring-blue-400/30 -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
            style={{ left: `${targetPx.x}px`, top: `${targetPx.y}px` }}
          >
            <div className="absolute inset-0 rounded-full bg-blue-200 animate-ping opacity-60" />
          </div>
          {compactChrome ? (
            /* Uma linha fora do surface rect quando há folga acima; sem folga o
               top clampa em 8px e o fundo semitransparente cobre a sobreposição. */
            <div
              className="absolute left-1/2 -translate-x-1/2 z-10 rounded-full bg-slate-950/70 px-3 py-1 text-xs text-slate-200 backdrop-blur whitespace-nowrap"
              style={{ top: `${Math.max(8, surface.top - 36)}px` }}
            >
              Olhe para o ponto azul · {index + 1}/{totalThisMode}
            </div>
          ) : (
            <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2 text-center text-white px-4">
              <p className="text-base md:text-xl font-semibold mb-1">
                {phase === 'calibrating' ? 'Calibrando posição do olhar' : 'Verificando mapeamento'}
              </p>
              <p className="text-slate-300 text-xs md:text-sm">
                Olhe para o ponto azul dentro da área marcada · {index + 1}/{totalThisMode}
              </p>
            </div>
          )}
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

      {phase === 'rejected' && rejection && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center p-6">
          <h2 className="text-3xl font-bold mb-4">Calibração não aceita</h2>
          <p className="text-slate-300 max-w-md mb-8">
            {rejection.failedPointHadNoSamples
              ? 'Rosto/olhos não foram detectados neste ponto.'
              : describeCalibrationAssessment(rejection.assessment).reasons[0]}
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button onClick={restart} className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-lg font-bold">
              Tentar novamente
            </button>
            <button onClick={onSkip} className="px-10 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl text-lg font-bold">
              Continuar sem calibração
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

  function activeSurfaceRect(): SurfaceRect {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const full = fullViewportRect(viewportWidth, viewportHeight);
    if (!surfaceRect) return full;
    const left = clamp(surfaceRect.left, 0, viewportWidth);
    const top = clamp(surfaceRect.top, 0, viewportHeight);
    const width = clamp(surfaceRect.width, 1, viewportWidth - left);
    const height = clamp(surfaceRect.height, 1, viewportHeight - top);
    return { left, top, width, height };
  }
}

function targetToViewportPx(target: { x: number; y: number }, rect: SurfaceRect): { x: number; y: number } {
  return {
    x: rect.left + target.x * rect.width,
    y: rect.top + target.y * rect.height,
  };
}

function surfaceRectStyle(rect: SurfaceRect): React.CSSProperties {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function targetToViewportNorm(target: { x: number; y: number }, rect: SurfaceRect): { x: number; y: number } {
  const point = targetToViewportPx(target, rect);
  return {
    x: point.x / window.innerWidth,
    y: point.y / window.innerHeight,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createEmptyValidationEvidence(): CalibrationValidationPointEvidence[] {
  return Array.from({ length: VALID_POINTS.length }, () => ({
    sampleCount: 0,
    errorsDeg: [],
    extrapolatedCount: 0,
  }));
}

function resetCalibrationAnchorsAndBaselines(): void {
  resetDistanceAnchor();
  resetPosturalBaseline();
  const motionWasActive = getMotionSnapshot().active;
  stopMotionSensor();
  if (motionWasActive) startMotionSensor();
}

import React, { useRef, useEffect, useState } from 'react';
import { registry } from '@/exercises/implementations';
import { measuredSurfaceFromEntry, measuredSurfaceEquals, type MeasuredSurface } from '@/services/measuredSurface';
import { ExerciseParameters } from '@/types';
import { estimateHeadPose, estimateGaze, extractGazeFeatures, initFaceTracking, isFaceTrackingActive, getBlinkScore, shouldDropGazeForBlink, getLastLandmarks } from '@/services/faceTracking';
import { getCalibrationSignature, isCalibrated, predictNorm } from '@/services/gazeCalibration';
import { interpupillaryPx, estimateDistanceCm, getDistanceAnchor, distanceWithinAnchorTolerance } from '@/services/viewingGeometry';
import { attachStream, getFrontCameraStream } from '@/services/cameraStream';
import { getMotionQuality } from '@/services/motionSensor';
import { createStimulusDistanceTracker, type StimulusDistanceSnapshot } from '@/services/stimulusDistance';
import { createLiveStabilityTracker, getPosturalBaseline, summarizePosturalStability, toPosturalSample, type PosturalSample } from '@/exercises/posturalStability';
import { startVideoFrameLoop, type VideoFrameLoopHandle } from '@/services/videoFrameLoop';
import {
  calibrationSignatureMatches,
  currentOrientation,
  fullViewportRect,
  rectFromElement,
  viewportNormToRectPoint,
} from '@/services/ocularSignalContract';

interface ExerciseCanvasProps {
  exerciseId: string;
  parameters: ExerciseParameters;
  onFinish: (score: number, headStillnessScore: number | null, extraData?: any) => void;
  cameraEnabled: boolean;
  viewingDistanceCm?: number;
  fontSizePreference?: string;
}

// Standard CSS reference is 96px/inch => ~37.8px/cm.
// NOTE: the canvas backing store IS DPR-scaled (see applySurface below), but
// exercises still draw in CSS px — the ctx.setTransform(dpr, ...) call absorbs
// the DPR, so PX_PER_CM correctly stays a CSS-px constant here.
const PX_PER_CM = 37.8;

export function ExerciseCanvas({ exerciseId, parameters, onFinish, cameraEnabled, viewingDistanceCm = 40, fontSizePreference = 'normal' }: ExerciseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const contextRef = useRef<any>(null);
  const [headStable, setHeadStable] = useState(true);
  const [stimulusDrift, setStimulusDrift] = useState(false);
  const stimulusDriftRef = useRef(false);

  useEffect(() => {
    let animationFrameId: number;
    let videoFrameLoop: VideoFrameLoopHandle | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let startTime = performance.now();
    let isRunning = true;
    let latestVideoFrameTs = 0;
    let latestVideoFrameToken = 0;
    let processedVideoFrameToken = -1;

    // We keep track of how many frames head was stable vs unstable
    // Extremely simplified head scoring for this prototype
    let framesAnalyzed = 0;
    let framesStable = 0;

    // Cervical/postural samples accumulated over the exercise, plus a Motion Assist
    // high-movement flag. Summarized into extraData.posturalStability on finish.
    const posturalSamples: PosturalSample[] = [];
    let posturalHighMovement = false;

    // Baseline-relative live stillness check (falls back to a warmup-derived neutral
    // pose when no calibration baseline exists, which is the player's common case).
    const liveStability = createLiveStabilityTracker(getPosturalBaseline());

    // Stimulus geometry: freeze the live distance at start, then only observe drift.
    // Absolute distance needs the calibration anchor (IPD→cm is relative to it);
    // without an anchor the sample is null and the tracker falls back to the profile.
    const stimulusTracker = createStimulusDistanceTracker({ profileDistanceCm: viewingDistanceCm });
    let stimulusSnap: StimulusDistanceSnapshot = stimulusTracker.snapshot();

    const setup = async () => {
      // 1. Camera setup if enabled
      if (cameraEnabled) {
        try {
          await initFaceTracking();
          const cameraStream = await getFrontCameraStream();
          if (videoRef.current) {
            await attachStream(videoRef.current, cameraStream);
            videoFrameLoop = startVideoFrameLoop(videoRef.current, ts => {
              latestVideoFrameTs = ts;
              latestVideoFrameToken += 1;
            });
          }
        } catch (e) {
          console.warn("Could not start camera, continuing without face tracking");
        }
      }

      // Bail out if cleanup already ran while we were awaiting camera/face-tracking
      // setup above — otherwise this stale continuation would still create and
      // observe a ResizeObserver whose cleanup already fired, leaking it.
      if (!isRunning) return;

      // 2. Engine setup
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const impl = registry[exerciseId];
      if (!impl) {
        console.error("Exercise not found", exerciseId);
        return;
      }

      // Real-space sizing: the backing store follows the parent's measured box at
      // device-pixel resolution (crisp text at any DPR), while exercises keep
      // drawing in CSS px via the ctx transform below. Replaces the old CSS-px
      // resize listener (which also leaked: it was never removed on cleanup).
      const parent = canvas.parentElement!;
      const initialDpr = window.devicePixelRatio || 1;
      let surface: MeasuredSurface = {
        cssWidth: parent.clientWidth || window.innerWidth,
        cssHeight: parent.clientHeight || window.innerHeight,
        dpr: initialDpr,
        devicePxWidth: Math.round((parent.clientWidth || window.innerWidth) * initialDpr),
        devicePxHeight: Math.round((parent.clientHeight || window.innerHeight) * initialDpr),
      };
      const applySurface = (m: MeasuredSurface) => {
        surface = m;
        canvas.width = m.devicePxWidth;
        canvas.height = m.devicePxHeight;
        canvas.style.width = `${m.cssWidth}px`;
        canvas.style.height = `${m.cssHeight}px`;
      };
      applySurface(surface);
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(entries => {
          const next = measuredSurfaceFromEntry(entries[entries.length - 1], window.devicePixelRatio || 1);
          if (next && !measuredSurfaceEquals(next, surface)) applySurface(next);
        });
        try {
          resizeObserver.observe(parent, { box: 'device-pixel-content-box' } as ResizeObserverOptions);
        } catch {
          resizeObserver.observe(parent);
        }
      }

      const contextState = {};
      const ctx = canvas.getContext('2d')!;

      // NOTE: the canvas backing store is DPR-scaled (device px), but exercises
      // draw in CSS px — the loop's ctx.setTransform(surface.dpr, ...) absorbs the
      // DPR, so pxPerCm stays a CSS-px constant and must NOT be multiplied by DPR.
      const pxPerCm = PX_PER_CM;
      // Visual angle -> screen size at the FROZEN stimulus distance (profile until
      // the tracker freezes; a single early adjustment ≤3s in is the accepted cost).
      const degToPx = (deg: number) => {
        const sizeCm = 2 * stimulusSnap.distanceCm * Math.tan((deg * Math.PI / 180) / 2);
        return sizeCm * pxPerCm;
      };

      const exContext = {
        ctx,
        width: surface.cssWidth,
        height: surface.cssHeight,
        timeMs: 0,
        dt: 0,
        state: contextState,
        parameters,
        onEvent: (ev: string, val: any) => console.log('Event', ev, val),
        cmToPx: (cm: number) => cm * pxPerCm,
        degToPx,
        viewingDistanceCm,
        latestGaze: null,
        latestGazePoint: null,
        isGazeCalibrated: cameraEnabled && isFaceTrackingActive() && isCalibrated(),
        fontSizePreference,
        finishExercise: (extraData?: any) => {
           if (!isRunning) return;
           isRunning = false;
           // Honest stillness: null when no real tracking frames were captured,
           // instead of reporting a fake perfect 100%.
           const stillnessScore = framesAnalyzed > 0 ? (framesStable / framesAnalyzed) * 100 : null;
           // Exercises that measure performance supply their own score via getResultData.
           const score = extraData && typeof extraData.score === 'number' ? extraData.score : 100;
           // Attach the cervical/postural summary alongside the exercise's own data.
           const motionQuality = getMotionQuality();
           const posturalStability = summarizePosturalStability(posturalSamples, {
             baseline: getPosturalBaseline(),
             motionHighMovement: posturalHighMovement,
             motionStatus: motionQuality.status,
             motionDeltaDeg: motionQuality.deltaDeg,
             motionConfidence: motionQuality.confidence,
             durationMs: exContext.timeMs,
           });
           onFinish(score, stillnessScore, { ...(extraData || {}), posturalStability, stimulusGeometry: stimulusTracker.snapshot() });
        }
      };
      
      contextRef.current = exContext;

      impl.init(exContext);

      // Loop
      let lastTime = performance.now();

      const loop = (time: number) => {
        if (!isRunning) return;
        
        exContext.dt = time - lastTime;
        exContext.timeMs = time - startTime;
        lastTime = time;
        exContext.width = surface.cssWidth;
        exContext.height = surface.cssHeight;
        ctx.setTransform(surface.dpr, 0, 0, surface.dpr, 0, 0); // exercises draw in CSS px

        // Face tracking logic. Only count frames where a real face was detected,
        // so the stillness score is not inflated by missing measurements.
        if (
          cameraEnabled
          && isFaceTrackingActive()
          && videoRef.current
          && videoRef.current.readyState >= 2
          && latestVideoFrameToken !== processedVideoFrameToken
        ) {
           processedVideoFrameToken = latestVideoFrameToken;
           const detectTs = latestVideoFrameTs || performance.now();
           const headPose = estimateHeadPose(videoRef.current, detectTs);
           if (headPose) {
             framesAnalyzed++;
             const posturalSample = toPosturalSample(headPose);
             posturalSamples.push(posturalSample);
             if (getMotionQuality().status === 'shaking') posturalHighMovement = true;
             const isStable = liveStability.update(posturalSample);
             setHeadStable(isStable);
             if (isStable) framesStable++;
           }
           // Distance drift gate: landmarks are fresh from the detect above. Outside
           // the tolerance vs. the calibration anchor, the calibrated mapping is
           // extrapolating and the point must not be trusted.
           const anchor = getDistanceAnchor();
           const ipdPx = interpupillaryPx(getLastLandmarks(), videoRef.current.videoWidth || 1280, videoRef.current.videoHeight || 720);
           const dEst = estimateDistanceCm(ipdPx, anchor, viewingDistanceCm);
           stimulusSnap = stimulusTracker.update(anchor && ipdPx != null ? dEst : null, exContext.timeMs);
           if (stimulusSnap.inDrift !== stimulusDriftRef.current) {
             stimulusDriftRef.current = stimulusSnap.inDrift;
             setStimulusDrift(stimulusSnap.inDrift);
           }
           const distanceOk = distanceWithinAnchorTolerance(dEst, anchor?.distanceCm ?? null);
           // Blink score is measured, but hard rejection sits behind the shared
           // BLINK_REJECT_GATE_ENABLED kill-switch (off until tuned on real data —
           // a high eyeBlink baseline would otherwise kill a flowing signal).
           const blinking = shouldDropGazeForBlink(getBlinkScore());
           // Capture gaze for exercises that consume it (e.g. assisted reading).
           exContext.latestGaze = blinking ? null : estimateGaze(videoRef.current, detectTs, exContext.timeMs);
           // Project the calibrated point of gaze into canvas pixels, if calibrated.
           if (!blinking && exContext.isGazeCalibrated) {
             const feat = extractGazeFeatures(videoRef.current, detectTs);
             const norm = feat ? predictNorm(feat) : null;
             if (norm) {
               const viewportWidth = window.innerWidth;
               const viewportHeight = window.innerHeight;
               const trackSettings = ((videoRef.current.srcObject as MediaStream | null)?.getVideoTracks()[0])?.getSettings?.();
               const signatureStatus = calibrationSignatureMatches(getCalibrationSignature(), {
                 viewportWidth,
                 viewportHeight,
                 orientation: currentOrientation(viewportWidth, viewportHeight),
                 devicePixelRatio: window.devicePixelRatio || 1,
                 surfaceRect: fullViewportRect(viewportWidth, viewportHeight),
                 videoWidth: videoRef.current.videoWidth || trackSettings?.width,
                 videoHeight: videoRef.current.videoHeight || trackSettings?.height,
                 trackFrameRate: trackSettings?.frameRate,
               });
               const localPoint = viewportNormToRectPoint(
                 norm,
                 rectFromElement(canvas),
                 { width: viewportWidth, height: viewportHeight }
               );
               // Extrapolated predictions are clamped border points, not measured
               // positions — rejected here so oculomotor metrics never ingest them.
               exContext.latestGazePoint = signatureStatus.matches && localPoint.inBounds && distanceOk && !norm.extrapolated
                 ? { x: localPoint.x, y: localPoint.y }
                 : null;
             } else {
               exContext.latestGazePoint = null;
             }
           } else {
             exContext.latestGazePoint = null;
           }
        } else {
           // A null update can only shrink/hold the EMA's neighborhood, never flip
           // inDrift (EMA is unchanged) — that's why the drift ref/setState sync
           // below lives only in the processed-frame branch above.
           stimulusSnap = stimulusTracker.update(null, exContext.timeMs);
           exContext.latestGaze = null;
           exContext.latestGazePoint = null;
        }

        impl.update(exContext);
        impl.draw(exContext);

        // Check if finished
        if (exContext.timeMs >= parameters.durationSec * 1000) {
          const resultData = impl.getResultData ? impl.getResultData(exContext) : undefined;
          exContext.finishExercise(resultData);
          return;
        }

        animationFrameId = requestAnimationFrame(loop);
      };

      animationFrameId = requestAnimationFrame(loop);
    };

    setup();

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
      videoFrameLoop?.stop();
      resizeObserver?.disconnect();
    };
  }, [exerciseId, parameters, cameraEnabled, onFinish, viewingDistanceCm, fontSizePreference]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !contextRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const impl = registry[exerciseId];
    if (impl && impl.onInput) {
       impl.onInput(x, y, contextRef.current);
    }
  };

  return (
    <div className={`relative w-full h-full bg-slate-900 overflow-hidden flex items-center justify-center transition-shadow duration-500 ${stimulusDrift ? 'ring-4 ring-inset ring-amber-400/70' : ''}`}>
      {!headStable && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-6 py-2 bg-red-500/90 text-white rounded-full font-medium text-lg tracking-wide shadow-xl flex items-center gap-2">
          {/* Subtle warning */}
          <span className="w-3 h-3 rounded-full bg-white animate-pulse"></span>
          Mantenha a cabeça parada
        </div>
      )}
      <canvas 
        ref={canvasRef} 
        onPointerDown={handlePointerDown}
        className="block touch-none"
      />
      {/* Hidden video element for tracking */}
      <video ref={videoRef} playsInline muted className="hidden w-64 h-48 opacity-20 absolute bottom-0 left-0" />
    </div>
  );
}

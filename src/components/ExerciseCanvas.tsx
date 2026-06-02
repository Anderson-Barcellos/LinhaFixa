import React, { useRef, useEffect, useState } from 'react';
import { registry } from '@/exercises/implementations';
import { ExerciseParameters } from '@/types';
import { estimateHeadPose, estimateGaze, initFaceTracking, isFaceTrackingActive } from '@/services/faceTracking';

interface ExerciseCanvasProps {
  exerciseId: string;
  parameters: ExerciseParameters;
  onFinish: (score: number, headStillnessScore: number | null, extraData?: any) => void;
  cameraEnabled: boolean;
  viewingDistanceCm?: number;
  fontSizePreference?: string;
}

// Standard CSS reference is 96px/inch => ~37.8px/cm, scaled by the device pixel ratio
// because the canvas is sized in device pixels here.
const PX_PER_CM = 37.8;

export function ExerciseCanvas({ exerciseId, parameters, onFinish, cameraEnabled, viewingDistanceCm = 40, fontSizePreference = 'normal' }: ExerciseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const contextRef = useRef<any>(null);
  const [headStable, setHeadStable] = useState(true);
  
  useEffect(() => {
    let animationFrameId: number;
    let cameraStream: MediaStream | null = null;
    let startTime = performance.now();
    let isRunning = true;

    // We keep track of how many frames head was stable vs unstable
    // Extremely simplified head scoring for this prototype
    let framesAnalyzed = 0;
    let framesStable = 0;

    const setup = async () => {
      // 1. Camera setup if enabled
      if (cameraEnabled) {
        try {
          await initFaceTracking();
          cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }});
          if (videoRef.current) {
            videoRef.current.srcObject = cameraStream;
            videoRef.current.play();
          }
        } catch (e) {
          console.warn("Could not start camera, continuing without face tracking");
        }
      }

      // 2. Engine setup
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const impl = registry[exerciseId];
      if (!impl) {
        console.error("Exercise not found", exerciseId);
        return;
      }

      const resize = () => {
        canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
        canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
      };
      window.addEventListener('resize', resize);
      resize();

      const contextState = {};
      const ctx = canvas.getContext('2d')!;

      const pxPerCm = PX_PER_CM * (window.devicePixelRatio || 1);
      // Visual angle -> physical size on screen: size_cm = 2 * dist * tan(deg/2).
      const degToPx = (deg: number) => {
        const sizeCm = 2 * viewingDistanceCm * Math.tan((deg * Math.PI / 180) / 2);
        return sizeCm * pxPerCm;
      };

      const exContext = {
        ctx,
        width: canvas.width,
        height: canvas.height,
        timeMs: 0,
        dt: 0,
        state: contextState,
        parameters,
        onEvent: (ev: string, val: any) => console.log('Event', ev, val),
        cmToPx: (cm: number) => cm * pxPerCm,
        degToPx,
        viewingDistanceCm,
        latestGaze: null,
        fontSizePreference,
        finishExercise: (extraData?: any) => {
           if (!isRunning) return;
           isRunning = false;
           // Honest stillness: null when no real tracking frames were captured,
           // instead of reporting a fake perfect 100%.
           const stillnessScore = framesAnalyzed > 0 ? (framesStable / framesAnalyzed) * 100 : null;
           onFinish(100, stillnessScore, extraData);
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
        exContext.width = canvas.width;
        exContext.height = canvas.height;

        // Face tracking logic. Only count frames where a real face was detected,
        // so the stillness score is not inflated by missing measurements.
        if (cameraEnabled && isFaceTrackingActive() && videoRef.current && videoRef.current.readyState >= 2) {
           const detectTs = performance.now();
           const headPose = estimateHeadPose(videoRef.current, detectTs);
           if (headPose) {
             framesAnalyzed++;
             // Arbitrary threshold for motion
             const isStable = Math.abs(headPose.yaw) < 5 && Math.abs(headPose.pitch) < 5;
             setHeadStable(isStable);
             if (isStable) framesStable++;
           }
           // Capture gaze for exercises that consume it (e.g. assisted reading).
           exContext.latestGaze = estimateGaze(videoRef.current, detectTs, exContext.timeMs);
        } else {
           exContext.latestGaze = null;
        }

        impl.update(exContext);
        impl.draw(exContext);

        // Check if finished
        if (exContext.timeMs >= parameters.durationSec * 1000) {
          exContext.finishExercise();
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
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
      }
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
    <div className="relative w-full h-full bg-slate-900 overflow-hidden flex items-center justify-center">
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

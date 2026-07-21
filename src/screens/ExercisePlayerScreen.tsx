import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PreContextForm, PostContextForm } from '@/components/QuickContextForm';
import { ExerciseCanvas } from '@/components/ExerciseCanvas';
import { useAppStore } from '@/store/useAppStore';
import { generateTreatmentPlan, type GeneratedTreatmentPlan } from '@/services/planner';
import { checkContextSafety } from '@/services/safety';
import { saveSession, getTodayPreContext } from '@/services/storage';
import { CalibrationOverlay } from '@/components/CalibrationOverlay';
import { CalibrationReusePrompt } from '@/components/CalibrationReusePrompt';
import { Card } from '@/components/ui/card';
import { getCalibrationAssessment } from '@/services/gazeCalibration';
import {
  discardFrontCameraRequest,
  requestFrontCameraStream,
  retainFrontCameraRequest,
  stopCameraStream,
} from '@/services/cameraStream';
import { calibrationReuseDecision, currentOrientation, fullViewportRect } from '@/services/ocularSignalContract';
import { requestMotionPermissionFromGesture, startMotionSensor, stopMotionSensor } from '@/services/motionSensor';
import { resetPosturalBaseline } from '@/exercises/posturalStability';
import { summarizeReadingDynamics } from '@/exercises/readingDynamics';
import { PreTestContext, PostTestContext, SessionResult, ExerciseResult, type UserProfile } from '@/types';
import { formatSampleRateHz } from '@/services/sampleRatePresentation';
import { createAsyncOperationGate, guardedAwait } from '@/services/asyncOperation';
import { resolveDeviceClass, type DeviceClassDecision } from '@/services/deviceClass';

type PlayerStage = 'PRE_CONTEXT' | 'LOADING_PLAN' | 'BLOCKED' | 'PRE_EXERCISE_INFO' | 'CALIBRATION' | 'RECALIBRATION_PROMPT' | 'EXERCISE' | 'POST_READING_RATING' | 'POST_CONTEXT' | 'SUMMARY';

export function ExercisePlayerScreen() {
  const navigate = useNavigate();
  const location = useLocation() as any;
  const singleExerciseId = location.state?.singleExercise;

  const { profile } = useAppStore();
  const [stage, setStage] = useState<PlayerStage>('PRE_CONTEXT');
  const [contextPre, setContextPre] = useState<PreTestContext>({
    venvanseTakenAt: null, sleepHours: 7, mood: 3, feeling: 3
  });
  const [contextPost, setContextPost] = useState<PostTestContext>({
    feeling: 3, fatigue: 3, mood: 3
  });
  
  const [plan, setPlan] = useState<GeneratedTreatmentPlan | null>(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [results, setResults] = useState<ExerciseResult[]>([]);
  const [safetyReason, setSafetyReason] = useState("");
  const [readingExtraData, setReadingExtraData] = useState<any>(null);
  const [readingRating, setReadingRating] = useState<string | null>(null);
  // Once the user has been offered calibration this session, don't prompt again.
  const [calibrationOffered, setCalibrationOffered] = useState(false);
  const [calibrationMismatchReasons, setCalibrationMismatchReasons] = useState<string[]>([]);
  const [forceRawSignal, setForceRawSignal] = useState(false);
  const cameraPreflightGateRef = useRef(createAsyncOperationGate());
  const sessionDeviceRef = useRef<DeviceClassDecision | null>(null);
  // Manual stop: truncate the running exercise via its finishExercise pipeline
  // (partial result saved) instead of discarding the run outright.
  const stopExerciseRef = useRef<(() => void) | null>(null);
  const stopEarlyRef = useRef(false);
  const registerStop = useCallback((stop: () => void) => {
    stopExerciseRef.current = stop;
  }, []);

  useEffect(() => {
    cameraPreflightGateRef.current.mount();
    return () => {
      cameraPreflightGateRef.current.unmount();
      stopCameraStream();
      stopMotionSensor();
      resetPosturalBaseline();
    };
  }, []);

  // Prefill from the day's first session so repeat sessions start from the
  // morning's answers instead of asking everything again.
  useEffect(() => {
    getTodayPreContext()
      .then(ctx => { if (ctx) setContextPre(ctx); })
      .catch(() => {/* keep defaults */});
  }, []);

  // Decide whether to calibrate before the exercise, then enter it.
  const proceedToExercise = async () => {
    const gate = cameraPreflightGateRef.current;
    const operation = gate.begin();
    if (profile?.cameraEnabled ?? false) {
      const motionPermission = await guardedAwait(
        gate,
        operation,
        requestMotionPermissionFromGesture(),
      );
      if (!motionPermission.current) return;
      if (motionPermission.value === 'granted') startMotionSensor();
    }
    if (!gate.isCurrent(operation)) return;
    if (!(profile?.cameraEnabled ?? false) || forceRawSignal) {
      setStage('EXERCISE');
      return;
    }

    const assessment = getCalibrationAssessment();
    if (!assessment) {
      if (!gate.isCurrent(operation)) return;
      setStage(calibrationOffered ? 'EXERCISE' : 'CALIBRATION');
      return;
    }

    const cameraRequest = requestFrontCameraStream();
    try {
      const stream = await cameraRequest.promise;
      if (!gate.isCurrent(operation)) {
        discardFrontCameraRequest(cameraRequest, stream);
        return;
      }
      const trackSettings = stream.getVideoTracks()[0]?.getSettings?.();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const decision = calibrationReuseDecision(assessment, {
        viewportWidth,
        viewportHeight,
        orientation: currentOrientation(viewportWidth, viewportHeight),
        devicePixelRatio: window.devicePixelRatio || 1,
        surfaceRect: fullViewportRect(viewportWidth, viewportHeight),
        videoWidth: trackSettings?.width,
        videoHeight: trackSettings?.height,
        trackFrameRate: trackSettings?.frameRate,
      });
      if (!gate.isCurrent(operation)) {
        discardFrontCameraRequest(cameraRequest, stream);
        return;
      }
      retainFrontCameraRequest(cameraRequest);
      if (decision.reusable) {
        setStage('EXERCISE');
      } else {
        setCalibrationMismatchReasons(decision.reasons);
        setStage('RECALIBRATION_PROMPT');
      }
    } catch {
      if (!gate.isCurrent(operation)) return;
      setStage('CALIBRATION');
    }
  };

  const handlePreContextSubmit = async () => {
    sessionDeviceRef.current = resolveDeviceClass(profile, {
      width: window.innerWidth,
      height: window.innerHeight,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    });
    const safety = checkContextSafety(contextPre);
    if (!safety.safe) {
      setSafetyReason(safety.reason!);
      setStage('BLOCKED');
      return;
    }
    
    setStage('LOADING_PLAN');

    if (singleExerciseId) {
      setPlan({
        sessionTitle: `Treino Livro: ${singleExerciseId.replace('_', ' ')}`,
        safetyStatus: { allowTraining: true, reason: "" },
        exercises: [{
          exerciseId: singleExerciseId,
          durationSec: 30,
          difficulty: 1,
          parameters: {
             targetSizeMm: 12,
             speedDegPerSec: 0,
             amplitudeDeg: 15,
             lineSpacingMultiplier: 1.5,
             contrastMode: profile?.contrastPreference || 'light',
             durationSec: 30,
             textComplexity: "facil"
          },
          rationalePtBR: "Modo livre selecionado pela biblioteca.",
          stopRules: ["Desconforto excessivo"]
        }],
        patientFeedbackPtBR: "Sessão avulsa concluída com sucesso.",
        clinicianSummaryPtBR: "Prática avulsa.",
        origin: 'library',
        fallbackFailure: null,
        fallbackMessage: null,
      });
      setStage('PRE_EXERCISE_INFO');
      return;
    }

    const planningProfile: UserProfile = profile ?? {
      name: '',
      isAdult: true,
      fontSizePreference: 'normal',
      contrastPreference: 'light',
      cameraEnabled: false,
      viewingDistanceCm: 40,
    };
    const generatedPlan = await generateTreatmentPlan(planningProfile, contextPre, []);
    setPlan(generatedPlan);
    
    if (generatedPlan.safetyStatus.allowTraining) {
      setStage('PRE_EXERCISE_INFO');
    } else {
      setSafetyReason(generatedPlan.safetyStatus.reason);
      setStage('BLOCKED');
    }
  };

  const handleExerciseFinish = (score: number, stillness: number | null, extraData?: any) => {
    const curParam = plan!.exercises[currentExerciseIndex].parameters;
    const device = sessionDeviceRef.current;
    const persistedExtraData = {
      ...extraData,
      ...(device ? {
        deviceClass: device.deviceClass,
        deviceClassSource: device.deviceClassSource,
      } : {}),
    };
    const exerciseCompleted = !persistedExtraData.invalidReason;
    const newResult: ExerciseResult = {
      exerciseId: plan!.exercises[currentExerciseIndex].exerciseId,
      completed: exerciseCompleted,
      score,
      headStillnessScore: stillness,
      parametersUsed: curParam,
      timestamp: Date.now(),
      extraData: persistedExtraData,
    };
    
    setResults([...results, newResult]);

    // Manual stop: partial result is saved above, but the session ends here —
    // no reading rating, no next exercise.
    if (stopEarlyRef.current) {
      stopEarlyRef.current = false;
      setStage('POST_CONTEXT');
      return;
    }

    if (!persistedExtraData.invalidReason && Array.isArray(persistedExtraData.intervals)) {
       setReadingExtraData(persistedExtraData);
       setStage('POST_READING_RATING');
       return;
    }

    if (currentExerciseIndex < plan!.exercises.length - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
      setStage('PRE_EXERCISE_INFO'); // show info for next exercise
    } else {
      setStage('POST_CONTEXT');
    }
  };

  const finalizeSession = async () => {
    // Attach the reading self-rating to the assisted-reading result, if any.
    const exercises = readingRating
      ? results.map(r =>
          r.extraData?.intervals
            ? { ...r, extraData: { ...r.extraData, readingRating } }
            : r
        )
      : results;

    const session: SessionResult = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      durationSec: plan!.exercises.reduce((acc, ex) => acc + ex.durationSec, 0),
      contextBefore: contextPre,
      contextAfter: contextPost,
      exercises,
      clinicianSummaryPtBR: plan!.clinicianSummaryPtBR
    };
    await saveSession(session);
    setStage('SUMMARY');
  };

  if (stage === 'BLOCKED') {
    return (
      <div className="min-h-screen bg-app flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-3xl font-bold text-strong mb-4">Treino Suspenso</h2>
        <p className="text-xl text-mild max-w-xl mb-8">{safetyReason}</p>
        <button onClick={() => navigate('/')} className="px-8 py-3 bg-ink text-ink-foreground rounded-xl text-lg font-medium">Voltar ao Início</button>
      </div>
    );
  }

  if (stage === 'LOADING_PLAN') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <p className="text-xl text-slate-300 font-medium">Buscando protocolo seguro...</p>
      </div>
    );
  }

  if (stage === 'PRE_EXERCISE_INFO' && plan) {
    const ex = plan.exercises[currentExerciseIndex];
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-white">
        <p className="mb-4 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
          {plan.origin === 'ai'
            ? 'Plano adaptativo gerado pelo backend'
            : plan.origin === 'local-fallback'
              ? `Plano padrão local — ${plan.fallbackMessage ?? 'backend indisponível'}`
              : plan.origin === 'library'
                ? 'Exercício avulso da Biblioteca'
                : 'Sessão bloqueada pelo safety gate'}
        </p>
        <h2 className="text-4xl font-bold text-white mb-6">Próximo: {ex.exerciseId === 'fixation' ? 'Fixação' : ex.exerciseId === 'saccades' ? 'Sacadas' : 'Treino Visual'}</h2>
        <p className="text-2xl text-slate-300 max-w-2xl mb-12">{ex.rationalePtBR}</p>
        <p className="text-lg text-amber-300 mb-12 flex flex-col gap-2">
           <span className="font-bold uppercase tracking-widest text-sm text-slate-400">Objetivo Principal</span>
           Lembre-se: Mantenha a cabeça perfeitamente parada.
        </p>
        <button onClick={proceedToExercise} className="px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-2xl font-bold shadow-lg transition-transform active:scale-95">
          Estou Pronto
        </button>
      </div>
    );
  }

  if (stage === 'CALIBRATION') {
    return (
      <CalibrationOverlay
        viewingDistanceCm={profile?.viewingDistanceCm ?? 40}
        onComplete={() => {
          setCalibrationOffered(true);
          setForceRawSignal(false);
          setCalibrationMismatchReasons([]);
          setStage('EXERCISE');
        }}
        onSkip={() => {
          setCalibrationOffered(true);
          setForceRawSignal(true);
          setStage('EXERCISE');
        }}
        keepCameraOnClose
      />
    );
  }

  if (stage === 'RECALIBRATION_PROMPT') {
    return (
      <CalibrationReusePrompt
        reasons={calibrationMismatchReasons}
        onRecalibrate={() => setStage('CALIBRATION')}
        onContinueRaw={() => {
          setForceRawSignal(true);
          setStage('EXERCISE');
        }}
      />
    );
  }

  if (stage === 'EXERCISE' && plan) {
    const ex = plan.exercises[currentExerciseIndex];
    return (
      <div className="w-screen h-screen relative bg-slate-900">
         <button
           onClick={() => {
             if (stopExerciseRef.current) {
               stopEarlyRef.current = true;
               stopExerciseRef.current();
             } else {
               setStage('POST_CONTEXT');
             }
           }}
           className="absolute top-6 right-6 z-50 px-6 py-3 bg-slate-800/80 hover:bg-red-600/90 text-white rounded-full font-medium transition-colors border border-slate-700"
         >Parar Imediatamente</button>
         <ExerciseCanvas
           registerStop={registerStop}
           exerciseId={ex.exerciseId}
           parameters={ex.parameters}
           onFinish={handleExerciseFinish}
           cameraEnabled={profile?.cameraEnabled ?? false}
           forceRawSignal={forceRawSignal}
           viewingDistanceCm={profile?.viewingDistanceCm ?? 40}
           fontSizePreference={profile?.fontSizePreference ?? 'normal'}
         />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app py-12 px-6">
      {stage === 'PRE_CONTEXT' && (
        <PreContextForm value={contextPre} onChange={setContextPre} onSubmit={handlePreContextSubmit} />
      )}
      {stage === 'POST_READING_RATING' && (
        <Card className="max-w-3xl mx-auto p-10 py-12 text-center animate-in fade-in slide-in-from-bottom-8">
           <h2 className="text-3xl font-bold text-strong mb-4">Como foi a leitura?</h2>
           <p className="text-mild font-medium mb-10 text-lg">Selecione uma reação sobre a dificuldade ou conforto com este texto.</p>
           
           <div className="flex justify-center gap-6 mb-12">
              {[
                { emoji: '🤩', label: 'Excelente' },
                { emoji: '🙂', label: 'Tranquilo' },
                { emoji: '😐', label: 'Exigente' },
                { emoji: '😵‍💫', label: 'Cansativo' }
              ].map(s => (
                 <button
                   key={s.emoji}
                   onClick={() => setReadingRating(s.label)}
                   className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all hover:-translate-y-1 active:scale-95 ${readingRating === s.label ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' : 'border-transparent hover:bg-surface-sunken hover:border-line'}`}
                 >
                    <span className="text-6xl drop-shadow-sm">{s.emoji}</span>
                    <span className={`text-sm font-bold uppercase tracking-wide ${readingRating === s.label ? 'text-blue-600' : 'text-mild'}`}>{s.label}</span>
                 </button>
              ))}
           </div>

           <div className="bg-surface-sunken p-8 rounded-2xl text-left border border-line mb-6">
              <h3 className="text-sm font-bold text-faint uppercase tracking-widest mb-6">Cadência de leitura (toques)</h3>
              <div className="grid grid-cols-2 gap-6">
                 <div>
                    <div className="text-xl font-bold text-strong">
                      {readingExtraData?.intervals?.length ? Math.round(readingExtraData.intervals.reduce((a:number,b:number)=>a+b,0)/readingExtraData.intervals.length) : 0} ms
                    </div>
                    <div className="text-mild text-sm font-medium mt-1">Tempo médio entre toques</div>
                 </div>
                 <div>
                    <div className="text-xl font-bold text-strong">
                       {readingExtraData?.intervals?.length || 0}
                    </div>
                    <div className="text-mild text-sm font-medium mt-1">Trechos avançados</div>
                 </div>
              </div>
           </div>

           {readingExtraData?.saccadeMetrics?.trackingAvailable ? (
              <div className="bg-accent-soft p-8 rounded-2xl text-left border border-accent-line mb-10">
                 <h3 className="text-sm font-bold text-indigo-500 uppercase tracking-widest mb-2">Dinâmica ocular de leitura - experimental</h3>
                 <p className="text-xs text-indigo-400 font-medium mb-4">
                   Valores aproximados por webcam. A análise prioriza movimento relativo,
                   sacadas, regressões e fixações; não promete palavra exata no texto.
                 </p>
                 {(() => {
                   const summary = summarizeReadingDynamics(readingExtraData.saccadeMetrics, readingExtraData.signalCoverage ?? null);
                   return (
                     <div className="bg-white/70 rounded-xl border border-accent-line p-4 mb-6">
                       <div className="flex flex-wrap gap-2 mb-2">
                         <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                           summary.signalQuality.tone === 'emerald'
                             ? 'bg-emerald-100 text-emerald-700'
                             : summary.signalQuality.tone === 'rose'
                               ? 'bg-rose-100 text-rose-700'
                               : 'bg-amber-100 text-amber-700'
                         }`}>
                           {summary.signalQuality.label}
                         </span>
                         <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                           {summary.signalQuality.sourceLabel}
                         </span>
                         <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                           {summary.signalQuality.sampleRateLabel}
                         </span>
                       </div>
                       <p className="text-xs text-indigo-400 font-medium mb-2">{summary.signalLabel} · {summary.positionLabel}</p>
                       <p className="text-sm text-slate-700 font-medium">{summary.primaryInsight}</p>
                       <p className="text-xs text-slate-500 font-medium mt-2">{summary.confidenceNote}</p>
                     </div>
                   );
                 })()}
                 <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                    <div>
                       <div className="text-xl font-bold text-strong">{formatSampleRateHz(readingExtraData.saccadeMetrics.sampleRateHz)}</div>
                       <div className="text-mild text-sm font-medium mt-1">Taxa efetiva</div>
                    </div>
                    <div>
                       <div className="text-xl font-bold text-strong">{readingExtraData.saccadeMetrics.saccadeCount}</div>
                       <div className="text-mild text-sm font-medium mt-1">Sacadas</div>
                    </div>
                    <div>
                       <div className="text-xl font-bold text-strong">{readingExtraData.saccadeMetrics.regressionCount}</div>
                       <div className="text-mild text-sm font-medium mt-1">Regressões</div>
                    </div>
                    <div>
                       <div className="text-xl font-bold text-strong">
                         {readingExtraData.saccadeMetrics.meanFixationMs != null
                           ? `${Math.round(readingExtraData.saccadeMetrics.meanFixationMs)} ms`
                           : 'não estimável'}
                       </div>
                       <div className="text-mild text-sm font-medium mt-1">Fixação média</div>
                    </div>
                    <div>
                       <div className="text-xl font-bold text-strong">
                         {readingExtraData.saccadeMetrics.meanSaccadeAmplitude != null
                           ? readingExtraData.saccadeMetrics.meanSaccadeAmplitude.toFixed(2)
                           : 'não estimável'}
                       </div>
                       <div className="text-mild text-sm font-medium mt-1">Amplitude (aprox.)</div>
                    </div>
                 </div>
              </div>
           ) : (
              <div className="bg-surface-sunken p-6 rounded-2xl text-left border border-line mb-10">
                 <p className="text-sm text-mild font-medium">
                   Dinâmica ocular por webcam indisponível nesta sessão (câmera desligada ou rosto não detectado).
                 </p>
              </div>
           )}

           <button
             onClick={() => {
                if (currentExerciseIndex < plan!.exercises.length - 1) {
                  setCurrentExerciseIndex(prev => prev + 1);
                  setStage('PRE_EXERCISE_INFO');
                } else {
                  setStage('POST_CONTEXT');
                }
             }}
             className="px-10 py-4 bg-ink text-ink-foreground rounded-xl text-lg font-bold w-full hover:bg-slate-800 transition-colors"
           >
             Continuar
           </button>
        </Card>
      )}
      {stage === 'POST_CONTEXT' && (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="max-w-2xl mx-auto mb-8 text-center">
            <h2 className="text-3xl font-bold text-strong">Sessão Concluída!</h2>
            <p className="text-mild text-lg mt-2 font-medium">Registre como terminaste.</p>
          </div>
          <PostContextForm value={contextPost} onChange={setContextPost} onSubmit={finalizeSession} />
        </div>
      )}
      {stage === 'SUMMARY' && (
        <Card className="max-w-3xl mx-auto p-10 md:p-14 text-center">
           <h2 className="text-3xl font-bold text-strong mb-6">Excelente trabalho!</h2>
           <p className="text-mild text-xl font-medium mb-12">Seu histórico foi salvo com sucesso.</p>
           
           <div className="grid grid-cols-2 gap-4 mb-12 text-left">
             <div className="bg-surface-sunken p-6 rounded-2xl">
               <div className="text-sm text-mild font-bold uppercase tracking-wider mb-2">Exercícios</div>
               <div className="text-3xl font-semibold text-strong">{results.length}</div>
             </div>
             <div className="bg-surface-sunken p-6 rounded-2xl">
               <div className="text-sm text-mild font-bold uppercase tracking-wider mb-2">Estabilidade Média</div>
               <div className="text-3xl font-semibold text-strong">
                 {(() => {
                    const scores = results.map(r => r.headStillnessScore).filter((s): s is number => s !== null);
                    return scores.length ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%` : 'N/D';
                 })()}
               </div>
             </div>
           </div>

           {(() => {
              const ocular = results.filter(r =>
                r.extraData?.fixationMetrics?.trackingAvailable ||
                r.extraData?.saccadeTaskMetrics?.trackingAvailable ||
                r.extraData?.pursuitMetrics?.trackingAvailable
              );
              if (ocular.length === 0) return null;
              const name = (id: string) => id === 'fixation' ? 'Fixação' : id === 'saccades' ? 'Sacadas' : id === 'smooth_pursuit' ? 'Perseguição' : id;
              return (
                <div className="bg-accent-soft p-8 rounded-2xl text-left border border-accent-line mb-12">
                   <h3 className="text-sm font-bold text-indigo-500 uppercase tracking-widest mb-2">Métricas oculares — experimental (webcam)</h3>
                   <p className="text-xs text-indigo-400 font-medium mb-6">
                     Valores aproximados a partir da câmera calibrada, com taxa dependente
                     do dispositivo/browser e acurácia limitada pela webcam.
                     A posição na tela é apoio; a leitura principal vem do padrão temporal
                     de fixações, sacadas e regressões.
                   </p>
                   <div className="space-y-5">
                      {ocular.map((r, i) => {
                         const fx = r.extraData?.fixationMetrics;
                         const sc = r.extraData?.saccadeTaskMetrics;
                         const pu = r.extraData?.pursuitMetrics;
                         const dv = r.extraData?.detectorValidation;
                         const stat = (label: string, value: string) => (
                            <div key={label}>
                               <div className="text-lg font-bold text-strong">{value}</div>
                               <div className="text-mild text-xs font-medium mt-1">{label}</div>
                            </div>
                         );
                         return (
                            <div key={i} className="bg-surface rounded-xl p-5 border border-accent-line">
                               <div className="text-sm font-bold text-mild mb-3">{name(r.exerciseId)}</div>
                               <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                  {fx?.trackingAvailable && [
                                     stat('Tempo na mira', `${Math.round(fx.percentWithinThreshold)}%`),
                                     stat('Dispersão média', `${fx.meanDispersionDeg.toFixed(1)}°`),
                                     stat('Quebras de fixação', `${fx.fixationBreaks}`),
                                  ]}
                                  {sc?.trackingAvailable && [
                                     stat('Latência média', sc.meanLatencyMs != null ? `${Math.round(sc.meanLatencyMs)} ms` : 'sem latência válida'),
                                     stat('Precisão (erro)', `${sc.meanAccuracyDeg.toFixed(1)}°`),
                                     stat('Ganho médio', sc.meanGain.toFixed(2)),
                                  ]}
                                  {pu?.trackingAvailable && [
                                     stat('Ganho de perseguição', pu.gain.toFixed(2)),
                                     stat('Erro de rastreio', `${pu.rmsErrorDeg.toFixed(1)}°`),
                                     stat('Tempo no alvo', `${Math.round(pu.percentOnTarget)}%`),
                                  ]}
                               </div>
                               {dv?.trackingAvailable && (
                                  <div className="mt-4 pt-4 border-t border-accent-line">
                                     <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-3">
                                        Validação interna do detector (instrumento, não usuário)
                                     </div>
                                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {stat('Detecção dos saltos', `${dv.matchedJumps}/${dv.targetJumps} (${Math.round(dv.detectionRate * 100)}%)`)}
                                        {stat('Falsos positivos/min', dv.falsePositivesPerMin.toFixed(1))}
                                        {stat('Latência mediana', dv.medianLatencyMs != null ? `${Math.round(dv.medianLatencyMs)} ms` : 'não estimável')}
                                        {stat('Ganho de amplitude', dv.meanAmplitudeGain != null ? dv.meanAmplitudeGain.toFixed(2) : 'não estimável')}
                                     </div>
                                  </div>
                               )}
                            </div>
                         );
                      })}
                   </div>
                </div>
              );
           })()}

           {(() => {
              const postural = results.filter(r =>
                r.extraData?.posturalStability && r.extraData.posturalStability.status !== 'insufficient'
              );
              if (postural.length === 0) return null;
              const name = (id: string) => id === 'fixation' ? 'Fixação' : id === 'saccades' ? 'Sacadas' : id === 'smooth_pursuit' ? 'Perseguição' : id;
              return (
                <div className="bg-teal-50 p-8 rounded-2xl text-left border border-teal-100 mb-12">
                   <h3 className="text-sm font-bold text-teal-600 uppercase tracking-widest mb-2">Estabilidade cervical/postural — experimental</h3>
                   <p className="text-xs text-teal-500 font-medium mb-6">
                     Índice separado da dinâmica ocular, estimado pela posição da cabeça (face)
                     e pelo Motion Assist do aparelho. Mede o quão firme a postura ficou; não
                     corrige o olhar nem substitui avaliação clínica.
                   </p>
                   <div className="space-y-4">
                      {postural.map((r, i) => {
                         const p = r.extraData.posturalStability;
                         return (
                            <div key={i} className="bg-white rounded-xl p-5 border border-teal-100">
                               <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-bold text-slate-700">{name(r.exerciseId)}</span>
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${p.status === 'stable' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{p.label}</span>
                               </div>
                               <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                  <div>
                                     <div className="text-lg font-bold text-slate-800">{p.cervicalStability}%</div>
                                     <div className="text-slate-500 text-xs font-medium mt-1">Estabilidade cervical</div>
                                  </div>
                                  <div>
                                     <div className="text-lg font-bold text-slate-800">{p.sustainedTiltDeg.toFixed(1)}°</div>
                                     <div className="text-slate-500 text-xs font-medium mt-1">Inclinação sustentada</div>
                                  </div>
                                  <div>
                                     <div className="text-lg font-bold text-slate-800">{p.rotationRange.toFixed(1)}</div>
                                     <div className="text-slate-500 text-xs font-medium mt-1">Amplitude de rotação</div>
                                  </div>
                                  <div>
                                     <div className="text-lg font-bold text-slate-800">{p.baselineApplied ? 'Sim' : 'Não'}</div>
                                     <div className="text-slate-500 text-xs font-medium mt-1">Baseline aplicado</div>
                                  </div>
                                  <div>
                                     <div className="text-lg font-bold text-slate-800">{p.motionDeltaDeg != null ? `${p.motionDeltaDeg.toFixed(1)}°` : 'N/D'}</div>
                                     <div className="text-slate-500 text-xs font-medium mt-1">Delta aparelho</div>
                                  </div>
                               </div>
                            </div>
                         );
                      })}
                   </div>
                </div>
              );
           })()}

           <button onClick={() => navigate('/')} className="px-10 py-4 bg-ink text-ink-foreground rounded-xl text-lg font-bold w-full hover:bg-slate-800 transition-colors">Voltar ao Início</button>
        </Card>
      )}
    </div>
  );
}

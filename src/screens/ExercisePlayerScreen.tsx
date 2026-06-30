import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SymptomScale } from '@/components/SymptomScale';
import { ExerciseCanvas } from '@/components/ExerciseCanvas';
import { useAppStore } from '@/store/useAppStore';
import { generateTreatmentPlan } from '@/services/planner';
import { checkSymptomsSafety } from '@/services/safety';
import { saveSession } from '@/services/storage';
import { CalibrationOverlay } from '@/components/CalibrationOverlay';
import { isCalibrated } from '@/services/gazeCalibration';
import { stopCameraStream } from '@/services/cameraStream';
import { requestMotionPermissionFromGesture, startMotionSensor, stopMotionSensor } from '@/services/motionSensor';
import { resetPosturalBaseline } from '@/exercises/posturalStability';
import { summarizeReadingDynamics } from '@/exercises/readingDynamics';
import { SymptomRating, TreatmentPlanResponse, SessionResult, ExerciseResult } from '@/types';

type PlayerStage = 'PRE_SYMPTOMS' | 'LOADING_PLAN' | 'BLOCKED' | 'PRE_EXERCISE_INFO' | 'CALIBRATION' | 'EXERCISE' | 'POST_READING_RATING' | 'POST_SYMPTOMS' | 'SUMMARY';

export function ExercisePlayerScreen() {
  const navigate = useNavigate();
  const location = useLocation() as any;
  const singleExerciseId = location.state?.singleExercise;

  const { profile } = useAppStore();
  const [stage, setStage] = useState<PlayerStage>('PRE_SYMPTOMS');
  const [symptomsPre, setSymptomsPre] = useState<SymptomRating>({
    dorOcular: 0, cefaleia: 0, visaoDupla: 0, tontura: 0, nausea: 0, fotofobia: 0, fadigaVisual: 0, borramento: 0
  });
  const [symptomsPost, setSymptomsPost] = useState<SymptomRating>({
    dorOcular: 0, cefaleia: 0, visaoDupla: 0, tontura: 0, nausea: 0, fotofobia: 0, fadigaVisual: 0, borramento: 0
  });
  
  const [plan, setPlan] = useState<TreatmentPlanResponse | null>(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [results, setResults] = useState<ExerciseResult[]>([]);
  const [safetyReason, setSafetyReason] = useState("");
  const [readingExtraData, setReadingExtraData] = useState<any>(null);
  const [readingRating, setReadingRating] = useState<string | null>(null);
  // Once the user has been offered calibration this session, don't prompt again.
  const [calibrationOffered, setCalibrationOffered] = useState(false);

  useEffect(() => () => {
    stopCameraStream();
    stopMotionSensor();
    resetPosturalBaseline();
  }, []);

  // Decide whether to calibrate before the exercise, then enter it.
  const proceedToExercise = async () => {
    if (profile?.cameraEnabled ?? false) {
      const motionPermission = await requestMotionPermissionFromGesture();
      if (motionPermission === 'granted') startMotionSensor();
    }
    const needsCalibration = (profile?.cameraEnabled ?? false) && !isCalibrated() && !calibrationOffered;
    setStage(needsCalibration ? 'CALIBRATION' : 'EXERCISE');
  };

  const handlePreSymptomsSubmit = async () => {
    const safety = checkSymptomsSafety(symptomsPre);
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
        clinicianSummaryPtBR: "Prática avulsa."
      });
      setStage('PRE_EXERCISE_INFO');
      return;
    }

    // Mock call since we'll use fallback for reliability without keys
    const generatedPlan = await generateTreatmentPlan(profile || { contrastPreference: 'light' } as any, symptomsPre, []);
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
    const exerciseCompleted = !extraData?.invalidReason;
    const newResult: ExerciseResult = {
      exerciseId: plan!.exercises[currentExerciseIndex].exerciseId,
      completed: exerciseCompleted,
      score,
      headStillnessScore: stillness,
      parametersUsed: curParam,
      timestamp: Date.now(),
      extraData
    };
    
    setResults([...results, newResult]);
    
    if (extraData && !extraData.invalidReason && Array.isArray(extraData.intervals)) {
       setReadingExtraData(extraData);
       setStage('POST_READING_RATING');
       return;
    }

    if (currentExerciseIndex < plan!.exercises.length - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
      setStage('PRE_EXERCISE_INFO'); // show info for next exercise
    } else {
      setStage('POST_SYMPTOMS');
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
      symptomsBefore: symptomsPre,
      symptomsAfter: symptomsPost,
      exercises,
      clinicianSummaryPtBR: plan!.clinicianSummaryPtBR
    };
    await saveSession(session);
    setStage('SUMMARY');
  };

  if (stage === 'BLOCKED') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-3xl font-bold text-slate-800 mb-4">Treino Suspenso</h2>
        <p className="text-xl text-slate-600 max-w-xl mb-8">{safetyReason}</p>
        <button onClick={() => navigate('/')} className="px-8 py-3 bg-slate-900 text-white rounded-xl text-lg font-medium">Voltar ao Início</button>
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
        onComplete={() => { setCalibrationOffered(true); setStage('EXERCISE'); }}
        onSkip={() => { setCalibrationOffered(true); setStage('EXERCISE'); }}
        keepCameraOnClose
      />
    );
  }

  if (stage === 'EXERCISE' && plan) {
    const ex = plan.exercises[currentExerciseIndex];
    return (
      <div className="w-screen h-screen relative bg-slate-900">
         <button onClick={() => setStage('POST_SYMPTOMS')} className="absolute top-6 right-6 z-50 px-6 py-3 bg-slate-800/80 hover:bg-red-600/90 text-white rounded-full font-medium transition-colors border border-slate-700">Parar Imediatamente</button>
         <ExerciseCanvas
           exerciseId={ex.exerciseId}
           parameters={ex.parameters}
           onFinish={handleExerciseFinish}
           cameraEnabled={profile?.cameraEnabled ?? false}
           viewingDistanceCm={profile?.viewingDistanceCm ?? 40}
           fontSizePreference={profile?.fontSizePreference ?? 'normal'}
         />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6">
      {stage === 'PRE_SYMPTOMS' && (
        <SymptomScale symptoms={symptomsPre} onChange={setSymptomsPre} onSubmit={handlePreSymptomsSubmit} />
      )}
      {stage === 'POST_READING_RATING' && (
        <div className="max-w-3xl mx-auto bg-white p-10 py-12 rounded-3xl shadow-sm border border-slate-100 text-center animate-in fade-in slide-in-from-bottom-8">
           <h2 className="text-3xl font-bold text-slate-800 mb-4">Como foi a leitura?</h2>
           <p className="text-slate-500 font-medium mb-10 text-lg">Selecione uma reação sobre a dificuldade ou conforto com este texto.</p>
           
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
                   className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all hover:-translate-y-1 active:scale-95 ${readingRating === s.label ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' : 'border-transparent hover:bg-slate-50 hover:border-slate-100'}`}
                 >
                    <span className="text-6xl drop-shadow-sm">{s.emoji}</span>
                    <span className={`text-sm font-bold uppercase tracking-wide ${readingRating === s.label ? 'text-blue-600' : 'text-slate-500'}`}>{s.label}</span>
                 </button>
              ))}
           </div>

           <div className="bg-slate-50 p-8 rounded-2xl text-left border border-slate-100 mb-6">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Cadência de leitura (toques)</h3>
              <div className="grid grid-cols-2 gap-6">
                 <div>
                    <div className="text-xl font-bold text-slate-800">
                      {readingExtraData?.intervals?.length ? Math.round(readingExtraData.intervals.reduce((a:number,b:number)=>a+b,0)/readingExtraData.intervals.length) : 0} ms
                    </div>
                    <div className="text-slate-500 text-sm font-medium mt-1">Tempo médio entre toques</div>
                 </div>
                 <div>
                    <div className="text-xl font-bold text-slate-800">
                       {readingExtraData?.intervals?.length || 0}
                    </div>
                    <div className="text-slate-500 text-sm font-medium mt-1">Trechos avançados</div>
                 </div>
              </div>
           </div>

           {readingExtraData?.saccadeMetrics?.trackingAvailable ? (
              <div className="bg-indigo-50 p-8 rounded-2xl text-left border border-indigo-100 mb-10">
                 <h3 className="text-sm font-bold text-indigo-500 uppercase tracking-widest mb-2">Dinâmica ocular de leitura - experimental</h3>
                 <p className="text-xs text-indigo-400 font-medium mb-4">
                   Valores aproximados por webcam. A análise prioriza movimento relativo,
                   sacadas, regressões e fixações; não promete palavra exata no texto.
                 </p>
                 {(() => {
                   const summary = summarizeReadingDynamics(readingExtraData.saccadeMetrics, readingExtraData.signalCoverage ?? null);
                   return (
                     <div className="bg-white/70 rounded-xl border border-indigo-100 p-4 mb-6">
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
                       <div className="text-xl font-bold text-slate-800">{readingExtraData.saccadeMetrics.sampleRateHz ? `${readingExtraData.saccadeMetrics.sampleRateHz} Hz` : 'N/D'}</div>
                       <div className="text-slate-500 text-sm font-medium mt-1">Taxa efetiva</div>
                    </div>
                    <div>
                       <div className="text-xl font-bold text-slate-800">{readingExtraData.saccadeMetrics.saccadeCount}</div>
                       <div className="text-slate-500 text-sm font-medium mt-1">Sacadas</div>
                    </div>
                    <div>
                       <div className="text-xl font-bold text-slate-800">{readingExtraData.saccadeMetrics.regressionCount}</div>
                       <div className="text-slate-500 text-sm font-medium mt-1">Regressões</div>
                    </div>
                    <div>
                       <div className="text-xl font-bold text-slate-800">{Math.round(readingExtraData.saccadeMetrics.meanFixationMs)} ms</div>
                       <div className="text-slate-500 text-sm font-medium mt-1">Fixação média</div>
                    </div>
                    <div>
                       <div className="text-xl font-bold text-slate-800">{readingExtraData.saccadeMetrics.meanSaccadeAmplitude.toFixed(2)}</div>
                       <div className="text-slate-500 text-sm font-medium mt-1">Amplitude (aprox.)</div>
                    </div>
                 </div>
              </div>
           ) : (
              <div className="bg-slate-50 p-6 rounded-2xl text-left border border-slate-100 mb-10">
                 <p className="text-sm text-slate-500 font-medium">
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
                  setStage('POST_SYMPTOMS');
                }
             }}
             className="px-10 py-4 bg-slate-900 text-white rounded-xl text-lg font-bold w-full hover:bg-slate-800 transition-colors"
           >
             Continuar
           </button>
        </div>
      )}
      {stage === 'POST_SYMPTOMS' && (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="max-w-2xl mx-auto mb-8 text-center">
            <h2 className="text-3xl font-bold text-slate-800">Sessão Concluída!</h2>
            <p className="text-slate-500 text-lg mt-2 font-medium">Por favor, reavalie seus sintomas.</p>
          </div>
          <SymptomScale symptoms={symptomsPost} onChange={setSymptomsPost} onSubmit={finalizeSession} />
        </div>
      )}
      {stage === 'SUMMARY' && (
        <div className="max-w-3xl mx-auto bg-white p-10 md:p-14 rounded-3xl shadow-sm border border-slate-100 text-center">
           <h2 className="text-3xl font-bold text-slate-800 mb-6">Excelente trabalho!</h2>
           <p className="text-slate-600 text-xl font-medium mb-12">Seu histórico foi salvo com sucesso.</p>
           
           <div className="grid grid-cols-2 gap-4 mb-12 text-left">
             <div className="bg-slate-50 p-6 rounded-2xl">
               <div className="text-sm text-slate-500 font-bold uppercase tracking-wider mb-2">Exercícios</div>
               <div className="text-3xl font-semibold text-slate-800">{results.length}</div>
             </div>
             <div className="bg-slate-50 p-6 rounded-2xl">
               <div className="text-sm text-slate-500 font-bold uppercase tracking-wider mb-2">Estabilidade Média</div>
               <div className="text-3xl font-semibold text-slate-800">
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
                <div className="bg-indigo-50 p-8 rounded-2xl text-left border border-indigo-100 mb-12">
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
                         const stat = (label: string, value: string) => (
                            <div key={label}>
                               <div className="text-lg font-bold text-slate-800">{value}</div>
                               <div className="text-slate-500 text-xs font-medium mt-1">{label}</div>
                            </div>
                         );
                         return (
                            <div key={i} className="bg-white rounded-xl p-5 border border-indigo-100">
                               <div className="text-sm font-bold text-slate-700 mb-3">{name(r.exerciseId)}</div>
                               <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                  {fx?.trackingAvailable && [
                                     stat('Tempo na mira', `${Math.round(fx.percentWithinThreshold)}%`),
                                     stat('Dispersão média', `${fx.meanDispersionDeg.toFixed(1)}°`),
                                     stat('Quebras de fixação', `${fx.fixationBreaks}`),
                                  ]}
                                  {sc?.trackingAvailable && [
                                     stat('Latência média', `${Math.round(sc.meanLatencyMs)} ms`),
                                     stat('Precisão (erro)', `${sc.meanAccuracyDeg.toFixed(1)}°`),
                                     stat('Ganho médio', sc.meanGain.toFixed(2)),
                                  ]}
                                  {pu?.trackingAvailable && [
                                     stat('Ganho de perseguição', pu.gain.toFixed(2)),
                                     stat('Erro de rastreio', `${pu.rmsErrorDeg.toFixed(1)}°`),
                                     stat('Tempo no alvo', `${Math.round(pu.percentOnTarget)}%`),
                                  ]}
                               </div>
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

           <button onClick={() => navigate('/')} className="px-10 py-4 bg-slate-900 text-white rounded-xl text-lg font-bold w-full hover:bg-slate-800 transition-colors">Voltar ao Início</button>
        </div>
      )}
    </div>
  );
}

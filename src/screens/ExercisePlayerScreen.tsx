import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SymptomScale } from '@/components/SymptomScale';
import { ExerciseCanvas } from '@/components/ExerciseCanvas';
import { useAppStore } from '@/store/useAppStore';
import { generateTreatmentPlan } from '@/services/geminiPlanner';
import { checkSymptomsSafety } from '@/services/safety';
import { saveSession } from '@/services/storage';
import { SymptomRating, GeminiPlanResponse, SessionResult, ExerciseResult } from '@/types';

type PlayerStage = 'PRE_SYMPTOMS' | 'LOADING_PLAN' | 'BLOCKED' | 'PRE_EXERCISE_INFO' | 'EXERCISE' | 'POST_READING_RATING' | 'POST_SYMPTOMS' | 'SUMMARY';

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
  
  const [plan, setPlan] = useState<GeminiPlanResponse | null>(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [results, setResults] = useState<ExerciseResult[]>([]);
  const [safetyReason, setSafetyReason] = useState("");
  const [readingExtraData, setReadingExtraData] = useState<any>(null);

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

  const handleExerciseFinish = (score: number, stillness: number, extraData?: any) => {
    const curParam = plan!.exercises[currentExerciseIndex].parameters;
    const newResult: ExerciseResult = {
      exerciseId: plan!.exercises[currentExerciseIndex].exerciseId,
      completed: true,
      score,
      headStillnessScore: stillness,
      parametersUsed: curParam,
      timestamp: Date.now(),
      extraData
    };
    
    setResults([...results, newResult]);
    
    if (extraData && extraData.intervals) {
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
    const session: SessionResult = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      durationSec: plan!.exercises.reduce((acc, ex) => acc + ex.durationSec, 0),
      symptomsBefore: symptomsPre,
      symptomsAfter: symptomsPost,
      exercises: results,
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
        <button onClick={() => setStage('EXERCISE')} className="px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-2xl font-bold shadow-lg transition-transform active:scale-95">
          Estou Pronto
        </button>
      </div>
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
                 <button key={s.emoji} className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all hover:-translate-y-1 active:scale-95">
                    <span className="text-6xl drop-shadow-sm">{s.emoji}</span>
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wide">{s.label}</span>
                 </button>
              ))}
           </div>

           <div className="bg-slate-50 p-8 rounded-2xl text-left border border-slate-100 mb-10">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Métricas de Ritmo (Estimativa Sacádica)</h3>
              <div className="grid grid-cols-2 gap-6">
                 <div>
                    <div className="text-xl font-bold text-slate-800">
                      {readingExtraData?.intervals?.length ? Math.round(readingExtraData.intervals.reduce((a:number,b:number)=>a+b,0)/readingExtraData.intervals.length) : 0} ms
                    </div>
                    <div className="text-slate-500 text-sm font-medium mt-1">Média por trecho</div>
                 </div>
                 <div>
                    <div className="text-xl font-bold text-slate-800">
                       {readingExtraData?.intervals?.length || 0}
                    </div>
                    <div className="text-slate-500 text-sm font-medium mt-1">Trechos Lidos</div>
                 </div>
              </div>
           </div>

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
                 {Math.round(results.reduce((a, b) => a + b.headStillnessScore, 0) / (results.length || 1))}%
               </div>
             </div>
           </div>

           <button onClick={() => navigate('/')} className="px-10 py-4 bg-slate-900 text-white rounded-xl text-lg font-bold w-full hover:bg-slate-800 transition-colors">Voltar ao Início</button>
        </div>
      )}
    </div>
  );
}

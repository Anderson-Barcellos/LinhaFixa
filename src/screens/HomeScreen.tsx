import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, TrendingUp, Settings, Activity, ArrowRight, Target, Maximize, FastForward, BookOpen, ScanEye } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getSessions } from '@/services/storage';
import { SessionResult } from '@/types';

export function HomeScreen() {
  const navigate = useNavigate();
  const { profile } = useAppStore();
  const [sessions, setSessions] = useState<SessionResult[]>([]);

  useEffect(() => {
    getSessions().then(data => setSessions(data));
  }, []);

  const hasSessions = sessions.length > 0;

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 md:p-12 overflow-y-auto">
      <header className="flex justify-between items-center mb-10 w-full max-w-5xl mx-auto">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">Linha Fixa</h1>
          <p className="text-slate-500 font-medium text-lg mt-1">Treino e terapia oculomotor visual</p>
        </div>
        <div className="flex gap-4">
           {profile?.name && <div className="hidden md:flex items-center text-slate-600 font-medium bg-white border border-slate-200 px-4 py-2 rounded-full shadow-sm">Olá, {profile.name}</div>}
           <button onClick={() => navigate('/settings')} className="p-2 lg:p-3 bg-white rounded-full hover:bg-slate-100 shadow-sm border border-slate-200 text-slate-600">
             <Settings className="w-5 h-5 lg:w-6 lg:h-6" />
           </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto flex flex-col gap-8">
        
        {/* Main Action Banner */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2rem] p-8 md:p-12 shadow-lg relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
           <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <Activity className="w-64 h-64 text-white" />
           </div>
           
           <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Sessão Guiada do Dia</h2>
              <p className="text-indigo-100 text-lg max-w-xl font-medium mb-8">
                Um plano de treino inteligente variando exercícios de Fixação, Sacadas, Perseguição e Leitura Assistida de forma adaptada para o seu ritmo hoje.
              </p>
              <button 
                onClick={() => navigate('/player')}
                className="px-8 py-4 bg-white text-indigo-700 font-bold rounded-2xl hover:bg-indigo-50 hover:scale-105 transition-all shadow-md flex items-center gap-3 text-lg w-full md:w-auto justify-center"
              >
                <Play className="w-6 h-6 fill-indigo-700" />
                Começar Treino Inteligente
              </button>
           </div>
           
           {hasSessions && (
              <button 
                onClick={() => navigate('/dashboard')}
                className="bg-white/10 hover:bg-white/20 border border-white/20 transition-colors rounded-2xl p-6 text-white text-left w-full md:w-auto relative z-10 backdrop-blur-md"
              >
                 <div className="mb-2 text-indigo-100 font-medium uppercase tracking-wider text-sm">Resumo</div>
                 <div className="flex items-center gap-4">
                    <TrendingUp className="w-8 h-8" />
                    <div>
                       <div className="text-2xl font-bold">{sessions.length}</div>
                       <div className="text-sm text-indigo-100">Sessões Concluídas</div>
                    </div>
                 </div>
              </button>
           )}
        </div>

        {/* Exercises Direct Access Grid */}
        <div>
           <div className="flex items-center justify-between mb-6">
             <h3 className="text-2xl font-bold text-slate-800">Exercícios Imediatos</h3>
             <button onClick={() => navigate('/library')} className="text-indigo-600 font-bold flex items-center gap-1 hover:text-indigo-700">Ver Biblioteca <ArrowRight className="w-4 h-4" /></button>
           </div>
           
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
             {[
               { id: 'fixation', label: 'Fixação Visual', desc: 'Mantenha o foco em um ponto.', icon: Target, color: 'text-amber-500', bg: 'bg-amber-100' },
               { id: 'saccades', label: 'Movimentos Sacádicos', desc: 'Siga os saltos do alvo rapida.', icon: FastForward, color: 'text-emerald-500', bg: 'bg-emerald-100' },
               { id: 'smooth_pursuit', label: 'Perseguição Suave', desc: 'Acompanhe alvos em movimento.', icon: Maximize, color: 'text-blue-500', bg: 'bg-blue-100' },
               { id: 'assistedReading', label: 'Leitura Assistida', desc: 'Leitura interativa guiada.', icon: BookOpen, color: 'text-purple-500', bg: 'bg-purple-100' },
             ].map(ex => (
                <button 
                  key={ex.id}
                  onClick={() => navigate('/player', { state: { singleExercise: ex.id } })}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left flex flex-col h-full"
                >
                   <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${ex.bg}`}>
                      <ex.icon className={`w-6 h-6 ${ex.color}`} />
                   </div>
                   <h4 className="font-bold text-slate-800 text-lg mb-1">{ex.label}</h4>
                   <p className="text-slate-500 text-sm font-medium">{ex.desc}</p>
                </button>
             ))}
           </div>
        </div>

        {/* Diagnostics shortcut */}
        <button
          onClick={() => navigate('/eye-tracking-test')}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left flex items-center gap-4"
        >
           <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-100 shrink-0">
              <ScanEye className="w-6 h-6 text-slate-600" />
           </div>
           <div className="flex-1">
              <h4 className="font-bold text-slate-800 text-lg">Diagnóstico de rastreamento</h4>
              <p className="text-slate-500 text-sm font-medium">Teste a detecção e o acompanhamento dos olhos durante a leitura (ideal em landscape).</p>
           </div>
           <ArrowRight className="w-5 h-5 text-slate-400" />
        </button>

      </main>
    </div>
  );
}

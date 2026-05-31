import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessions } from '@/services/storage';
import { SessionResult } from '@/types';
import { Activity, ArrowLeft, Clock, Eye, AlertTriangle, Sparkles, Download } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ZAxis } from 'recharts';

export function DashboardScreen() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    getSessions().then(data => {
      setSessions(data.sort((a,b) => b.timestamp - a.timestamp));
      setLoading(false);
    });
  }, []);

  const { facil, dificil } = useMemo(() => {
    const dataFacil: { chunk: number; time: number }[] = [];
    const dataDificil: { chunk: number; time: number }[] = [];

    sessions.forEach(session => {
      session.exercises.forEach(ex => {
        if (ex.exerciseId === 'assistedReading' && ex.extraData?.intervals) {
          const complexity = ex.extraData.textComplexity || 'facil';
          const intervals: number[] = ex.extraData.intervals;
          intervals.forEach((interval, index) => {
            if (complexity === 'facil') {
              dataFacil.push({ chunk: index + 1, time: interval });
            } else {
              dataDificil.push({ chunk: index + 1, time: interval });
            }
          });
        }
      });
    });

    return { facil: dataFacil, dificil: dataDificil };
  }, [sessions]);

  const generateInsight = async () => {
    if (sessions.length === 0) return;
    setInsightLoading(true);
    try {
      const summaryPayload = sessions.map(s => ({
         date: new Date(s.timestamp).toISOString(),
         durationMins: Math.round(s.durationSec / 60),
         maxSymptomBefore: Math.max(...(Object.values(s.symptomsBefore) as number[])),
         maxSymptomAfter: Math.max(...(Object.values(s.symptomsAfter) as number[])),
         avgHeadStillness: s.exercises.length ? s.exercises.reduce((acc, e) => acc + e.headStillnessScore, 0) / s.exercises.length : 100,
         exercisesCount: s.exercises.length
      }));

      const res = await fetch('/api/generateInsight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionSummary: summaryPayload })
      });
      const data = await res.json();
      if (data.text) {
        setInsight(data.text);
      }
    } catch(e) {
      console.error(e);
      setInsight("Não foi possível gerar a análise no momento.");
    } finally {
      setInsightLoading(false);
    }
  };

  const exportData = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(sessions, null, 2)
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = "linha_fixa_historico.json";
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/')} className="p-3 bg-white rounded-full hover:bg-slate-100 shadow-sm transition-colors border border-slate-100">
               <ArrowLeft className="w-6 h-6 text-slate-700" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Estatísticas</h1>
              <p className="text-slate-500 font-medium">Histórico de treinos e sintomas</p>
            </div>
          </div>
          <button onClick={exportData} className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 flex items-center gap-2 shadow-sm whitespace-nowrap">
             <Download className="w-5 h-5"/> Exportar Histórico (JSON)
          </button>
        </header>

        {loading ? (
          <div className="text-slate-400 font-medium">Carregando...</div>
        ) : sessions.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl text-center shadow-sm border border-slate-100">
             <p className="text-slate-500 text-lg font-medium">Nenhuma sessão registrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 mb-8 bg-gradient-to-br from-indigo-50 to-white relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Sparkles className="w-24 h-24 text-indigo-500" />
               </div>
               <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
                 <Sparkles className="w-6 h-6 text-indigo-500" />
                 Gerar Análise de Evolução (IA)
               </h3>
               <p className="text-slate-600 font-medium mb-6 relative z-10 max-w-2xl">
                 O assistente inteligente pode analisar o seu histórico de estabilidade da cabeça e variação de sintomas para oferecer uma visão encorajadora do seu progresso.
               </p>
               {!insight && !insightLoading && (
                 <button onClick={generateInsight} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors shadow-md my-2 relative z-10">
                   Analisar Meu Progresso
                 </button>
               )}
               {insightLoading && (
                 <div className="flex items-center gap-4 text-indigo-600 font-bold relative z-10">
                    <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    Analisando dados...
                 </div>
               )}
               {insight && (
                 <div className="mt-4 p-6 bg-white rounded-2xl rounded-tl-none shadow-sm border border-indigo-100 text-slate-700 text-lg leading-relaxed relative z-10">
                    {insight}
                 </div>
               )}
            </div>

            {(facil.length > 0 || dificil.length > 0) && (
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 mb-8">
                <h3 className="text-xl font-bold text-slate-800 mb-2">Cadência de Leitura (Fixações)</h3>
                <p className="text-slate-500 font-medium mb-6">Comparação do tempo de cada pulo visual em textos fáceis e difíceis.</p>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis type="number" dataKey="chunk" name="Trecho" label={{ value: 'Posição do Trecho', position: 'insideBottom', offset: -10 }} stroke="#94a3b8" />
                      <YAxis type="number" dataKey="time" name="Tempo (ms)" label={{ value: 'Tempo de Fixação (ms)', angle: -90, position: 'insideLeft', offset: 10 }} stroke="#94a3b8" />
                      <ZAxis range={[60, 60]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Scatter name="Texto Fácil" data={facil} fill="#3b82f6" fillOpacity={0.6} />
                      <Scatter name="Texto Difícil" data={dificil} fill="#ef4444" fillOpacity={0.6} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {sessions.map(s => {
               const dt = new Date(s.timestamp);
               const avgStillness = s.exercises.length ? s.exercises.reduce((acc, e) => acc + e.headStillnessScore, 0) / s.exercises.length : 0;
               return (
                 <div key={s.id} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        {dt.toLocaleDateString('pt-BR')} <span className="text-sm font-medium text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{dt.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</span>
                      </h3>
                      <div className="flex gap-6 mt-4 text-slate-600 font-medium">
                         <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-blue-500"/> {Math.round(s.durationSec / 60)} min</div>
                         <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-500"/> {s.exercises.length} ex.</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-8 bg-slate-50 py-4 px-6 rounded-2xl border border-slate-100">
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">Estabilidade</p>
                        <p className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                          <Eye className="w-5 h-5 text-indigo-500" />
                          {Math.round(avgStillness)}%
                        </p>
                      </div>
                      <div className="w-px h-12 bg-slate-200"></div>
                      <div>
                         <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">Pior Sintoma (Inicial)</p>
                         <p className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                           <AlertTriangle className="w-5 h-5 text-amber-500" />
                           {Math.max(...(Object.values(s.symptomsBefore) as number[]))}
                         </p>
                      </div>
                    </div>
                 </div>
               )
            })}
          </div>
        )}
      </div>
    </div>
  );
}

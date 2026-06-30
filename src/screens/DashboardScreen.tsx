import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessions, getValidationCaptures } from '@/services/storage';
import { apiUrl } from '@/services/apiBase';
import { buildOcularReadingSeries, buildStatisticsSummary, StatisticSectionSummary } from '@/services/statisticsSummary';
import { summarizeSaccadeSignalQuality } from '@/services/signalQuality';
import { SessionResult, ValidationCapture } from '@/types';
import { Activity, ArrowLeft, Clock, Eye, AlertTriangle, Sparkles, Download, BookOpen, ClipboardCheck, TrendingDown, BarChart3 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ZAxis } from 'recharts';

export function DashboardScreen() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [captures, setCaptures] = useState<ValidationCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([getSessions(), getValidationCaptures()]).then(([sessionResult, captureResult]) => {
      if (!active) return;
      if (sessionResult.status === 'fulfilled') {
        setSessions(sessionResult.value.sort((a,b) => b.timestamp - a.timestamp));
      } else {
        console.warn('Não foi possível carregar sessões salvas.', sessionResult.reason);
        setSessions([]);
      }
      if (captureResult.status === 'fulfilled') {
        setCaptures(captureResult.value.sort((a,b) => b.timestamp - a.timestamp));
      } else {
        console.warn('Não foi possível carregar capturas diagnósticas.', captureResult.reason);
        setCaptures([]);
      }
    }).finally(() => {
      if (!active) return;
      setLoading(false);
    });
    return () => {
      active = false;
    };
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

  const statisticsSummary = useMemo(
    () => buildStatisticsSummary(sessions, captures),
    [sessions, captures]
  );
  const ocularSeries = useMemo(
    () => buildOcularReadingSeries(sessions, captures),
    [sessions, captures]
  );

  const summaryCards = useMemo<{ id: string; icon: React.ComponentType<{ className?: string }>; summary: StatisticSectionSummary }[]>(() => [
    { id: 'training', icon: Activity, summary: statisticsSummary.sections.training },
    { id: 'symptoms', icon: TrendingDown, summary: statisticsSummary.sections.symptoms },
    { id: 'reading', icon: BookOpen, summary: statisticsSummary.sections.reading },
    { id: 'diagnostics', icon: ClipboardCheck, summary: statisticsSummary.sections.diagnostics },
    { id: 'posture', icon: Eye, summary: statisticsSummary.sections.posture },
  ], [statisticsSummary]);

  const generateInsight = async () => {
    if (sessions.length === 0 && captures.length === 0) return;
    setInsightLoading(true);
    try {
      const summaryPayload = sessions.map(s => ({
         date: new Date(s.timestamp).toISOString(),
         durationMins: Math.round(s.durationSec / 60),
         maxSymptomBefore: Math.max(...(Object.values(s.symptomsBefore) as number[])),
         maxSymptomAfter: Math.max(...(Object.values(s.symptomsAfter) as number[])),
         avgHeadStillness: (() => {
            const scores = s.exercises.map(e => e.headStillnessScore).filter((v): v is number => v !== null);
            return scores.length ? scores.reduce((acc, v) => acc + v, 0) / scores.length : null;
         })(),
         exercisesCount: s.exercises.length
      }));

      const res = await fetch(apiUrl('/api/generateInsight'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionSummary: {
            overview: statisticsSummary.overview,
            sections: (Object.values(statisticsSummary.sections) as StatisticSectionSummary[]).map(s => ({
              label: s.label,
              value: s.value,
              detail: s.detail,
              insight: s.insight,
            })),
            sessions: summaryPayload,
            diagnosticCaptures: captures.slice(0, 8).map(c => ({
              date: new Date(c.timestamp).toISOString(),
              coverage: c.coverage,
              calibrated: c.calibrated,
              sampleCount: c.sampleCount,
              saccades: c.metrics.saccadeCount,
              regressions: c.metrics.regressionCount,
              meanFixationMs: c.metrics.meanFixationMs,
              signalQuality: summarizeSaccadeSignalQuality(c.metrics, { coverage: c.coverage, calibrated: c.calibrated }).label,
              signalSource: c.metrics.signalSource,
              sampleRateHz: c.metrics.sampleRateHz,
              posturalLabel: c.postural.label,
              cervicalStability: c.postural.cervicalStability,
              posturalBaselineApplied: c.postural.baselineApplied,
              motionStatus: c.postural.motionStatus,
              motionDeltaDeg: c.postural.motionDeltaDeg,
              horizontalRange: c.axis.hRange,
              verticalRange: c.axis.vRange,
              conditions: c.conditions,
            })),
          }
        })
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
      JSON.stringify({ sessions, diagnosticCaptures: captures }, null, 2)
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
        ) : sessions.length === 0 && captures.length === 0 ? (
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
                 {statisticsSummary.sections.training.insight} {statisticsSummary.sections.diagnostics.insight}
               </p>
               {!insight && !insightLoading && (sessions.length > 0 || captures.length > 0) && (
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

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
              {summaryCards.map(({ id, icon: Icon, summary }) => (
                <SummaryBubble key={id} summary={summary} icon={<Icon className="w-5 h-5" />} />
              ))}
            </div>

            {ocularSeries.length > 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 min-w-0">
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Sacadas e regressões pelo olhar</h3>
                  <p className="text-slate-500 font-medium mb-6">
                    Contagem estimada por sinal ocular. Regressões são sacadas contra a direção esperada de leitura.
                  </p>
                  <div className="h-72 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={200}>
                      <BarChart data={ocularSeries} margin={{ top: 12, right: 12, bottom: 12, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<OcularTooltip />} />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        <Bar dataKey="saccades" name="Sacadas" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="regressions" name="Regressões" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 min-w-0">
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Fixação média pelo olhar</h3>
                  <p className="text-slate-500 font-medium mb-6">
                    Duração média entre sacadas, estimada pelo detector ocular. Valores maiores sugerem pausas visuais mais longas.
                  </p>
                  <div className="h-72 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={200}>
                      <LineChart data={ocularSeries} margin={{ top: 12, right: 12, bottom: 12, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} unit=" ms" />
                        <Tooltip content={<OcularTooltip />} />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        <Line type="monotone" dataKey="meanFixationMs" name="Fixação média" stroke="#0f766e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {(facil.length > 0 || dificil.length > 0) && (
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 mb-8 min-w-0">
                <h3 className="text-xl font-bold text-slate-800 mb-2">Avanço manual da leitura</h3>
                <p className="text-slate-500 font-medium mb-6">
                  Toques mostram apenas quando o usuário avançou o trecho. Sacadas e fixações vêm do olhar e aparecem no resumo ocular acima.
                </p>
                <div className="h-80 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={220}>
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis type="number" dataKey="chunk" name="Trecho" label={{ value: 'Posição do Trecho', position: 'insideBottom', offset: -10 }} stroke="#94a3b8" />
                      <YAxis type="number" dataKey="time" name="Tempo (ms)" label={{ value: 'Tempo entre toques (ms)', angle: -90, position: 'insideLeft', offset: 10 }} stroke="#94a3b8" />
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

            {captures.length > 0 && (
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 mb-8">
                <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  Capturas diagnósticas
                </h3>
                <p className="text-slate-500 font-medium mb-6">{statisticsSummary.sections.diagnostics.insight}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {captures.slice(0, 6).map(c => {
                    const dt = new Date(c.timestamp);
                    const quality = summarizeSaccadeSignalQuality(c.metrics, {
                      coverage: c.coverage,
                      calibrated: c.calibrated,
                    });
                    return (
                      <div key={c.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <div className="text-sm font-bold text-slate-700">{dt.toLocaleDateString('pt-BR')} às {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">{lightingLabel(c.conditions.lighting)} · {postureLabel(c.conditions.posture)} · {c.conditions.distanceCm} cm</div>
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${quality.tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' : quality.tone === 'rose' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              {quality.label}
                            </span>
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white text-slate-600 border border-slate-200">
                              {quality.sourceLabel}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                          <CapStat label="Cobertura rosto" value={`${Math.round(c.coverage)}%`} />
                          <CapStat label="Taxa" value={c.metrics.sampleRateHz ? `${c.metrics.sampleRateHz} Hz` : 'N/D'} />
                          <CapStat label="Sacadas" value={String(c.metrics.saccadeCount)} />
                          <CapStat label="Regressões" value={String(c.metrics.regressionCount)} />
                          <CapStat label="Postura" value={`${c.postural.cervicalStability}%`} />
                          <CapStat label="Delta pos." value={c.postural.motionDeltaDeg != null ? `${c.postural.motionDeltaDeg.toFixed(1)}°` : 'N/D'} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sessions.map(s => {
               const dt = new Date(s.timestamp);
               const stillnessScores = s.exercises.map(e => e.headStillnessScore).filter((v): v is number => v !== null);
               const avgStillness = stillnessScores.length ? stillnessScores.reduce((acc, v) => acc + v, 0) / stillnessScores.length : null;
               const symptomBefore = Math.max(...(Object.values(s.symptomsBefore) as number[]));
               const symptomAfter = Math.max(...(Object.values(s.symptomsAfter) as number[]));
               const symptomDelta = symptomBefore - symptomAfter;
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
                      <p className="text-sm text-slate-500 font-medium mt-3 max-w-xl">
                        {sessionInsight(s.exercises, avgStillness, symptomDelta)}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-8 bg-slate-50 py-4 px-6 rounded-2xl border border-slate-100">
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">Estabilidade</p>
                        <p className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                          <Eye className="w-5 h-5 text-indigo-500" />
                          {avgStillness !== null ? `${Math.round(avgStillness)}%` : 'N/D'}
                        </p>
                      </div>
                      <div className="w-px h-12 bg-slate-200"></div>
                      <div>
                         <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-1">Pior Sintoma (Inicial)</p>
                         <p className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                           <AlertTriangle className="w-5 h-5 text-amber-500" />
                           {symptomBefore}
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

function SummaryBubble({ summary, icon }: { key?: React.Key; summary: StatisticSectionSummary; icon: React.ReactNode }) {
  const styles = toneStyles[summary.tone];
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border ${styles.border}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${styles.icon}`}>
          {icon}
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${styles.badge}`}>{summary.label}</span>
      </div>
      <div className="text-3xl font-bold text-slate-800">{summary.value}</div>
      <div className="text-xs text-slate-400 uppercase tracking-widest font-bold mt-1 mb-3">{summary.detail}</div>
      <p className="text-sm text-slate-600 font-medium leading-relaxed">{summary.insight}</p>
    </div>
  );
}

function CapStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
      <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function OcularTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-sm">
      <div className="font-bold text-slate-800 mb-1">{point.sourceLabel}</div>
      <div className="text-xs text-slate-500 font-medium mb-2">
        {point.signalQuality?.label ?? 'Exploratório'} · {point.signalSourceLabel ?? 'Fonte não marcada'} · {point.sampleRateHz ? `${point.sampleRateHz} Hz` : 'taxa não medida'}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
        <span>Sacadas</span><strong className="text-right text-slate-800">{point.saccades}</strong>
        <span>Regressões</span><strong className="text-right text-slate-800">{point.regressions}</strong>
        <span>Fixação</span><strong className="text-right text-slate-800">{point.meanFixationMs} ms</strong>
        <span>Amostras</span><strong className="text-right text-slate-800">{point.samplesValid}</strong>
        <span>Cobertura</span><strong className="text-right text-slate-800">{point.coverage != null ? `${point.coverage}%` : 'N/D'}</strong>
      </div>
    </div>
  );
}

function sessionInsight(exercises: SessionResult['exercises'], avgStillness: number | null, symptomDelta: number): string {
  const reading = exercises.find(e => e.exerciseId === 'assistedReading');
  const saccades = reading?.extraData?.saccadeMetrics?.trackingAvailable
    ? `${reading.extraData.saccadeMetrics.saccadeCount} sacadas e ${reading.extraData.saccadeMetrics.regressionCount} regressões na leitura`
    : null;
  const symptomText = symptomDelta > 0
    ? `pior sintoma caiu ${symptomDelta} ponto${symptomDelta === 1 ? '' : 's'}`
    : symptomDelta < 0
      ? `pior sintoma subiu ${Math.abs(symptomDelta)} ponto${Math.abs(symptomDelta) === 1 ? '' : 's'}`
      : 'pior sintoma ficou estável';
  const postureText = avgStillness !== null ? `estabilidade média ${Math.round(avgStillness)}%` : 'sem estabilidade mensurável';
  return [saccades, postureText, symptomText].filter(Boolean).join(' · ');
}

function lightingLabel(value: ValidationCapture['conditions']['lighting']): string {
  return value === 'dim' ? 'Fraca' : value === 'bright' ? 'Forte' : 'Normal';
}

function postureLabel(value: ValidationCapture['conditions']['posture']): string {
  return value === 'tilted'
    ? 'Inclinada'
    : value === 'slouched'
      ? 'Curvada'
      : value === 'reclined'
        ? 'Recostada'
        : 'Reta';
}

const toneStyles: Record<StatisticSectionSummary['tone'], { border: string; icon: string; badge: string }> = {
  slate: {
    border: 'border-slate-100',
    icon: 'bg-slate-100 text-slate-600',
    badge: 'bg-slate-100 text-slate-600',
  },
  emerald: {
    border: 'border-emerald-100',
    icon: 'bg-emerald-100 text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  amber: {
    border: 'border-amber-100',
    icon: 'bg-amber-100 text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
  },
  indigo: {
    border: 'border-indigo-100',
    icon: 'bg-indigo-100 text-indigo-700',
    badge: 'bg-indigo-100 text-indigo-700',
  },
  rose: {
    border: 'border-rose-100',
    icon: 'bg-rose-100 text-rose-700',
    badge: 'bg-rose-100 text-rose-700',
  },
};

import React, { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AppShell } from '@/components/app/AppShell';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getSessions, getValidationCaptures, getRecallTests } from '@/services/storage';
import { apiUrl } from '@/services/apiBase';
import { interpretInsightResponse } from '@/services/insightResponse';
import {
  buildDiagnosticInsightPayload,
  buildSessionInsightSummary,
  buildOcularReadingSeries,
  buildStatisticsSummary,
  partitionOcularReadingSeries,
  resolveSelectedOcularGroupKey,
  type StatisticSectionSummary,
} from '@/services/statisticsSummary';
import { summarizeSaccadeSignalQuality } from '@/services/signalQuality';
import { describeCaptureValidity } from '@/services/captureValidity';
import { formatSampleRateHz } from '@/services/sampleRatePresentation';
import { SessionResult, ValidationCapture } from '@/types';
import { Activity, Clock, Eye, AlertTriangle, Smile, Sparkles, Download, BookOpen, ClipboardCheck, TrendingDown, BarChart3 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ZAxis } from 'recharts';

export function DashboardScreen() {
  const location = useLocation();
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [captures, setCaptures] = useState<ValidationCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [selectedOcularGroupKey, setSelectedOcularGroupKey] = useState<string | null>(null);

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
  const ocularPartition = useMemo(
    () => partitionOcularReadingSeries(ocularSeries),
    [ocularSeries]
  );
  const resolvedOcularGroupKey = useMemo(
    () => resolveSelectedOcularGroupKey(ocularPartition.comparableGroups, selectedOcularGroupKey),
    [ocularPartition, selectedOcularGroupKey]
  );
  const selectedOcularGroup = useMemo(
    () => ocularPartition.comparableGroups.find(group => group.key === resolvedOcularGroupKey) ?? null,
    [ocularPartition, resolvedOcularGroupKey]
  );

  useEffect(() => {
    setSelectedOcularGroupKey(current => resolveSelectedOcularGroupKey(
      ocularPartition.comparableGroups,
      current,
    ));
  }, [ocularPartition]);

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
      const summaryPayload = buildSessionInsightSummary(sessions);

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
            ...buildDiagnosticInsightPayload(ocularPartition, captures),
          }
        })
      });
      const data = await res.json().catch(() => null);
      setInsight(interpretInsightResponse(res.status, data));
    } catch(e) {
      console.error(e);
      setInsight("Não foi possível gerar a análise no momento.");
    } finally {
      setInsightLoading(false);
    }
  };

  const exportData = async () => {
    // Recalls não vivem no estado da tela; buscados só na hora do export para o
    // arquivo cobrir o histórico inteiro (sessões + capturas + recalls).
    const recallTests = await getRecallTests().catch(() => []);
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify({ sessions, diagnosticCaptures: captures, recallTests }, null, 2)
    )}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = "linha_fixa_historico.json";
    link.click();
  };

  return (
    <AppShell
      currentPath={`${location.pathname}${location.search}`}
      title="Progresso"
      subtitle="Histórico de treinos, capturas e sintomas deste dispositivo."
    >
      <div className="mb-6 flex justify-end">
        <button onClick={exportData} className="px-6 py-3 bg-surface border border-line-strong text-mild rounded-xl font-bold hover:bg-surface-sunken flex items-center gap-2 shadow-sm whitespace-nowrap">
          <Download className="w-5 h-5"/> Exportar Histórico (JSON)
        </button>
      </div>

      {loading ? (
          <div className="text-faint font-medium">Carregando...</div>
        ) : sessions.length === 0 && captures.length === 0 ? (
          <Card className="p-12 text-center">
             <p className="text-mild text-lg font-medium">Nenhuma sessão registrada ainda.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            
            <Card className="p-8 mb-8 bg-gradient-to-br from-accent-soft to-surface relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Sparkles className="w-24 h-24 text-indigo-500" />
               </div>
               <h3 className="text-xl font-bold text-strong mb-2 flex items-center gap-2">
                 <Sparkles className="w-6 h-6 text-indigo-500" />
                 Gerar Análise de Evolução (IA)
               </h3>
               <p className="text-mild font-medium mb-6 relative z-10 max-w-2xl">
                 {statisticsSummary.sections.training.insight} {statisticsSummary.sections.diagnostics.insight}
               </p>
               {!insight && !insightLoading && (sessions.length > 0 || captures.length > 0) && (
                 <button onClick={generateInsight} className="px-6 py-3 bg-accent hover:bg-accent-strong text-white rounded-xl font-bold transition-colors shadow-md my-2 relative z-10">
                   Analisar Meu Progresso
                 </button>
               )}
               {insightLoading && (
                 <div className="flex items-center gap-4 text-accent font-bold relative z-10">
                    <div className="w-6 h-6 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                    Analisando dados...
                 </div>
               )}
               {insight && (
                 <div className="mt-4 p-6 bg-surface rounded-2xl rounded-tl-none shadow-sm border border-accent-line text-mild text-lg leading-relaxed relative z-10">
                    {insight}
                 </div>
               )}
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
              {summaryCards.map(({ id, icon: Icon, summary }) => (
                <SummaryBubble key={id} summary={summary} icon={<Icon className="w-5 h-5" />} />
              ))}
            </div>

            {ocularSeries.length > 0 && (
              <div className="space-y-6 mb-8">
                <Card className="p-5 sm:p-8 min-w-0">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-strong mb-2">Tendência ocular comparável</h3>
                      <p className="text-mild font-medium max-w-2xl">
                        Cada série mantém orientação, perfil temporal e fonte iguais. Registros fora desse contrato ficam somente na auditoria.
                      </p>
                    </div>
                    {ocularPartition.comparableGroups.length > 1 && (
                      <div className="flex flex-wrap gap-2" aria-label="Selecionar grupo ocular comparável">
                        {ocularPartition.comparableGroups.map(group => (
                          <button
                            key={group.key}
                            type="button"
                            onClick={() => setSelectedOcularGroupKey(group.key)}
                            aria-pressed={selectedOcularGroup?.key === group.key}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${selectedOcularGroup?.key === group.key ? 'bg-accent text-white' : 'bg-app-inset text-mild hover:bg-line-strong'}`}
                          >
                            {group.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedOcularGroup ? (
                    <div className="inline-flex max-w-full px-3 py-1.5 mb-2 rounded-full bg-accent-soft text-accent-strong text-xs font-bold">
                      {formatOcularGroupSummary(
                        selectedOcularGroup.label,
                        selectedOcularGroup.points.length,
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 font-medium">
                      Ainda não há registros comparáveis. Os dados exploratórios e inválidos continuam visíveis abaixo para auditoria.
                    </div>
                  )}
                </Card>

                {selectedOcularGroup && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card className="p-8 min-w-0">
                  <h3 className="text-xl font-bold text-strong mb-2">Sacadas e regressões pelo olhar</h3>
                  <p className="text-mild font-medium mb-6">
                    Contagem estimada por sinal ocular. Regressões são sacadas contra a direção esperada de leitura; retornos de linha (a volta ampla para começar a próxima linha) ficam fora da contagem de regressões.
                  </p>
                  <div className="h-72 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={200}>
                      <BarChart data={selectedOcularGroup.points} margin={{ top: 12, right: 12, bottom: 12, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<OcularTooltip />} />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        <Bar dataKey="saccades" name="Sacadas" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="regressions" name="Regressões" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="lineReturns" name="Retornos de linha" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-8 min-w-0">
                  <h3 className="text-xl font-bold text-strong mb-2">Fixação média pelo olhar</h3>
                  <p className="text-mild font-medium mb-6">
                    Duração média entre sacadas, estimada pelo detector ocular. Valores maiores sugerem pausas visuais mais longas.
                  </p>
                  <div className="h-72 w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={200}>
                      <LineChart data={selectedOcularGroup.points} margin={{ top: 12, right: 12, bottom: 12, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} unit=" ms" />
                        <Tooltip content={<OcularTooltip />} />
                        <Legend verticalAlign="top" height={36} iconType="circle" />
                        <Line type="monotone" dataKey="meanFixationMs" name="Fixação média" stroke="#0f766e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                  </div>
                )}

                <Card className="p-5 sm:p-8">
                  <h3 className="text-xl font-bold text-strong mb-2">Registros para auditoria</h3>
                  <p className="text-mild font-medium mb-5">
                    Exploratórios, inválidos, legados ou sem geometria completa permanecem consultáveis, mas não entram nos gráficos de tendência.
                  </p>
                  {ocularPartition.audit.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {[...ocularPartition.audit].sort((a, b) => b.timestamp - a.timestamp).map(point => {
                        const presentation = describeCaptureValidity(point.validity);
                        const missingComparisonContext = point.validity.grade === 'comparable' && point.comparisonKey === null;
                        return (
                          <article key={`${point.sourceKind}-${point.id}`} className="rounded-2xl border border-line-strong bg-surface-sunken p-4 min-w-0">
                            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                              <div className="min-w-0">
                                <div className="font-bold text-strong truncate">{point.sourceLabel} · {point.label}</div>
                                <div className="text-xs text-mild mt-1">
                                  {missingComparisonContext ? 'Orientação ou contexto insuficiente para formar uma série comparável' : presentation.primary}
                                </div>
                              </div>
                              <Badge tone={presentation.tone === 'rose' ? 'alert' : 'caution'}>
                                {presentation.label}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <AuditFact label="Taxa" value={formatSampleRateHz(point.validity.sampleRateHz, 'não medida')} />
                              <AuditFact label="Fonte" value={point.signalSourceLabel} />
                              <AuditFact label="Orientação" value={orientationLabel(point.orientation)} />
                              <AuditFact label="Persistência" value={point.saveProvenance === 'saved-capture' ? 'Captura salva' : 'Sessão salva'} />
                            </div>
                            <p className="text-xs text-mild mt-3 break-words">
                              Motivos: {missingComparisonContext
                                ? 'contexto de comparação incompleto'
                                : presentation.reasons.length > 0
                                  ? presentation.reasons.join('; ')
                                  : 'metadados insuficientes para comparação'}.
                            </p>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-emerald-800 font-medium">
                      Nenhum registro pendente de auditoria neste histórico.
                    </p>
                  )}
                </Card>
              </div>
            )}

            {(facil.length > 0 || dificil.length > 0) && (
              <Card className="p-8 mb-8 min-w-0">
                <h3 className="text-xl font-bold text-strong mb-2">Avanço manual da leitura</h3>
                <p className="text-mild font-medium mb-6">
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
              </Card>
            )}

            {captures.length > 0 && (
              <Card className="p-8 mb-8">
                <h3 className="text-xl font-bold text-strong mb-2 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-500" />
                  Capturas diagnósticas
                </h3>
                <p className="text-mild font-medium mb-6">{statisticsSummary.sections.diagnostics.insight}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {captures.slice(0, 6).map(c => {
                    const dt = new Date(c.timestamp);
                    const quality = summarizeSaccadeSignalQuality(c.metrics, {
                      coverage: c.coverage,
                      calibrated: c.calibrated,
                      validity: c.validity,
                    });
                    return (
                      <div key={c.id} className="rounded-2xl border border-line bg-surface-sunken p-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <div className="text-sm font-bold text-mild">{dt.toLocaleDateString('pt-BR')} às {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                            <div className="text-xs text-faint font-bold uppercase tracking-wider mt-1">{lightingLabel(c.conditions.lighting)} · {postureLabel(c.conditions.posture)} · {c.conditions.distanceCm} cm</div>
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            <Badge tone={quality.tone === 'emerald' ? 'positive' : quality.tone === 'rose' ? 'alert' : 'caution'}>
                              {quality.label}
                            </Badge>
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-surface text-mild border border-line-strong">
                              {quality.sourceLabel}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <CapStat label="Cobertura rosto" value={`${Math.round(c.coverage)}%`} />
                          <CapStat label="Taxa" value={formatSampleRateHz(c.metrics.sampleRateHz)} />
                          <CapStat label="Sacadas" value={String(c.metrics.saccadeCount)} />
                          <CapStat label="Regressões" value={String(c.metrics.regressionCount)} />
                          <CapStat label="Retornos linha" value={c.metrics.lineReturnCount != null ? String(c.metrics.lineReturnCount) : 'N/D'} />
                          <CapStat label="Postura" value={`${c.postural.cervicalStability}%`} />
                          <CapStat label="Delta pos." value={c.postural.motionDeltaDeg != null ? `${c.postural.motionDeltaDeg.toFixed(1)}°` : 'N/D'} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {sessions.map(s => {
               const dt = new Date(s.timestamp);
               const stillnessScores = s.exercises.map(e => e.headStillnessScore).filter((v): v is number => v !== null);
               const avgStillness = stillnessScores.length ? stillnessScores.reduce((acc, v) => acc + v, 0) / stillnessScores.length : null;
               const feelingBefore = s.contextBefore?.feeling ?? null;
               const feelingAfter = s.contextAfter?.feeling ?? null;
               const legacySymptomBefore = s.symptomsBefore ? Math.max(...(Object.values(s.symptomsBefore) as number[])) : null;
               return (
                 <Card key={s.id} className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                      <h3 className="text-xl font-bold text-strong flex items-center gap-2">
                        {dt.toLocaleDateString('pt-BR')} <span className="text-sm font-medium text-faint bg-app-inset px-3 py-1 rounded-full">{dt.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</span>
                      </h3>
                      <div className="flex gap-6 mt-4 text-mild font-medium">
                         <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-blue-500"/> {Math.round(s.durationSec / 60)} min</div>
                         <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-500"/> {s.exercises.length} ex.</div>
                      </div>
                      <p className="text-sm text-mild font-medium mt-3 max-w-xl">
                        {sessionInsight(s.exercises, avgStillness, wellbeingChangeText(s))}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-8 bg-surface-sunken py-4 px-6 rounded-2xl border border-line">
                      <div>
                        <p className="text-xs text-faint uppercase tracking-widest font-bold mb-1">Estabilidade</p>
                        <p className="text-2xl font-bold text-strong flex items-center gap-2">
                          <Eye className="w-5 h-5 text-indigo-500" />
                          {avgStillness !== null ? `${Math.round(avgStillness)}%` : 'N/D'}
                        </p>
                      </div>
                      <div className="w-px h-12 bg-line-strong"></div>
                      <div>
                         <p className="text-xs text-faint uppercase tracking-widest font-bold mb-1">
                           {feelingBefore != null ? 'Sensação (pré→pós)' : 'Pior Sintoma (Inicial)'}
                         </p>
                         <p className="text-2xl font-bold text-strong flex items-center gap-2">
                           {feelingBefore != null
                             ? <Smile className="w-5 h-5 text-emerald-500" />
                             : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                           {feelingBefore != null ? `${feelingBefore}→${feelingAfter ?? '–'}` : legacySymptomBefore ?? 'N/D'}
                         </p>
                      </div>
                    </div>
                 </Card>
               )
            })}
          </div>
      )}
    </AppShell>
  );
}

function SummaryBubble({ summary, icon }: { key?: React.Key; summary: StatisticSectionSummary; icon: React.ReactNode }) {
  const styles = toneStyles[summary.tone];
  return (
    <div className={`bg-surface rounded-2xl p-5 shadow-sm border ${styles.border}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${styles.icon}`}>
          {icon}
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${styles.badge}`}>{summary.label}</span>
      </div>
      <div className="text-3xl font-bold text-strong">{summary.value}</div>
      <div className="text-xs text-faint uppercase tracking-widest font-bold mt-1 mb-3">{summary.detail}</div>
      <p className="text-sm text-mild font-medium leading-relaxed">{summary.insight}</p>
    </div>
  );
}

function CapStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-strong">{value}</div>
      <div className="text-[11px] text-faint font-bold uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function AuditFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-bold text-mild break-words">{value}</div>
      <div className="text-[10px] text-faint font-bold uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

function orientationLabel(orientation: 'portrait' | 'landscape' | null): string {
  return orientation === 'portrait' ? 'Retrato' : orientation === 'landscape' ? 'Paisagem' : 'não medida';
}

export function formatEstimatedMilliseconds(value: number | null): string {
  return value == null ? 'não estimável' : `${value} ms`;
}

export function formatOcularGroupSummary(label: string, count: number): string {
  return `${label} · ${count} ${count === 1 ? 'registro' : 'registros'}`;
}

function OcularTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-line-strong bg-surface p-3 shadow-sm text-sm">
      <div className="font-bold text-strong mb-1">{point.sourceLabel}</div>
      <div className="text-xs text-mild font-medium mb-2">
        {point.signalQuality?.label ?? 'Exploratório'} · {point.signalSourceLabel ?? 'Fonte não marcada'} · {formatSampleRateHz(point.sampleRateHz, 'taxa não medida')}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-mild">
        <span>Sacadas</span><strong className="text-right text-strong">{point.saccades}</strong>
        <span>Regressões</span><strong className="text-right text-strong">{point.regressions}</strong>
        <span>Retornos linha</span><strong className="text-right text-strong">{point.lineReturns ?? 'N/D'}</strong>
        <span>Fixação</span><strong className="text-right text-strong">{formatEstimatedMilliseconds(point.meanFixationMs)}</strong>
        <span>Amostras</span><strong className="text-right text-strong">{point.samplesValid}</strong>
        <span>Cobertura</span><strong className="text-right text-strong">{point.coverage != null ? `${point.coverage}%` : 'N/D'}</strong>
      </div>
    </div>
  );
}

// Pre→post wellbeing change: quick context (1-5 feeling) when present, otherwise the
// legacy max-symptom delta for old sessions; null when neither pair exists.
function wellbeingChangeText(s: SessionResult): string | null {
  const fb = s.contextBefore?.feeling;
  const fa = s.contextAfter?.feeling;
  if (fb != null && fa != null) {
    const d = fa - fb;
    if (d > 0) return `sensação subiu ${d} ponto${d === 1 ? '' : 's'}`;
    if (d < 0) return `sensação caiu ${-d} ponto${d === -1 ? '' : 's'}`;
    return 'sensação estável';
  }
  const sb = s.symptomsBefore ? Math.max(...(Object.values(s.symptomsBefore) as number[])) : null;
  const sa = s.symptomsAfter ? Math.max(...(Object.values(s.symptomsAfter) as number[])) : null;
  if (sb != null && sa != null) {
    const d = sb - sa;
    if (d > 0) return `pior sintoma caiu ${d} ponto${d === 1 ? '' : 's'}`;
    if (d < 0) return `pior sintoma subiu ${-d} ponto${d === -1 ? '' : 's'}`;
    return 'pior sintoma ficou estável';
  }
  return null;
}

function sessionInsight(exercises: SessionResult['exercises'], avgStillness: number | null, wellbeingText: string | null): string {
  const reading = exercises.find(e => e.exerciseId === 'assistedReading');
  const readingMetrics = reading?.extraData?.saccadeMetrics;
  const saccades = readingMetrics?.trackingAvailable
    ? `${readingMetrics.saccadeCount} sacadas, ${readingMetrics.regressionCount} regressões${readingMetrics.lineReturnCount != null ? ` e ${readingMetrics.lineReturnCount} retornos de linha` : ''} na leitura`
    : null;
  const postureText = avgStillness !== null ? `estabilidade média ${Math.round(avgStillness)}%` : 'sem estabilidade mensurável';
  return [saccades, postureText, wellbeingText].filter(Boolean).join(' · ');
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
    border: 'border-line',
    icon: 'bg-app-inset text-mild',
    badge: 'bg-app-inset text-mild',
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
    border: 'border-accent-line',
    icon: 'bg-accent-line text-accent-strong',
    badge: 'bg-accent-line text-accent-strong',
  },
  rose: {
    border: 'border-rose-100',
    icon: 'bg-rose-100 text-rose-700',
    badge: 'bg-rose-100 text-rose-700',
  },
};

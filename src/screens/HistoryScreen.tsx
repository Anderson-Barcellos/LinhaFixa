import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import {
  BookOpenText,
  Camera,
  Clock3,
  History,
  ScanSearch,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AppShell } from '@/components/app/AppShell';
import { getRecallTests, getValidationCaptures } from '@/services/storage';
import { useAppStore } from '@/store/useAppStore';
import type { RecallTestResult, ValidationCapture } from '@/types';

type HistoryEntry =
  | {
      id: string;
      kind: 'capture';
      timestamp: number;
      title: string;
      badge: string;
      detail: string;
    }
  | {
      id: string;
      kind: 'recall';
      timestamp: number;
      title: string;
      badge: string;
      detail: string;
    };

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestamp);
}

function formatReadingDuration(readingDurationMs: number): string {
  const totalMinutes = Math.max(1, Math.round(readingDurationMs / 60000));
  return `${totalMinutes} min de leitura`;
}

function buildCaptureEntry(capture: ValidationCapture): HistoryEntry {
  return {
    id: `capture-${capture.id}`,
    kind: 'capture',
    timestamp: capture.timestamp,
    title: 'Captura ocular registrada',
    badge: 'Captura',
    detail: `${capture.conditions.posture} · ${capture.conditions.lighting} · cobertura ${Math.round(capture.coverage)}%`,
  };
}

function buildRecallEntry(recall: RecallTestResult): HistoryEntry {
  return {
    id: `recall-${recall.id}`,
    kind: 'recall',
    timestamp: recall.timestamp,
    title: `Recall: ${recall.topic}`,
    badge: 'Recall',
    detail: `${recall.score}/${recall.questions.length} acertos · ${formatReadingDuration(recall.readingDurationMs)}`,
  };
}

export function HistoryScreen(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [captures, setCaptures] = useState<ValidationCapture[]>([]);
  const [recalls, setRecalls] = useState<RecallTestResult[]>([]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getValidationCaptures(), getRecallTests()])
      .then(([captureRows, recallRows]) => {
        if (cancelled) return;
        setCaptures(captureRows);
        setRecalls(recallRows);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const entries = useMemo(
    () =>
      [...captures.map(buildCaptureEntry), ...recalls.map(buildRecallEntry)].sort(
        (left, right) => right.timestamp - left.timestamp,
      ),
    [captures, recalls],
  );

  const latestEntry = entries[0] ?? null;
  const currentPath = `${location.pathname}${location.search}`;

  return (
    <AppShell
      currentPath={currentPath}
      title="Historico"
      subtitle="Linha do tempo recente das capturas oculares e recalls salvos neste dispositivo."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]">
        <section className="space-y-6">
          <div className="rounded-[2rem] bg-slate-900 p-6 text-white shadow-lg md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                  <History className="h-3.5 w-3.5" />
                  Historico real da shell
                </div>
                <h2 className="mt-4 text-3xl font-bold tracking-tight">
                  Registros recentes sem depender da dashboard analitica.
                </h2>
                <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-300">
                  Aqui a IA da shell mostra a trilha cronologica do que ja foi
                  salvo. A secao de Progresso continua dedicada a graficos,
                  comparacoes e analise mais pesada.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Ver progresso analitico
                <ScanSearch className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Capturas</p>
                  <p className="text-sm text-slate-500">{captures.length} registradas</p>
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <BookOpenText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Recalls</p>
                  <p className="text-sm text-slate-500">{recalls.length} testes salvos</p>
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Ultimo registro</p>
                  <p className="text-sm text-slate-500">
                    {latestEntry ? formatTimestamp(latestEntry.timestamp) : 'Sem dados ainda'}
                  </p>
                </div>
              </div>
            </article>
          </div>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Linha do tempo</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                  Capturas e recalls aparecem juntos para facilitar auditoria
                  rapida da sequencia real de avaliacao.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-medium text-slate-500">
                Carregando historico local...
              </div>
            ) : entries.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-medium text-slate-500">
                Nenhuma captura ou recall salvo neste dispositivo ainda.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {entries.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                          {entry.badge}
                        </div>
                        <h4 className="mt-3 text-lg font-semibold text-slate-900">
                          {entry.title}
                        </h4>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {entry.detail}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-slate-500">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        <aside className="space-y-6">
          <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Perfil ativo
            </p>
            <h3 className="mt-3 text-2xl font-bold text-slate-900">
              {profile?.name ? profile.name : 'Perfil sem nome salvo'}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Distancia de leitura registrada: {profile?.viewingDistanceCm ?? 40} cm.
            </p>
          </article>

          <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Diferenca de papel
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Historico mostra eventos salvos e sua ordem. Progresso continua
              sendo o lugar para sumarizacao clinica, series comparaveis e
              exportacao ampla.
            </p>
          </article>
        </aside>
      </div>
    </AppShell>
  );
}

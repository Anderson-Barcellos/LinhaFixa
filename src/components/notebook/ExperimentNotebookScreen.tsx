import { BookOpen, CalendarDays, Crosshair, Play } from 'lucide-react';
import { Link } from 'react-router-dom';

import type {
  ExperimentNotebookProjection,
  NotebookRecord,
} from '@/services/experimentNotebookProjection';
import { NotebookRecordRow } from './NotebookRecordRow';

export function ExperimentNotebookScreen({
  projection,
  loading,
  todayTimestamp,
  onNewSession,
  onOpenRecord,
  onOpenLibrary,
  onOpenTraining,
}: {
  projection: ExperimentNotebookProjection;
  loading: boolean;
  todayTimestamp: number;
  onNewSession: () => void;
  onOpenRecord: (record: NotebookRecord) => void;
  onOpenLibrary: () => void;
  onOpenTraining: () => void;
}) {
  return (
    <div data-testid="experiment-notebook" className="mx-auto w-full max-w-[1440px]">
      <header className="mb-5 flex items-start justify-between gap-4 px-1 md:mb-8">
        <div>
          <p className="text-2xl font-bold tracking-tight text-strong md:text-3xl">
            Linha Fixa
          </p>
          <p className="mt-1 text-sm font-semibold text-mild">Caderno Experimental</p>
        </div>
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-mild">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(todayTimestamp)}
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] xl:items-stretch">
        <section
          data-testid="current-series-card"
          className="relative flex min-h-[26rem] overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-indigo-800 to-slate-950 p-6 text-white shadow-xl md:p-8"
        >
          <div className="absolute -right-20 top-12 h-72 w-72 rounded-full border-[2.75rem] border-white/[0.05]" aria-hidden="true" />
          <div className="relative flex w-full flex-col">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">
              Série atual
            </p>
            <h1 className="mt-5 text-3xl font-bold tracking-tight md:text-5xl">
              {projection.series.title}
            </h1>
            <p className="mt-4 max-w-xl text-base font-medium leading-7 text-indigo-100">
              Acompanhe suas sessões e registre novas execuções da série.
            </p>
            {projection.series.comparisonLabel ? (
              <p className="mt-4 text-sm font-semibold text-indigo-200">
                {projection.series.comparisonLabel}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onNewSession}
              className="mt-auto inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-lg font-bold text-indigo-700 shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 motion-reduce:transform-none motion-reduce:transition-none"
            >
              <Crosshair className="h-6 w-6" aria-hidden="true" />
              Nova sessão
            </button>
          </div>
        </section>

        <section
          data-testid="recent-sessions-card"
          className="rounded-[2rem] border border-line-strong bg-surface p-5 shadow-sm md:p-8"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-strong">Sessões recentes</h2>
            <Link to="/history" className="text-sm font-bold text-accent">
              Mais antigas
            </Link>
          </div>
          {loading ? (
            <p role="status" className="mt-8 text-sm font-medium text-mild">
              Carregando registros locais…
            </p>
          ) : projection.recent.length ? (
            <div className="mt-5">
              {projection.recent.map(record => (
                <NotebookRecordRow key={record.id} record={record} onOpen={onOpenRecord} />
              ))}
            </div>
          ) : (
            <p className="mt-8 rounded-2xl border border-dashed border-line-strong p-5 text-sm font-medium text-mild">
              Nenhuma sessão registrada ainda.
            </p>
          )}
          <p className="mt-5 text-sm font-medium text-mild">
            Comparações somente dentro da mesma classe de dispositivo e chave metodológica.
          </p>
        </section>
      </div>

      <section data-testid="preserved-tools" className="mt-6 grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={onOpenTraining}
          className="flex min-h-24 items-center gap-4 rounded-3xl border border-line-strong bg-surface p-5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
        >
          <Play className="h-6 w-6 text-accent" aria-hidden="true" />
          <span>
            <strong className="block text-strong">Plano de treino</strong>
            <span className="mt-1 block text-sm text-mild">
              Contexto, safety gate e protocolo adaptativo.
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="flex min-h-24 items-center gap-4 rounded-3xl border border-line-strong bg-surface p-5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
        >
          <BookOpen className="h-6 w-6 text-accent" aria-hidden="true" />
          <span>
            <strong className="block text-strong">Biblioteca</strong>
            <span className="mt-1 block text-sm text-mild">
              Fixação, Sacadas, Perseguição suave e Leitura assistida.
            </span>
          </span>
        </button>
      </section>
    </div>
  );
}

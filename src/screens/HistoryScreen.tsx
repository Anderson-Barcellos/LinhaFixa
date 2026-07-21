import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Activity, BookOpenText, Camera, Clock3 } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { AppShell } from '@/components/app/AppShell';
import { NotebookRecordRow } from '@/components/notebook/NotebookRecordRow';
import {
  buildExperimentNotebookProjection,
  type NotebookRecord,
} from '@/services/experimentNotebookProjection';
import {
  getRecallTests,
  getSessions,
  getValidationCaptures,
} from '@/services/storage';
import type { RecallTestResult, SessionResult, ValidationCapture } from '@/types';

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestamp);
}

export function HistoryScreen(): JSX.Element {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [captures, setCaptures] = useState<ValidationCapture[]>([]);
  const [recalls, setRecalls] = useState<RecallTestResult[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<NotebookRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getSessions(), getValidationCaptures(), getRecallTests()])
      .then(([sessionRows, captureRows, recallRows]) => {
        if (cancelled) return;
        setSessions(sessionRows);
        setCaptures(captureRows);
        setRecalls(recallRows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const projection = useMemo(
    () => buildExperimentNotebookProjection({ sessions, captures, recalls }),
    [sessions, captures, recalls],
  );
  const latestRecord = projection.all[0] ?? null;
  const currentPath = `${location.pathname}${location.search}`;

  return (
    <AppShell
      currentPath={currentPath}
      title="Sessões"
      subtitle="Capturas, recalls e treinos persistidos neste dispositivo."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={<Camera className="h-5 w-5" aria-hidden="true" />}
              label="Capturas"
              value={`${captures.length} registradas`}
            />
            <SummaryCard
              icon={<BookOpenText className="h-5 w-5" aria-hidden="true" />}
              label="Recalls"
              value={`${recalls.length} salvos`}
            />
            <SummaryCard
              icon={<Activity className="h-5 w-5" aria-hidden="true" />}
              label="Treinos"
              value={`${sessions.length} salvos`}
            />
            <SummaryCard
              icon={<Clock3 className="h-5 w-5" aria-hidden="true" />}
              label="Último registro"
              value={latestRecord ? formatTimestamp(latestRecord.timestamp) : 'Sem dados ainda'}
            />
          </div>

          <section className="rounded-[2rem] border border-line-strong bg-surface p-5 shadow-sm md:p-8">
            <div>
              <h2 className="text-xl font-bold text-strong">Todos os registros</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-mild">
                A mesma classificação usada em Hoje, sem recalcular status nesta tela.
              </p>
            </div>

            {loading ? (
              <p role="status" className="mt-6 rounded-2xl border border-dashed border-line-strong p-5 text-sm font-medium text-mild">
                Carregando registros locais…
              </p>
            ) : projection.all.length === 0 ? (
              <p className="mt-6 rounded-2xl border border-dashed border-line-strong p-5 text-sm font-medium text-mild">
                Nenhuma captura, recall ou treino salvo neste dispositivo ainda.
              </p>
            ) : (
              <div className="mt-5">
                {projection.all.map(record => (
                  <NotebookRecordRow
                    key={record.id}
                    record={record}
                    onOpen={setSelectedRecord}
                  />
                ))}
              </div>
            )}
          </section>
        </section>

        <aside className="xl:sticky xl:top-8 xl:self-start">
          <article className="rounded-[2rem] border border-line-strong bg-surface p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-mild">
              Detalhes do registro
            </p>
            {selectedRecord ? (
              <div className="mt-4">
                <span className="inline-flex rounded-full bg-app-inset px-3 py-1 text-xs font-bold text-mild">
                  {selectedRecord.statusLabel}
                </span>
                <h2 className="mt-4 text-2xl font-bold text-strong">
                  {selectedRecord.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-mild">{selectedRecord.detail}</p>
                {selectedRecord.recall ? (
                  <p className="mt-4 rounded-2xl bg-accent-soft p-4 text-sm font-bold text-accent-strong">
                    Recall {selectedRecord.recall.scoreLabel}
                  </p>
                ) : null}
                <dl className="mt-5 grid gap-3 text-sm">
                  <DetailTerm label="Dispositivo" value={selectedRecord.deviceLabel} />
                  <DetailTerm
                    label="Taxa"
                    value={selectedRecord.sampleRateLabel ?? 'Não se aplica'}
                  />
                  <DetailTerm label="Data" value={formatTimestamp(selectedRecord.timestamp)} />
                </dl>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-mild">
                Selecione um registro para consultar seus detalhes e o recall vinculado.
              </p>
            )}
          </article>
        </aside>
      </div>
    </AppShell>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: JSX.Element;
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-3xl border border-line-strong bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="rounded-2xl bg-app-inset p-3 text-mild">{icon}</span>
        <span className="min-w-0">
          <strong className="block text-sm text-strong">{label}</strong>
          <span className="mt-1 block truncate text-sm text-mild">{value}</span>
        </span>
      </div>
    </article>
  );
}

function DetailTerm({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line pt-3">
      <dt className="font-medium text-mild">{label}</dt>
      <dd className="text-right font-semibold text-strong">{value}</dd>
    </div>
  );
}

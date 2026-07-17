import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { BookOpenText, CheckCircle2, Clock3, ScanEye } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AssessmentSetupPanel } from '@/components/assessment/AssessmentSetupPanel';
import { AppShell } from '@/components/app/AppShell';
import { getRecallTests, getValidationCaptures } from '@/services/storage';
import {
  buildAssessmentWorkspaceSnapshot,
  deriveAssessmentWorkspaceLatestRecord,
  isLiveAssessmentWorkspace,
  LIVE_ASSESSMENT_WORKSPACE_ROUTE,
} from '@/services/assessmentAdapter';
import { EyeTrackingTestScreen } from '@/screens/EyeTrackingTestScreen';
import type { AssessmentMode, RecallTestResult, ValidationCapture } from '@/types';

function formatRelativeLabel(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `Ultima atividade ha ${diffMinutes} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Ultima atividade ha ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Ultima atividade ha ${diffDays} dias`;
}

function assessmentModeFromSearch(search: string): AssessmentMode {
  const mode = new URLSearchParams(search).get('mode');
  return mode === 'recall' ? 'recall' : 'capture';
}

function liveAssessmentRoute(mode: AssessmentMode): string {
  return mode === 'recall'
    ? `${LIVE_ASSESSMENT_WORKSPACE_ROUTE}&mode=recall`
    : LIVE_ASSESSMENT_WORKSPACE_ROUTE;
}

export function AssessmentWorkspaceScreen(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
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
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const liveWorkspace = useMemo(
    () => isLiveAssessmentWorkspace(location.search),
    [location.search],
  );
  const requestedMode = useMemo(
    () => assessmentModeFromSearch(location.search),
    [location.search],
  );
  const latestRecord = useMemo(
    () => deriveAssessmentWorkspaceLatestRecord(captures, recalls),
    [captures, recalls],
  );
  const latestSessionLabel = latestRecord.timestamp !== null
    ? formatRelativeLabel(latestRecord.timestamp)
    : null;
  const snapshot = useMemo(
    () =>
      buildAssessmentWorkspaceSnapshot({
        mode: requestedMode,
        readingTextState: 'ready',
        capturing: false,
        recallGenerating: false,
        recallQuizOpen: false,
        hasCaptureResult: latestRecord.hasCaptureResult,
        captureCount: captures.length,
        latestSessionLabel,
        captureTitle: latestRecord.captureTitle,
        recallResult: latestRecord.recallResult,
      }),
    [captures.length, latestRecord, latestSessionLabel, requestedMode],
  );

  const openSession = (mode: AssessmentMode) => {
    navigate(liveAssessmentRoute(mode));
  };

  const closeSession = () => {
    navigate('/assessment', { replace: true });
  };

  if (liveWorkspace) {
    return (
      <div className="overflow-hidden bg-slate-100 text-slate-900">
        <div className="mx-auto h-[100dvh] max-w-7xl min-h-0">
          <EyeTrackingTestScreen
            embedded
            initialMode={requestedMode}
            onExit={closeSession}
          />
        </div>
      </div>
    );
  }

  return (
    <AppShell
      currentPath={location.pathname}
      title={snapshot.heading}
      subtitle={snapshot.subheading}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <section className="space-y-6">
            <AssessmentSetupPanel
              latestSessionLabel={latestSessionLabel}
              onStartCapture={() => openSession('capture')}
              onStartRecall={() => openSession('recall')}
            />

            <section className="rounded-[2rem] bg-slate-900 p-6 text-white shadow-lg md:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                    <ScanEye className="h-3.5 w-3.5" />
                    Workspace de avaliacao
                  </div>
                  <h2 className="mt-4 text-3xl font-bold tracking-tight">
                    A shell clara agora abre a sessao real no proprio /assessment.
                  </h2>
                  <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-300">
                    A entrada oficial segue leve para preparar a sessão, enquanto a leitura,
                    a captura ocular e o recall entram numa superfície escura imersiva sob a
                    mesma família de rota.
                  </p>
                </div>

                <div className="flex flex-col items-start gap-3 rounded-3xl border border-white/10 bg-white/10 p-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Estado atual
                  </span>
                  <strong className="text-xl">
                    {liveWorkspace ? 'Sessao em andamento' : 'Pronto para iniciar'}
                  </strong>
                  <span className="text-sm text-slate-300">
                    {snapshot.latestSessionLabel ?? 'Nenhuma atividade registrada ainda.'}
                  </span>
                </div>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-white/10 p-3 text-slate-100">
                      <BookOpenText className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Fluxo visível
                      </p>
                      <p className="text-sm text-slate-300">
                        Setup claro fora, leitura e captura dentro da superfície escura.
                      </p>
                    </div>
                  </div>
                </article>

                <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-white/10 p-3 text-slate-100">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Capturas salvas
                      </p>
                      <p className="text-sm text-slate-300">
                        {snapshot.savedCapturesLabel}
                      </p>
                    </div>
                  </div>
                </article>

                <article className="rounded-3xl border border-white/10 bg-white/10 p-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-white/10 p-3 text-slate-100">
                      <Clock3 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Ultima sessao
                      </p>
                      <p className="text-sm text-slate-300">
                        {latestSessionLabel ?? 'Sem historico consolidado.'}
                      </p>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </section>

          <aside className="space-y-6">
            {snapshot.resultSummary ? (
              <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Ultimo resultado
                </p>
                <h2 className="mt-3 text-2xl font-bold text-slate-900">
                  {snapshot.resultSummary.title}
                </h2>
                <p className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                  {snapshot.resultSummary.badge}
                </p>
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  O histórico recente continua vindo do adapter já existente, sem alterar a
                  persistência local das capturas e dos recalls.
                </p>
              </article>
            ) : (
              <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Primeira avaliacao
                </p>
                <h2 className="mt-3 text-2xl font-bold text-slate-900">
                  Tudo pronto para a primeira rodada
                </h2>
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  A partir daqui o /assessment já é a casa do fluxo inteiro, sem depender
                  de uma tela paralela como dona da experiência real.
                </p>
              </article>
            )}

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Compatibilidade
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-500">
                <code>/eye-tracking-test</code> segue vivo apenas como atalho legado e
                redireciona para a variante ativa desta mesma workspace.
              </p>
              {!loading ? (
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  Modo sugerido agora: <strong>{latestRecord.mode === 'recall' ? 'Ler e responder' : 'Captura simples'}</strong>.
                </p>
              ) : null}
            </article>
          </aside>
      </div>
    </AppShell>
  );
}

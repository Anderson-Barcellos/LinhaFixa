import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import {
  ArrowRight,
  BookOpenText,
  Camera,
  CheckCircle2,
  Clock3,
  ScanEye,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AppShell } from '@/components/app/AppShell';
import { getRecallTests, getValidationCaptures } from '@/services/storage';
import {
  buildAssessmentWorkspaceSnapshot,
  deriveAssessmentWorkspaceLatestRecord,
  isLiveAssessmentWorkspace,
  LIVE_ASSESSMENT_WORKSPACE_ROUTE,
} from '@/services/assessmentAdapter';
import { EyeTrackingTestScreen } from '@/screens/EyeTrackingTestScreen';
import { useAppStore } from '@/store/useAppStore';
import type { RecallTestResult, ValidationCapture } from '@/types';

const STAGE_LABELS = {
  setup: 'Preparacao inicial',
  'loading-text': 'Texto em preparo',
  'text-ready': 'Texto pronto',
  capturing: 'Captura ativa',
  'generating-quiz': 'Quiz em geracao',
  quiz: 'Quiz aberto',
  result: 'Resultado mais recente',
} as const;

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

export function AssessmentWorkspaceScreen(): JSX.Element {
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

  const liveWorkspace = useMemo(
    () => isLiveAssessmentWorkspace(location.search),
    [location.search],
  );
  const latestRecord = useMemo(
    () => deriveAssessmentWorkspaceLatestRecord(captures, recalls),
    [captures, recalls],
  );
  const snapshot = useMemo(
    () =>
      buildAssessmentWorkspaceSnapshot({
        mode: latestRecord.mode,
        readingTextState: loading ? 'loading' : 'ready',
        capturing: false,
        recallGenerating: false,
        recallQuizOpen: false,
        hasCaptureResult: latestRecord.hasCaptureResult,
        captureCount: captures.length,
        latestSessionLabel:
          latestRecord.timestamp !== null
            ? formatRelativeLabel(latestRecord.timestamp)
            : null,
        captureTitle: latestRecord.captureTitle,
        recallResult: latestRecord.recallResult,
      }),
    [captures.length, latestRecord, loading],
  );

  if (liveWorkspace) {
    return <EyeTrackingTestScreen />;
  }

  const currentPath = `${location.pathname}${location.search}`;
  const stageLabel = STAGE_LABELS[snapshot.stage];

  return (
    <AppShell
      currentPath={currentPath}
      title={snapshot.heading}
      subtitle={snapshot.subheading}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <section className="space-y-6">
          <div className="rounded-[2rem] bg-slate-900 p-6 text-white shadow-lg md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                  <ScanEye className="h-3.5 w-3.5" />
                  Workspace de avaliacao
                </div>
                <h2 className="mt-4 text-3xl font-bold tracking-tight">
                  A avaliacao agora nasce em /assessment e abre o fluxo real no mesmo endereco.
                </h2>
                <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-300">
                  Esta shell continua como launcher e resumo, mas a variante live
                  agora mora em <code>{LIVE_ASSESSMENT_WORKSPACE_ROUTE}</code>.
                  Assim o fluxo validado de leitura, captura ocular e recall fica
                  oficialmente sob a familia <code>/assessment</code>, sem manter
                  uma rota paralela como dona da experiencia real.
                </p>
              </div>

              <div className="flex flex-col items-start gap-3 rounded-3xl border border-white/10 bg-white/10 p-4">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Etapa atual
                </span>
                <strong className="text-xl">{stageLabel}</strong>
                <span className="text-sm text-slate-300">
                  {snapshot.latestSessionLabel ?? 'Nenhuma atividade registrada ainda.'}
                </span>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={loading || snapshot.primaryAction.disabled}
                onClick={() => navigate(LIVE_ASSESSMENT_WORKSPACE_ROUTE)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-slate-300"
              >
                {snapshot.primaryAction.label}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/library')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Ver biblioteca de suporte
              </button>
            </div>

            {snapshot.blockReason && (
              <p className="mt-4 text-sm font-medium text-amber-200">
                {snapshot.blockReason}
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <BookOpenText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Estado do texto
                  </p>
                  <p className="text-sm text-slate-500">
                    {snapshot.stage === 'loading-text'
                      ? 'Conteudo de leitura em preparo.'
                      : 'Workspace pronta para entregar leitura guiada.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Capturas salvas
                  </p>
                  <p className="text-sm text-slate-500">
                    {snapshot.savedCapturesLabel}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Ultima sessao
                  </p>
                  <p className="text-sm text-slate-500">
                    {snapshot.latestSessionLabel ?? 'Sem historico consolidado.'}
                  </p>
                </div>
              </div>
            </article>
          </div>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Workspace de captura
                </h3>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                  A estrutura ja separa hero, status, superficie principal e
                  trilha lateral. Hoje a shell enquadra e dispara a variante
                  live do fluxo validado; no proximo bundle, esta mesma
                  superficie pode absorver a experiencia imersiva inteira sem
                  trocar o endereco principal.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Fluxo validado ativo
              </span>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <ScanEye className="h-4 w-4" />
                  Superficie principal
                </div>
                <div className="mt-4 rounded-[1.5rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <p className="text-lg font-semibold text-slate-900">
                    O leitor, a captura ocular e o recall seguem validados, mas
                    agora entram pela variante live de /assessment.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    A CTA principal ja leva direto para <code>{LIVE_ASSESSMENT_WORKSPACE_ROUTE}</code>.
                    Esta superficie existe para manter a IA da shell clara sem
                    fingir que o corpo imersivo foi reescrito: o fluxo existente
                    continua o mesmo, mas agora ownership e entrada oficial ficam
                    em <code>/assessment</code>.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <article className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Perfil atual
                  </h4>
                  <p className="mt-3 text-lg font-bold text-slate-900">
                    {profile?.name ? `Paciente: ${profile.name}` : 'Perfil sem nome salvo'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Distancia de leitura registrada: {profile?.viewingDistanceCm ?? 40} cm.
                  </p>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Compatibilidade
                  </h4>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    <code>/eye-tracking-test</code> segue existindo apenas como
                    redirecionamento de compatibilidade para{' '}
                    <code>{LIVE_ASSESSMENT_WORKSPACE_ROUTE}</code>. A shell segue
                    como entrada nao-live, e o workspace validado continua sendo
                    aberto dentro da propria rota de avaliacao.
                  </p>
                </article>
              </div>
            </div>
          </section>
        </section>

        <aside className="space-y-6">
          {snapshot.resultSummary ? (
            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Ultimo resultado
              </p>
              <h3 className="mt-3 text-2xl font-bold text-slate-900">
                {snapshot.resultSummary.title}
              </h3>
              <p className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                {snapshot.resultSummary.badge}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-500">
                O resumo vem direto do adapter da Task 2, entao a shell ja
                exibe resultado consolidado mesmo antes de reintroduzir a captura
                imersiva completa.
              </p>
            </article>
          ) : (
            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Primeira avaliacao
              </p>
              <h3 className="mt-3 text-2xl font-bold text-slate-900">
                Shell pronta para receber a jornada
              </h3>
              <p className="mt-4 text-sm leading-6 text-slate-500">
                Sem registros anteriores por aqui. A nova rota ja organiza a
                estrutura e o ponto de entrada unico, abrindo a variante live
                no mesmo endereco quando a avaliacao real precisa comecar.
              </p>
            </article>
          )}

          <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              O que entra depois
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>Texto de leitura e canvas ocular dentro da superficie principal.</li>
              <li>Estados de captura, recall e resultado conectados ao snapshot.</li>
              <li>Reducao gradual da camada de launcher conforme a shell absorver o corpo imersivo.</li>
            </ul>
          </article>
        </aside>
      </div>
    </AppShell>
  );
}

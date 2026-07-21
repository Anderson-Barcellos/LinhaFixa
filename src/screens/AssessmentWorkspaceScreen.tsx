import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AssessmentSetupPanel } from '@/components/assessment/AssessmentSetupPanel';
import { AppShell } from '@/components/app/AppShell';
import { ExperimentNotebookScreen } from '@/components/notebook/ExperimentNotebookScreen';
import { signalCameraIntent } from '@/services/adaptivePreload';
import {
  deriveAssessmentWorkspaceLatestRecord,
  isLiveAssessmentWorkspace,
  LIVE_ASSESSMENT_WORKSPACE_ROUTE,
} from '@/services/assessmentAdapter';
import { buildExperimentNotebookProjection } from '@/services/experimentNotebookProjection';
import { loadRouteModule } from '@/services/routeChunkRecovery';
import { loadEyeTrackingTestModule } from '@/services/routeModules';
import {
  getRecallTests,
  getSessions,
  getValidationCaptures,
} from '@/services/storage';
import type {
  AssessmentMode,
  RecallTestResult,
  SessionResult,
  ValidationCapture,
} from '@/types';

// A superfície ocular é o módulo mais pesado do app (MediaPipe, análise, canvas);
// carrega sob demanda ao entrar no workspace live, aquecida antes por idle/intent.
const EyeTrackingTestScreen = lazy(() =>
  loadRouteModule(loadEyeTrackingTestModule).then(module => ({
    default: module.EyeTrackingTestScreen,
  })),
);

function formatRelativeLabel(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) return `Última atividade há ${diffMinutes} min`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Última atividade há ${diffHours} h`;

  return `Última atividade há ${Math.round(diffHours / 24)} dias`;
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
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [todayTimestamp] = useState(() => Date.now());
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [captures, setCaptures] = useState<ValidationCapture[]>([]);
  const [recalls, setRecalls] = useState<RecallTestResult[]>([]);

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
  const projection = useMemo(
    () => buildExperimentNotebookProjection({ sessions, captures, recalls }),
    [sessions, captures, recalls],
  );

  const openSession = (mode: AssessmentMode) => {
    setLauncherOpen(false);
    navigate(liveAssessmentRoute(mode));
  };

  const closeSession = () => {
    navigate('/assessment', { replace: true });
  };

  if (liveWorkspace) {
    return (
      <div className="overflow-hidden bg-app-inset text-strong">
        <div className="mx-auto h-[100dvh] min-h-0 max-w-7xl">
          <Suspense fallback={<div className="h-full min-h-[100dvh] bg-slate-950" />}>
            <EyeTrackingTestScreen
              embedded
              initialMode={requestedMode}
              onExit={closeSession}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <AppShell currentPath={location.pathname} title="Hoje" subtitle="" hideHeader>
      <ExperimentNotebookScreen
        projection={projection}
        loading={loading}
        todayTimestamp={todayTimestamp}
        onNewSession={() => setLauncherOpen(true)}
        onOpenRecord={() => navigate('/history')}
        onOpenTraining={() => navigate('/player')}
        onOpenLibrary={() => navigate('/library')}
      />
      {launcherOpen ? (
        <AssessmentSetupPanel
          latestSessionLabel={latestSessionLabel}
          onStartCapture={() => openSession('capture')}
          onStartRecall={() => openSession('recall')}
          onWarmSession={signalCameraIntent}
          onClose={() => setLauncherOpen(false)}
        />
      ) : null}
    </AppShell>
  );
}

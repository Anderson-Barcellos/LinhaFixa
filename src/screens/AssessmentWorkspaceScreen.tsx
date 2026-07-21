import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { resolveDeviceClass } from '@/services/deviceClass';
import { loadRouteModule } from '@/services/routeChunkRecovery';
import { loadEyeTrackingTestModule } from '@/services/routeModules';
import { measurementViewportSnapshot } from '@/services/measurementViewport';
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
import { useAppStore } from '@/store/useAppStore';

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

function liveAssessmentRoute(mode: AssessmentMode, exploratory: boolean): string {
  const modeParam = mode === 'recall' ? '&mode=recall' : '';
  const qualityParam = exploratory ? '&quality=exploratory' : '&quality=comparable';
  return `${LIVE_ASSESSMENT_WORKSPACE_ROUTE}${modeParam}${qualityParam}`;
}

export function AssessmentWorkspaceScreen(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [todayTimestamp] = useState(() => Date.now());
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [captures, setCaptures] = useState<ValidationCapture[]>([]);
  const [recalls, setRecalls] = useState<RecallTestResult[]>([]);
  const [sessionViewportHeight, setSessionViewportHeight] = useState<number | null>(null);
  const sessionOrientationRef = useRef<'portrait' | 'landscape' | null>(null);

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
  const initialExploratory = useMemo(
    () => new URLSearchParams(location.search).get('quality') === 'exploratory',
    [location.search],
  );
  const deviceDecision = useMemo(() => resolveDeviceClass(profile, {
    width: window.innerWidth,
    height: window.innerHeight,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
  }), [profile]);
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

  useLayoutEffect(() => {
    if (!liveWorkspace) {
      setSessionViewportHeight(null);
      sessionOrientationRef.current = null;
      return;
    }

    let settleFrameOne: number | null = null;
    let settleFrameTwo: number | null = null;
    let settleTimer: number | null = null;

    const cancelSettling = () => {
      if (settleFrameOne !== null) window.cancelAnimationFrame(settleFrameOne);
      if (settleFrameTwo !== null) window.cancelAnimationFrame(settleFrameTwo);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleFrameOne = null;
      settleFrameTwo = null;
      settleTimer = null;
    };
    const readSnapshot = () => measurementViewportSnapshot({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height,
    });
    const commitSnapshot = () => {
      const snapshot = readSnapshot();
      sessionOrientationRef.current = snapshot.orientation;
      setSessionViewportHeight(snapshot.height);
    };
    const settleOrientationChange = () => {
      cancelSettling();
      commitSnapshot();
      settleFrameOne = window.requestAnimationFrame(() => {
        settleFrameTwo = window.requestAnimationFrame(commitSnapshot);
      });
      settleTimer = window.setTimeout(commitSnapshot, 250);
    };
    const handleViewportChange = () => {
      const nextOrientation = readSnapshot().orientation;
      if (nextOrientation !== sessionOrientationRef.current) settleOrientationChange();
    };

    commitSnapshot();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    return () => {
      cancelSettling();
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
    };
  }, [liveWorkspace]);

  const openSession = (mode: AssessmentMode, exploratory = false) => {
    setLauncherOpen(false);
    navigate(liveAssessmentRoute(mode, exploratory));
  };

  const closeSession = () => {
    navigate('/assessment', { replace: true });
  };

  if (liveWorkspace) {
    return (
      <div
        data-testid="measurement-viewport"
        className="overflow-hidden bg-slate-950 text-white"
        style={{ height: sessionViewportHeight ? `${sessionViewportHeight}px` : '100svh' }}
      >
        <div className="mx-auto h-full min-h-0 max-w-7xl">
          <Suspense fallback={<div className="h-full bg-slate-950" />}>
            <EyeTrackingTestScreen
              embedded
              initialMode={requestedMode}
              initialExploratory={initialExploratory}
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
          deviceClassConfirmed={deviceDecision.deviceClassSource === 'confirmed'}
          suggestedDeviceLabel={
            deviceDecision.deviceClass === 'phone'
              ? 'Celular'
              : deviceDecision.deviceClass === 'tablet'
                ? 'Tablet'
                : 'Desktop'
          }
          onStartCapture={() => openSession('capture', false)}
          onStartRecall={() => openSession('recall', false)}
          onStartExploratory={mode => openSession(mode, true)}
          onOpenSettings={() => navigate('/settings')}
          onWarmSession={signalCameraIntent}
          onClose={() => setLauncherOpen(false)}
        />
      ) : null}
    </AppShell>
  );
}

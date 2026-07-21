/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RouteLoadBoundary } from '@/components/RouteLoadBoundary';
import { useAppStore } from '@/store/useAppStore';
import { loadRouteModule } from '@/services/routeChunkRecovery';
import {
  loadDashboardModule,
  loadExerciseLibraryModule,
  loadExercisePlayerModule,
  loadHistoryModule,
  loadSettingsModule,
} from '@/services/routeModules';
import { getProfile, hasConsent } from '@/services/storage';
import { startAdaptiveCameraCodePreload } from '@/services/adaptivePreload';
import type { UserProfile } from '@/types';

import { ConsentScreen } from '@/screens/ConsentScreen';
// A rota de entrada (/assessment) fica no bundle inicial: primeira pintura sem
// round trip extra. A superfície ocular pesada é lazy dentro dela.
import { AssessmentWorkspaceScreen } from '@/screens/AssessmentWorkspaceScreen';
import {
  LEGACY_ASSESSMENT_WORKSPACE_ROUTE,
  LIVE_ASSESSMENT_WORKSPACE_ROUTE,
} from '@/services/assessmentAdapter';

const ExercisePlayerScreen = lazy(() => loadRouteModule(loadExercisePlayerModule).then(module => ({ default: module.ExercisePlayerScreen })));
const DashboardScreen = lazy(() => loadRouteModule(loadDashboardModule).then(module => ({ default: module.DashboardScreen })));
const ExerciseLibraryScreen = lazy(() => loadRouteModule(loadExerciseLibraryModule).then(module => ({ default: module.ExerciseLibraryScreen })));
const SettingsScreen = lazy(() => loadRouteModule(loadSettingsModule).then(module => ({ default: module.SettingsScreen })));
const HistoryScreen = lazy(() => loadRouteModule(loadHistoryModule).then(module => ({ default: module.HistoryScreen })));

export default function App() {
  const { profile, setProfile, consentAccepted, setConsentAccepted } = useAppStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Initial Hydration
    Promise.all([getProfile(), hasConsent()]).then(([storedProfile, consent]) => {
      if (storedProfile) setProfile(storedProfile);
      setConsentAccepted(consent);
      if (!storedProfile && consent) {
         // Create default profile if none exists
         const p: UserProfile = {
           name: '', isAdult: true, fontSizePreference: 'normal' as const,
           contrastPreference: 'light' as const, cameraEnabled: true, viewingDistanceCm: 40
         };
         setProfile(p);
      }
      setHydrated(true);
    });
  }, [setProfile, setConsentAccepted]);

  useEffect(() => {
    if (!hydrated || !consentAccepted) return;
    return startAdaptiveCameraCodePreload();
  }, [hydrated, consentAccepted]);

  // Router basename derived from the Vite `base` (APP_BASE_PATH). '/' at the root,
  // '/gaze' when mounted under a sub-path. Keeps client-side routes correct in both.
  const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

  return (
    <BrowserRouter basename={basename}>
      <RouteLoadBoundary>
        <Suspense fallback={<BootScreen />}>
          <Routes>
            <Route path="/consent" element={<ConsentScreen />} />
            <Route path="/" element={!hydrated ? <BootScreen /> : consentAccepted ? <Navigate to="/assessment" replace /> : <Navigate to="/consent" replace />} />
            <Route path="/player" element={!hydrated ? <BootScreen /> : consentAccepted ? <ExercisePlayerScreen /> : <Navigate to="/consent" replace />} />
            <Route path="/assessment" element={!hydrated ? <BootScreen /> : consentAccepted ? <AssessmentWorkspaceScreen /> : <Navigate to="/consent" replace />} />
            <Route path="/history" element={!hydrated ? <BootScreen /> : consentAccepted ? <HistoryScreen /> : <Navigate to="/consent" replace />} />
            <Route path="/dashboard" element={!hydrated ? <BootScreen /> : consentAccepted ? <DashboardScreen /> : <Navigate to="/consent" replace />} />
            <Route path="/statistics" element={<Navigate to="/dashboard" replace />} />
            <Route path="/library" element={!hydrated ? <BootScreen /> : consentAccepted ? <ExerciseLibraryScreen /> : <Navigate to="/consent" replace />} />
            <Route path="/settings" element={!hydrated ? <BootScreen /> : consentAccepted ? <SettingsScreen /> : <Navigate to="/consent" replace />} />
            <Route
              path={LEGACY_ASSESSMENT_WORKSPACE_ROUTE}
              element={
                !hydrated ? (
                  <BootScreen />
                ) : consentAccepted ? (
                  <Navigate to={LIVE_ASSESSMENT_WORKSPACE_ROUTE} replace />
                ) : (
                  <Navigate to="/consent" replace />
                )
              }
            />
          </Routes>
        </Suspense>
      </RouteLoadBoundary>
    </BrowserRouter>
  );
}

function BootScreen() {
  return <div className="min-h-screen bg-slate-50" />;
}

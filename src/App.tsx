/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { getProfile, hasConsent } from '@/services/storage';

import { HomeScreen } from '@/screens/HomeScreen';
import { ConsentScreen } from '@/screens/ConsentScreen';
import { ExercisePlayerScreen } from '@/screens/ExercisePlayerScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { ExerciseLibraryScreen } from '@/screens/ExerciseLibraryScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { EyeTrackingTestScreen } from '@/screens/EyeTrackingTestScreen';

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
         const p = {
           name: '', isAdult: true, fontSizePreference: 'normal' as const, 
           contrastPreference: 'light' as const, cameraEnabled: true, viewingDistanceCm: 40
         };
         setProfile(p);
      }
      setHydrated(true);
    });
  }, [setProfile, setConsentAccepted]);

  // Router basename derived from the Vite `base` (APP_BASE_PATH). '/' at the root,
  // '/gaze' when mounted under a sub-path. Keeps client-side routes correct in both.
  const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

  return (
    <BrowserRouter basename={basename}>
       <Routes>
          <Route path="/consent" element={<ConsentScreen />} />
          <Route path="/" element={!hydrated ? <BootScreen /> : consentAccepted ? <HomeScreen /> : <Navigate to="/consent" replace />} />
          <Route path="/player" element={!hydrated ? <BootScreen /> : consentAccepted ? <ExercisePlayerScreen /> : <Navigate to="/consent" replace />} />
          <Route path="/dashboard" element={!hydrated ? <BootScreen /> : consentAccepted ? <DashboardScreen /> : <Navigate to="/consent" replace />} />
          <Route path="/library" element={!hydrated ? <BootScreen /> : consentAccepted ? <ExerciseLibraryScreen /> : <Navigate to="/consent" replace />} />
          <Route path="/settings" element={!hydrated ? <BootScreen /> : consentAccepted ? <SettingsScreen /> : <Navigate to="/consent" replace />} />
          <Route path="/eye-tracking-test" element={!hydrated ? <BootScreen /> : consentAccepted ? <EyeTrackingTestScreen /> : <Navigate to="/consent" replace />} />
       </Routes>
    </BrowserRouter>
  );
}

function BootScreen() {
  return <div className="min-h-screen bg-slate-50" />;
}

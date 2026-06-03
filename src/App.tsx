/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
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
    });
  }, [setProfile, setConsentAccepted]);

  return (
    <BrowserRouter>
       <Routes>
          <Route path="/consent" element={<ConsentScreen />} />
          <Route path="/" element={consentAccepted ? <HomeScreen /> : <Navigate to="/consent" replace />} />
          <Route path="/player" element={consentAccepted ? <ExercisePlayerScreen /> : <Navigate to="/consent" replace />} />
          <Route path="/dashboard" element={consentAccepted ? <DashboardScreen /> : <Navigate to="/consent" replace />} />
          <Route path="/library" element={consentAccepted ? <ExerciseLibraryScreen /> : <Navigate to="/consent" replace />} />
          <Route path="/settings" element={consentAccepted ? <SettingsScreen /> : <Navigate to="/consent" replace />} />
          <Route path="/eye-tracking-test" element={consentAccepted ? <EyeTrackingTestScreen /> : <Navigate to="/consent" replace />} />
       </Routes>
    </BrowserRouter>
  );
}

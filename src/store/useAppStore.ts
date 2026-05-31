import { create } from 'zustand';
import { UserProfile, SymptomRating } from '@/types';

interface AppState {
  profile: UserProfile | null;
  setProfile: (p: UserProfile) => void;
  consentAccepted: boolean;
  setConsentAccepted: (v: boolean) => void;
  currentSymptoms: SymptomRating | null;
  setCurrentSymptoms: (s: SymptomRating) => void;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  consentAccepted: false,
  setConsentAccepted: (v) => set({ consentAccepted: v }),
  currentSymptoms: null,
  setCurrentSymptoms: (symptoms) => set({ currentSymptoms: symptoms })
}));

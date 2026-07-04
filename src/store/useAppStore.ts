import { create } from 'zustand';
import { UserProfile } from '@/types';

interface AppState {
  profile: UserProfile | null;
  setProfile: (p: UserProfile) => void;
  consentAccepted: boolean;
  setConsentAccepted: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  consentAccepted: false,
  setConsentAccepted: (v) => set({ consentAccepted: v })
}));

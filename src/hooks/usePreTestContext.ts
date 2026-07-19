import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getTodayPreContext } from '@/services/storage';
import type { PreTestContext } from '@/types';

// Quick pre-test context flow extracted from EyeTrackingTestScreen: owns the
// adopted context, the form draft/visibility and the session-scoped skip. The
// context is provenance, never a gate on the instrument — the screen asks
// shouldOpenContextForm() right before a capture and, when the form resolves
// (adopt or skip), the hook resumes the pending capture through onResume. The
// hook knows nothing about camera, capture internals, recall or JSX; the form
// markup stays in the screen consuming this state and these handlers.
//
// Prefill: today's latest saved context (any record source) is adopted outright
// on mount, so the form only shows on the first capture of the day — later
// sessions start on the first tap. "Pular por agora" is session-only: it lets
// captures start untagged without reopening the form, and is never persisted.

// --- Pure decisions (unit-tested) ---

// Draft shown before any context exists today: neutral middle of every scale.
export function defaultPreTestContextDraft(): PreTestContext {
  return { venvanseTakenAt: null, sleepHours: 7, mood: 3, feeling: 3 };
}

// The form opens only when no context was adopted (today's prefill or this
// session's form) and the user hasn't skipped for the session.
export function shouldRequestPreTestContext(input: {
  context: PreTestContext | null;
  skippedThisSession: boolean;
}): boolean {
  return !input.context && !input.skippedThisSession;
}

export interface UsePreTestContextOptions {
  // Restarts the pending capture after the form resolves (adopt or skip). Read
  // lazily via a committed ref so the screen can pass a function declared after
  // this hook (same pattern as useRecallFlow's callbacks).
  onResume: () => void;
}

export interface PreTestContextHandle {
  contextDraft: PreTestContext;
  setContextDraft: (draft: PreTestContext) => void;
  contextFormOpen: boolean;
  // Gate called by the screen at capture start: opens the form and returns true
  // when the quick context still needs to be asked; the capture then waits for
  // adopt/skip. Returns false when the capture may start right away.
  shouldOpenContextForm: () => boolean;
  // Form submit: adopt the draft (ref first, so the capture resuming right now
  // already sees it), close the form and resume the capture.
  adoptContextDraft: () => void;
  // "Pular por agora": session-scoped skip, capture proceeds untagged.
  skipContextForNow: () => void;
  // Cancel/Escape: close without adopting, skipping or resuming.
  closeContextForm: () => void;
  // Latest adopted context, for capture provenance and the recall quiz record.
  getPreTestContext: () => PreTestContext | null;
}

export function usePreTestContext(options: UsePreTestContextOptions): PreTestContextHandle {
  const [preContext, setPreContext] = useState<PreTestContext | null>(null);
  const [contextDraft, setContextDraft] = useState<PreTestContext>(defaultPreTestContextDraft());
  const [contextFormOpen, setContextFormOpen] = useState(false);
  const preContextRef = useRef<PreTestContext | null>(null);
  // "Pular por agora": start capturing without context instead of reopening the form.
  const skipContextRef = useRef(false);
  useEffect(() => { preContextRef.current = preContext; }, [preContext]);

  // Latest committed resume callback (the screen declares startCapture after this hook).
  const onResumeRef = useRef(options.onResume);
  useLayoutEffect(() => { onResumeRef.current = options.onResume; });

  useEffect(() => {
    getTodayPreContext()
      .then(ctx => {
        if (!ctx) return;
        setContextDraft(ctx);
        // Adopt today's answers outright: the form only shows on the first
        // capture of the day, later sessions start on the first tap.
        preContextRef.current = ctx;
        setPreContext(ctx);
      })
      .catch(() => {/* keep defaults */});
  }, []);

  const shouldOpenContextForm = () => {
    if (!shouldRequestPreTestContext({
      context: preContextRef.current,
      skippedThisSession: skipContextRef.current,
    })) return false;
    setContextFormOpen(true);
    return true;
  };

  const adoptContextDraft = () => {
    // The ref is set directly so the capture that starts right now (before
    // the state effect runs) already sees the context.
    preContextRef.current = contextDraft;
    setPreContext(contextDraft);
    setContextFormOpen(false);
    onResumeRef.current();
  };

  const skipContextForNow = () => {
    // Context is provenance, not a gate: capture proceeds untagged.
    skipContextRef.current = true;
    setContextFormOpen(false);
    onResumeRef.current();
  };

  return {
    contextDraft,
    setContextDraft,
    contextFormOpen,
    shouldOpenContextForm,
    adoptContextDraft,
    skipContextForNow,
    closeContextForm: () => setContextFormOpen(false),
    getPreTestContext: () => preContextRef.current,
  };
}

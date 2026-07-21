import type { AssessmentMode } from '@/types';
import type { CaptureInterruptionReason } from './captureValidity';

export type AssessmentSessionPhase =
  | 'setup'
  | 'checking-readiness'
  | 'calibrating'
  | 'validating'
  | 'ready'
  | 'capturing'
  | 'generating-recall'
  | 'quiz'
  | 'result'
  | 'interrupted';

export type AssessmentSessionStatus = AssessmentSessionPhase | 'saving' | 'save-failed';
export type AssessmentPersistence = 'idle' | 'saving' | 'saved' | 'failed';

export interface AssessmentSessionState {
  mode: AssessmentMode;
  phase: AssessmentSessionPhase;
  persistence: AssessmentPersistence;
  exploratory: boolean;
  canRunExploratory: boolean;
  blockReason: string | null;
  interruptionReason: CaptureInterruptionReason | null;
  transitionError: string | null;
}

export type AssessmentSessionEvent =
  | { type: 'BEGIN' }
  | { type: 'READINESS_PASSED'; needsCalibration: boolean }
  | { type: 'READINESS_FAILED'; reason: string; canRunExploratory: boolean }
  | { type: 'RUN_EXPLORATORY' }
  | { type: 'CALIBRATION_ACCEPTED' }
  | { type: 'CALIBRATION_SKIPPED' }
  | { type: 'VALIDATION_PASSED' }
  | { type: 'VALIDATION_FAILED'; reason: string; canRunExploratory: boolean }
  | { type: 'CAPTURE_STARTED' }
  | { type: 'CAPTURE_FINISHED'; withRecall: boolean }
  | { type: 'RECALL_READY' }
  | { type: 'RECALL_FAILED'; reason: string }
  | { type: 'RETRY_RECALL' }
  | { type: 'QUIZ_FINISHED' }
  | { type: 'SAVE_SUCCEEDED' }
  | { type: 'SAVE_FAILED' }
  | { type: 'RETRY_SAVE' }
  | { type: 'INTERRUPTED'; reason: CaptureInterruptionReason }
  | { type: 'RESET' };

export function initialAssessmentSessionState(mode: AssessmentMode): AssessmentSessionState {
  return {
    mode,
    phase: 'setup',
    persistence: 'idle',
    exploratory: false,
    canRunExploratory: false,
    blockReason: null,
    interruptionReason: null,
    transitionError: null,
  };
}

export function assessmentSessionStatus(state: AssessmentSessionState): AssessmentSessionStatus {
  if (state.phase === 'result' && state.persistence === 'saving') return 'saving';
  if (state.phase === 'result' && state.persistence === 'failed') return 'save-failed';
  return state.phase;
}

function reject(
  state: AssessmentSessionState,
  event: AssessmentSessionEvent,
): AssessmentSessionState {
  return { ...state, transitionError: `${state.phase}:${event.type}` };
}

export function transitionAssessmentSession(
  state: AssessmentSessionState,
  event: AssessmentSessionEvent,
): AssessmentSessionState {
  if (event.type === 'RESET') return initialAssessmentSessionState(state.mode);
  if (event.type === 'INTERRUPTED' && state.phase !== 'setup' && state.phase !== 'result') {
    return {
      ...state,
      phase: 'interrupted',
      interruptionReason: event.reason,
      transitionError: null,
    };
  }
  if (event.type === 'SAVE_SUCCEEDED' && state.persistence === 'saving') {
    return { ...state, persistence: 'saved', transitionError: null };
  }
  if (event.type === 'SAVE_FAILED' && state.persistence === 'saving') {
    return { ...state, persistence: 'failed', transitionError: null };
  }
  if (event.type === 'RETRY_SAVE' && state.persistence === 'failed') {
    return { ...state, persistence: 'saving', transitionError: null };
  }

  switch (state.phase) {
    case 'setup':
      if (event.type === 'BEGIN') {
        return {
          ...state,
          phase: 'checking-readiness',
          blockReason: null,
          transitionError: null,
        };
      }
      if (event.type === 'RUN_EXPLORATORY' && state.canRunExploratory) {
        return {
          ...state,
          phase: 'ready',
          exploratory: true,
          blockReason: null,
          transitionError: null,
        };
      }
      return reject(state, event);
    case 'checking-readiness':
      if (event.type === 'READINESS_PASSED') {
        return {
          ...state,
          phase: event.needsCalibration ? 'calibrating' : 'validating',
          transitionError: null,
        };
      }
      if (event.type === 'READINESS_FAILED') {
        return {
          ...state,
          phase: 'setup',
          blockReason: event.reason,
          canRunExploratory: event.canRunExploratory,
          transitionError: null,
        };
      }
      return reject(state, event);
    case 'calibrating':
      if (event.type === 'CALIBRATION_ACCEPTED') {
        return { ...state, phase: 'validating', transitionError: null };
      }
      if (event.type === 'CALIBRATION_SKIPPED') {
        return {
          ...state,
          phase: 'ready',
          exploratory: true,
          transitionError: null,
        };
      }
      return reject(state, event);
    case 'validating':
      if (event.type === 'VALIDATION_PASSED') {
        return { ...state, phase: 'ready', transitionError: null };
      }
      if (event.type === 'VALIDATION_FAILED') {
        return {
          ...state,
          phase: 'setup',
          blockReason: event.reason,
          canRunExploratory: event.canRunExploratory,
          transitionError: null,
        };
      }
      return reject(state, event);
    case 'ready':
      return event.type === 'CAPTURE_STARTED'
        ? { ...state, phase: 'capturing', transitionError: null }
        : reject(state, event);
    case 'capturing':
      return event.type === 'CAPTURE_FINISHED'
        ? {
            ...state,
            phase: event.withRecall ? 'generating-recall' : 'result',
            persistence: 'saving',
            transitionError: null,
          }
        : reject(state, event);
    case 'generating-recall':
      if (event.type === 'RECALL_READY') {
        return { ...state, phase: 'quiz', transitionError: null };
      }
      if (event.type === 'RECALL_FAILED') {
        return {
          ...state,
          phase: 'result',
          blockReason: event.reason,
          transitionError: null,
        };
      }
      return reject(state, event);
    case 'quiz':
      return event.type === 'QUIZ_FINISHED'
        ? { ...state, phase: 'result', transitionError: null }
        : reject(state, event);
    case 'result':
      if (event.type === 'RETRY_RECALL' && state.mode === 'recall' && state.blockReason) {
        return {
          ...state,
          phase: 'generating-recall',
          blockReason: null,
          transitionError: null,
        };
      }
      return reject(state, event);
    case 'interrupted':
      return reject(state, event);
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessmentSessionStatus,
  hasUnsavedAssessmentResult,
  initialAssessmentSessionState,
  transitionAssessmentSession,
  type AssessmentSessionState,
} from './assessmentSessionController';

test('runs the comparable recall path through explicit states', () => {
  let state = initialAssessmentSessionState('recall');
  state = transitionAssessmentSession(state, { type: 'BEGIN' });
  assert.equal(assessmentSessionStatus(state), 'checking-readiness');
  state = transitionAssessmentSession(state, { type: 'READINESS_PASSED', needsCalibration: true });
  assert.equal(assessmentSessionStatus(state), 'calibrating');
  state = transitionAssessmentSession(state, { type: 'CALIBRATION_ACCEPTED' });
  state = transitionAssessmentSession(state, { type: 'VALIDATION_PASSED' });
  assert.equal(assessmentSessionStatus(state), 'ready');
  state = transitionAssessmentSession(state, { type: 'CAPTURE_STARTED' });
  assert.equal(assessmentSessionStatus(state), 'capturing');
  state = transitionAssessmentSession(state, { type: 'CAPTURE_FINISHED', withRecall: true });
  assert.equal(assessmentSessionStatus(state), 'generating-recall');
  assert.equal(state.persistence, 'saving');
  state = transitionAssessmentSession(state, { type: 'SAVE_SUCCEEDED' });
  state = transitionAssessmentSession(state, { type: 'RECALL_READY' });
  state = transitionAssessmentSession(state, { type: 'QUIZ_FINISHED' });
  assert.equal(assessmentSessionStatus(state), 'result');
  assert.equal(state.persistence, 'saved');
});

test('readiness failure can continue only through explicit exploratory consent', () => {
  let state = transitionAssessmentSession(initialAssessmentSessionState('capture'), { type: 'BEGIN' });
  state = transitionAssessmentSession(state, {
    type: 'READINESS_FAILED',
    reason: 'Classe de dispositivo não confirmada',
    canRunExploratory: true,
  });
  assert.equal(state.phase, 'setup');
  assert.equal(state.blockReason, 'Classe de dispositivo não confirmada');
  state = transitionAssessmentSession(state, { type: 'RUN_EXPLORATORY' });
  assert.equal(assessmentSessionStatus(state), 'ready');
  assert.equal(state.exploratory, true);
});

test('interruption ends the run and reset is required before another capture', () => {
  const capturing = {
    ...initialAssessmentSessionState('capture'),
    phase: 'capturing' as const,
  };
  const interrupted = transitionAssessmentSession(capturing, {
    type: 'INTERRUPTED',
    reason: 'navigation-during-capture',
  });
  assert.equal(assessmentSessionStatus(interrupted), 'interrupted');
  assert.equal(interrupted.interruptionReason, 'navigation-during-capture');
  const rejectedRestart = transitionAssessmentSession(interrupted, { type: 'CAPTURE_STARTED' });
  assert.equal(assessmentSessionStatus(rejectedRestart), 'interrupted');
  assert.match(rejectedRestart.transitionError ?? '', /CAPTURE_STARTED/);
  assert.equal(
    assessmentSessionStatus(transitionAssessmentSession(interrupted, { type: 'RESET' })),
    'setup',
  );
});

test('save failure is visible and retry returns to saving', () => {
  let state: AssessmentSessionState = {
    ...initialAssessmentSessionState('capture'),
    phase: 'result' as const,
    persistence: 'saving' as const,
  };
  state = transitionAssessmentSession(state, { type: 'SAVE_FAILED' });
  assert.equal(assessmentSessionStatus(state), 'save-failed');
  state = transitionAssessmentSession(state, { type: 'RETRY_SAVE' });
  assert.equal(assessmentSessionStatus(state), 'saving');
});

test('recall generation retry reuses the completed ocular run', () => {
  let state: AssessmentSessionState = {
    ...initialAssessmentSessionState('recall'),
    phase: 'generating-recall' as const,
    persistence: 'saved' as const,
  };
  state = transitionAssessmentSession(state, { type: 'RECALL_FAILED', reason: 'Backend offline' });
  assert.equal(assessmentSessionStatus(state), 'result');
  state = transitionAssessmentSession(state, { type: 'RETRY_RECALL' });
  assert.equal(assessmentSessionStatus(state), 'generating-recall');
  assert.equal(state.persistence, 'saved');
});

test('unsaved-result guard covers every saving and failed branch', () => {
  assert.equal(hasUnsavedAssessmentResult('saving', 'idle'), true);
  assert.equal(hasUnsavedAssessmentResult('failed', 'idle'), true);
  assert.equal(hasUnsavedAssessmentResult('saved', 'saving'), true);
  assert.equal(hasUnsavedAssessmentResult('saved', 'failed'), true);
  assert.equal(hasUnsavedAssessmentResult('saved', 'saved'), false);
  assert.equal(hasUnsavedAssessmentResult(null, 'idle'), false);
});

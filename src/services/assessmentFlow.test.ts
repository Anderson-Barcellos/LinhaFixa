import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAssessmentResultSummary,
  canStartAssessment,
  deriveAssessmentStage,
  type AssessmentStageInput,
} from './assessmentFlow';

const baseInput: AssessmentStageInput = {
  mode: 'capture',
  readingTextState: 'ready',
  capturing: false,
  recallGenerating: false,
  recallQuizOpen: false,
  hasCaptureResult: false,
};

test('deriveAssessmentStage returns setup before any prepared text exists', () => {
  assert.equal(
    deriveAssessmentStage({ ...baseInput, readingTextState: 'idle' }),
    'setup',
  );
});

test('deriveAssessmentStage prioritizes capture and quiz states over passive readiness', () => {
  assert.equal(
    deriveAssessmentStage({ ...baseInput, capturing: true }),
    'capturing',
  );
  assert.equal(
    deriveAssessmentStage({ ...baseInput, recallGenerating: true }),
    'generating-quiz',
  );
  assert.equal(
    deriveAssessmentStage({ ...baseInput, recallQuizOpen: true }),
    'quiz',
  );
});

test('canStartAssessment blocks when reading text is unavailable', () => {
  assert.deepEqual(
    canStartAssessment({ ...baseInput, readingTextState: 'error' }),
    {
      ok: false,
      reason: 'Texto de leitura indisponivel; capture depois que a IA responder.',
    },
  );
});

test('buildAssessmentResultSummary emits capture-only and recall-aware variants', () => {
  assert.deepEqual(
    buildAssessmentResultSummary({
      mode: 'capture',
      captureTitle: 'Dinamica ocular capturada',
      recallOutcome: null,
    }),
    {
      title: 'Dinamica ocular capturada',
      badge: 'Captura simples',
    },
  );
  assert.deepEqual(
    buildAssessmentResultSummary({
      mode: 'recall',
      captureTitle: 'Dinamica ocular capturada',
      recallOutcome: { score: 5, total: 6, topic: 'Astronomia' },
    }),
    {
      title: 'Dinamica ocular capturada',
      badge: 'Recall 5/6',
    },
  );
});

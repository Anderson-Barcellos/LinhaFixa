import assert from 'node:assert/strict';
import test from 'node:test';

import type { RecallTestResult } from '@/types';
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

const baseRecallResult = {
  id: 'recall-1',
  timestamp: 2,
  topic: 'Astronomia',
  text: 'Texto de teste',
  questions: [
    {
      question: 'Pergunta 1',
      options: ['A', 'B', 'C', 'D', 'E'],
      correctIndex: 0,
      rationale: 'Trecho 1',
    },
    {
      question: 'Pergunta 2',
      options: ['A', 'B', 'C', 'D', 'E'],
      correctIndex: 1,
      rationale: 'Trecho 2',
    },
    {
      question: 'Pergunta 3',
      options: ['A', 'B', 'C', 'D', 'E'],
      correctIndex: 2,
      rationale: 'Trecho 3',
    },
    {
      question: 'Pergunta 4',
      options: ['A', 'B', 'C', 'D', 'E'],
      correctIndex: 3,
      rationale: 'Trecho 4',
    },
    {
      question: 'Pergunta 5',
      options: ['A', 'B', 'C', 'D', 'E'],
      correctIndex: 4,
      rationale: 'Trecho 5',
    },
    {
      question: 'Pergunta 6',
      options: ['A', 'B', 'C', 'D', 'E'],
      correctIndex: 0,
      rationale: 'Trecho 6',
    },
  ],
  answers: [0, 1, 2, 3, 4, 0],
  score: 5,
  readingDurationMs: 18000,
} satisfies RecallTestResult;

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

test('deriveAssessmentStage prefers an explicit compatible controller status', () => {
  assert.equal(
    deriveAssessmentStage({
      ...baseInput,
      readingTextState: 'idle',
      controllerStatus: 'capturing',
    }),
    'capturing',
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

test('canStartAssessment blocks while the flow is still in setup', () => {
  assert.deepEqual(
    canStartAssessment({ ...baseInput, readingTextState: 'idle' }),
    {
      ok: false,
      reason: 'Prepare o texto de leitura antes de iniciar a captura.',
    },
  );
});

test('buildAssessmentResultSummary emits capture-only and recall-aware variants', () => {
  assert.deepEqual(
    buildAssessmentResultSummary({
      mode: 'capture',
      captureTitle: 'Dinamica ocular capturada',
      recallResult: null,
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
      recallResult: baseRecallResult,
    }),
    {
      title: 'Dinamica ocular capturada',
      badge: 'Recall 5/6',
    },
  );
});

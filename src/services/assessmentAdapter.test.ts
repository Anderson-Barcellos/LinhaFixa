import assert from 'node:assert/strict';
import test from 'node:test';

import type { RecallTestResult } from '@/types';
import {
  buildAssessmentWorkspaceSnapshot,
  mapLegacyRoute,
} from './assessmentAdapter';

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

test('mapLegacyRoute keeps the old diagnostics entrypoint compatible', () => {
  assert.equal(mapLegacyRoute('/eye-tracking-test'), '/assessment');
  assert.equal(mapLegacyRoute('/dashboard'), null);
});

test('buildAssessmentWorkspaceSnapshot derives the shell state from primitive readiness inputs', () => {
  const snapshot = buildAssessmentWorkspaceSnapshot({
    mode: 'recall',
    readingTextState: 'ready',
    capturing: false,
    recallGenerating: false,
    recallQuizOpen: false,
    hasCaptureResult: false,
    captureCount: 3,
    latestSessionLabel: 'Ultima captura ha 2 horas',
    captureTitle: null,
    recallResult: null,
  });

  assert.deepEqual(snapshot.primaryAction, {
    label: 'Ler e responder',
    disabled: false,
  });
  assert.equal(snapshot.savedCapturesLabel, 'Capturas salvas (3)');
  assert.equal(snapshot.latestSessionLabel, 'Ultima captura ha 2 horas');
  assert.equal(snapshot.stage, 'text-ready');
  assert.equal(snapshot.blockReason, null);
  assert.equal(snapshot.resultSummary, null);
});

test('buildAssessmentWorkspaceSnapshot surfaces the derived block reason while text is still loading', () => {
  const snapshot = buildAssessmentWorkspaceSnapshot({
    mode: 'capture',
    readingTextState: 'loading',
    capturing: false,
    recallGenerating: false,
    recallQuizOpen: false,
    hasCaptureResult: false,
    captureCount: 0,
    latestSessionLabel: null,
    captureTitle: null,
    recallResult: null,
  });

  assert.equal(snapshot.stage, 'loading-text');
  assert.equal(snapshot.primaryAction.disabled, true);
  assert.equal(snapshot.blockReason, 'Gerando texto de leitura para recall…');
  assert.equal(snapshot.resultSummary, null);
});

test('buildAssessmentWorkspaceSnapshot exposes the derived recall result summary', () => {
  const snapshot = buildAssessmentWorkspaceSnapshot({
    mode: 'recall',
    readingTextState: 'ready',
    capturing: false,
    recallGenerating: false,
    recallQuizOpen: false,
    hasCaptureResult: true,
    captureCount: 1,
    latestSessionLabel: 'Ultima captura ha 5 minutos',
    captureTitle: 'Dinamica ocular capturada',
    recallResult: baseRecallResult,
  });

  assert.equal(snapshot.stage, 'result');
  assert.equal(snapshot.blockReason, null);
  assert.deepEqual(snapshot.resultSummary, {
    title: 'Dinamica ocular capturada',
    badge: 'Recall 5/6',
  });
});

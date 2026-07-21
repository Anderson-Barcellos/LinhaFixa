import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRecallTestResult,
  canSwitchRecallMode,
  persistRecallResult,
  recallCaptureLink,
  shouldGenerateRecallQuiz,
} from './useRecallFlow';
import type { RecallQuestion, RecallTestResult } from '@/types';

const QUESTIONS: RecallQuestion[] = [
  {
    question: 'Qual é o tema central do texto?',
    options: ['A', 'B', 'C', 'D', 'E'],
    correctIndex: 2,
    rationale: 'Dito na primeira frase.',
  },
];

test('canSwitchRecallMode rejects re-selecting the current mode', () => {
  assert.equal(canSwitchRecallMode('recall', 'recall', false), false);
  assert.equal(canSwitchRecallMode('capture', 'capture', false), false);
});

test('canSwitchRecallMode pins the mode while a capture is running', () => {
  assert.equal(canSwitchRecallMode('recall', 'capture', true), false);
});

test('canSwitchRecallMode allows a real switch when idle', () => {
  assert.equal(canSwitchRecallMode('recall', 'capture', false), true);
  assert.equal(canSwitchRecallMode('capture', 'recall', false), true);
});

test('shouldGenerateRecallQuiz fires only for a clean recall capture with content', () => {
  assert.equal(shouldGenerateRecallQuiz({ interruption: null, mode: 'recall', hasRecallContent: true }), true);
});

test('shouldGenerateRecallQuiz blocks interrupted captures', () => {
  assert.equal(shouldGenerateRecallQuiz({
    interruption: 'navigation-during-capture', mode: 'recall', hasRecallContent: true,
  }), false);
});

test('shouldGenerateRecallQuiz blocks capture mode and missing content', () => {
  assert.equal(shouldGenerateRecallQuiz({ interruption: null, mode: 'capture', hasRecallContent: true }), false);
  assert.equal(shouldGenerateRecallQuiz({ interruption: null, mode: 'recall', hasRecallContent: false }), false);
});

test('recallCaptureLink rounds the reading duration to whole milliseconds', () => {
  assert.deepEqual(
    recallCaptureLink({ captureId: 'cap-1', durationMs: 1234.56 }),
    { captureId: 'cap-1', readingDurationMs: 1235 },
  );
});

test('buildRecallTestResult maps content, quiz and capture link into the persisted record', () => {
  const result = buildRecallTestResult({
    content: { topic: 'Fotossíntese', text: 'Texto sobre fotossíntese.' },
    questions: QUESTIONS,
    answers: [2],
    score: 1,
    lastCapture: { captureId: 'cap-9', readingDurationMs: 8000 },
    context: { venvanseTakenAt: null, sleepHours: 7, mood: 3, feeling: 3 },
    now: 1700000000000,
  });
  assert.equal(result.id, '1700000000000');
  assert.equal(result.timestamp, 1700000000000);
  assert.equal(result.topic, 'Fotossíntese');
  assert.equal(result.text, 'Texto sobre fotossíntese.');
  assert.deepEqual(result.answers, [2]);
  assert.equal(result.score, 1);
  assert.equal(result.readingDurationMs, 8000);
  assert.equal(result.captureId, 'cap-9');
  assert.deepEqual(result.context, { venvanseTakenAt: null, sleepHours: 7, mood: 3, feeling: 3 });
});

test('buildRecallTestResult without a capture link falls back to duration 0 and no captureId', () => {
  const result = buildRecallTestResult({
    content: { topic: 'Leitura', text: 'Texto.' },
    questions: QUESTIONS,
    answers: [0],
    score: 0,
    lastCapture: null,
    context: null,
    now: 42,
  });
  assert.equal(result.readingDurationMs, 0);
  assert.equal(result.captureId, undefined);
  assert.equal(result.context, undefined);
});

test('recall retry persists the exact same immutable record', async () => {
  const record = buildRecallTestResult({
    content: { topic: 'Leitura', text: 'Texto.' },
    questions: QUESTIONS,
    answers: [0],
    score: 0,
    lastCapture: { captureId: 'cap-1', readingDurationMs: 1200 },
    context: null,
    now: 42,
  });
  const attempts: RecallTestResult[] = [];
  const save = async (candidate: RecallTestResult) => {
    attempts.push(candidate);
    if (attempts.length === 1) throw new Error('offline');
  };
  assert.equal(await persistRecallResult(record, save), 'failed');
  assert.equal(await persistRecallResult(record, save), 'saved');
  assert.equal(attempts[0], record);
  assert.equal(attempts[1], record);
});

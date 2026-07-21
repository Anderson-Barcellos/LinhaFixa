import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRecallQuestions,
  getRecallText,
  isValidRecallQuestions,
  shuffleQuestionOptions,
} from './recallService';
import { RecallQuestion } from '@/types';

const makeQuestion = (i: number): RecallQuestion => ({
  question: `Pergunta ${i}?`,
  options: ['A', 'B', 'C', 'D', 'E'],
  correctIndex: i % 5,
  rationale: 'Trecho do texto.',
});

const validPayload = { questions: Array.from({ length: 6 }, (_, i) => makeQuestion(i)) };
const originalFetch = globalThis.fetch;

test('recall requests preserve the exact backend payloads', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).includes('generateRecallText')) {
      return new Response(JSON.stringify({ topic: 'Tema', text: 'Texto realmente lido.' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(validPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await getRecallText();
    await getRecallQuestions('Texto realmente lido.');
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {});
    assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
      text: 'Texto realmente lido.',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('recall rejects a successful malformed question payload as invalid-payload', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ questions: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  try {
    await assert.rejects(
      () => getRecallQuestions('Texto.'),
      (error: unknown) => (
        typeof error === 'object'
        && error !== null
        && 'kind' in error
        && error.kind === 'invalid-payload'
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('isValidRecallQuestions accepts exactly 6 questions with 5 options each', () => {
  assert.equal(isValidRecallQuestions(validPayload), true);
});

test('isValidRecallQuestions rejects malformed payloads', () => {
  assert.equal(isValidRecallQuestions(null), false);
  assert.equal(isValidRecallQuestions({}), false);
  assert.equal(isValidRecallQuestions({ questions: validPayload.questions.slice(0, 5) }), false, 'menos de 6 questoes');
  assert.equal(
    isValidRecallQuestions({ questions: [...validPayload.questions.slice(0, 5), { ...makeQuestion(5), options: ['A', 'B', 'C', 'D'] }] }),
    false,
    '4 alternativas'
  );
  assert.equal(
    isValidRecallQuestions({ questions: [...validPayload.questions.slice(0, 5), { ...makeQuestion(5), correctIndex: 5 }] }),
    false,
    'correctIndex fora do range'
  );
  assert.equal(
    isValidRecallQuestions({ questions: [...validPayload.questions.slice(0, 5), { ...makeQuestion(5), question: '  ' }] }),
    false,
    'enunciado vazio'
  );
});

test('shuffleQuestionOptions remaps correctIndex to follow the correct option', () => {
  const questions = [{
    question: 'Qual a capital do RS?',
    options: ['Porto Alegre', 'Pelotas', 'Caxias', 'Santa Maria', 'Rio Grande'],
    correctIndex: 0,
    rationale: 'Texto.',
  }];
  // Deterministic "random": always returns 0 → rotation-like permutation.
  const shuffled = shuffleQuestionOptions(questions, () => 0);
  const q = shuffled[0];
  assert.equal(q.options.length, 5);
  assert.equal(q.options[q.correctIndex], 'Porto Alegre');
  assert.deepEqual([...q.options].sort(), [...questions[0].options].sort(), 'mesmo conjunto de alternativas');
});

test('shuffleQuestionOptions keeps the invariant under real randomness', () => {
  for (let round = 0; round < 20; round++) {
    const shuffled = shuffleQuestionOptions(validPayload.questions);
    shuffled.forEach((q, i) => {
      const original = validPayload.questions[i];
      assert.equal(q.options[q.correctIndex], original.options[original.correctIndex]);
    });
  }
});

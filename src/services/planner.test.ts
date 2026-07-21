import assert from 'node:assert/strict';
import test from 'node:test';
import type { PreTestContext, SessionResult, TreatmentPlanResponse, UserProfile } from '@/types';
import { generateTreatmentPlan } from './planner';

const originalFetch = globalThis.fetch;
const profile: UserProfile = {
  name: 'Anders',
  isAdult: true,
  fontSizePreference: 'normal',
  contrastPreference: 'light',
  cameraEnabled: true,
  viewingDistanceCm: 40,
};
const safeContext: PreTestContext = {
  venvanseTakenAt: '08:00',
  sleepHours: 7,
  mood: 3,
  feeling: 3,
};
const unsafeContext: PreTestContext = { ...safeContext, feeling: 1 };
const history: SessionResult[] = [];
const aiPlan: TreatmentPlanResponse = {
  sessionTitle: 'Plano IA',
  safetyStatus: { allowTraining: true, reason: 'Seguro' },
  exercises: [{
    exerciseId: 'fixation',
    durationSec: 20,
    difficulty: 1,
    parameters: {
      targetSizeMm: 12,
      speedDegPerSec: 0,
      amplitudeDeg: 0,
      lineSpacingMultiplier: 1,
      contrastMode: 'light',
      durationSec: 20,
    },
    rationalePtBR: 'Teste.',
    stopRules: ['Desconforto'],
  }],
  patientFeedbackPtBR: 'Tudo certo.',
  clinicianSummaryPtBR: 'Plano válido.',
};

test('AI plan keeps request payload exact and marks backend origin', async () => {
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => {
    capturedInit = init;
    return new Response(JSON.stringify({ plan: aiPlan }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const result = await generateTreatmentPlan(profile, safeContext, history);
    assert.equal(result.origin, 'ai');
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), { profile, context: safeContext, history });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('429 produces a provenance-rich local fallback', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': '120' },
  });
  try {
    const result = await generateTreatmentPlan(profile, safeContext, history);
    assert.equal(result.origin, 'local-fallback');
    assert.equal(result.fallbackFailure, 'rate-limited');
    assert.match(result.fallbackMessage ?? '', /2 min/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('offline fallback and deterministic safety block remain distinct', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  try {
    const fallback = await generateTreatmentPlan(profile, safeContext, history);
    assert.equal(fallback.origin, 'local-fallback');
    assert.equal(fallback.fallbackFailure, 'offline');
    const blocked = await generateTreatmentPlan(profile, unsafeContext, history);
    assert.equal(blocked.origin, 'safety-block');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

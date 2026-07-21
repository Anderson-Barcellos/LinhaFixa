import assert from 'node:assert/strict';
import test from 'node:test';
import { BackendRequestError } from './apiFailure';
import { requestGeneratedInsight } from './insightResponse';

const originalFetch = globalThis.fetch;

test('requests generated insight with the complete summary contract', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify({ text: 'Sua evolução está estável.' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const summary = { overview: { sessionCount: 2 }, comparableDiagnosticCaptures: [] };

  try {
    const text = await requestGeneratedInsight(summary);
    assert.equal(text, 'Sua evolução está estável.');
    assert.equal(
      new URL(capturedUrl, 'https://gaze.local').pathname.endsWith('/api/generateInsight'),
      true,
    );
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), { sessionSummary: summary });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('typed insight failures distinguish rate limiting and invalid payloads', async () => {
  globalThis.fetch = async () => new Response('{}', {
    status: 429,
    headers: { 'content-type': 'application/json' },
  });
  try {
    await assert.rejects(
      () => requestGeneratedInsight({}),
      (error: unknown) => error instanceof BackendRequestError && error.kind === 'rate-limited',
    );
    globalThis.fetch = async () => new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    await assert.rejects(
      () => requestGeneratedInsight({}),
      (error: unknown) => error instanceof BackendRequestError && error.kind === 'invalid-payload',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

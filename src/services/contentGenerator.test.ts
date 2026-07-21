import assert from 'node:assert/strict';
import test from 'node:test';
import { getReadingContent } from './contentGenerator';

const originalFetch = globalThis.fetch;

test('getReadingContent sends the exact generation contract and returns text', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify({ text: 'Texto novo gerado por IA.' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    assert.equal(await getReadingContent('dificil', 37), 'Texto novo gerado por IA.');
    assert.equal(new URL(capturedUrl, 'https://gaze.local').pathname.endsWith('/api/generateReadingContent'), true);
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      complexity: 'dificil',
      targetDurationSec: 37,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getReadingContent rejects instead of returning repeated fallback text when API fails', async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: 'OPENAI_API_KEY_MISSING' }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );

  try {
    await assert.rejects(
      () => getReadingContent('facil'),
      (error: unknown) => (
        typeof error === 'object'
        && error !== null
        && 'kind' in error
        && error.kind === 'configuration'
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

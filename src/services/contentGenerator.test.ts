import assert from 'node:assert/strict';
import test from 'node:test';
import { getReadingContent } from './contentGenerator';

const originalFetch = globalThis.fetch;

test('getReadingContent returns text from the API', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ text: 'Texto novo gerado por IA.' }),
  } as Response);

  try {
    assert.equal(await getReadingContent('facil'), 'Texto novo gerado por IA.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getReadingContent rejects instead of returning repeated fallback text when API fails', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: 'OPENAI_API_KEY_MISSING' }),
  } as Response);

  try {
    await assert.rejects(() => getReadingContent('facil'), /Não foi possível gerar o texto/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

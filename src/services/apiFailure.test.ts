import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BackendRequestError,
  backendFailureFromResponse,
  backendFailureMessage,
  networkBackendFailure,
} from './apiFailure';

test('classifies 429 and preserves Retry-After', async () => {
  const error = await backendFailureFromResponse(new Response(
    JSON.stringify({ error: 'RATE_LIMITED' }),
    {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '120' },
    },
  ));
  assert.equal(error.kind, 'rate-limited');
  assert.equal(error.retryAfterSec, 120);
  assert.match(backendFailureMessage(error), /2 min/);
});

test('distinguishes missing backend configuration from generic unavailability', async () => {
  const missing = await backendFailureFromResponse(new Response(
    JSON.stringify({ error: 'OPENAI_API_KEY_MISSING' }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  ));
  assert.equal(missing.kind, 'configuration');
  assert.equal(
    (await backendFailureFromResponse(new Response('', { status: 500 }))).kind,
    'unavailable',
  );
});

test('network failures and invalid payloads retain distinct recovery copy', () => {
  assert.equal(networkBackendFailure(new TypeError('fetch failed')).kind, 'offline');
  assert.match(
    backendFailureMessage(new BackendRequestError('invalid-payload')),
    /resposta inválida/i,
  );
});

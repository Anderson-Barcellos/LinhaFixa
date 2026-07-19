import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretInsightResponse } from './insightResponse';

test('returns the generated text on a successful response', () => {
  const out = interpretInsightResponse(200, { text: 'Sua evolução está estável.' });
  assert.equal(out, 'Sua evolução está estável.');
});

test('maps 429 to the rate-limit message regardless of body', () => {
  const out = interpretInsightResponse(429, { error: 'RATE_LIMITED' });
  assert.match(out, /aguarde/i);
});

test('falls back to the generic failure message on non-ok status', () => {
  const out = interpretInsightResponse(503, { error: 'IA indisponível' });
  assert.match(out, /não foi possível/i);
});

test('falls back when the body has no usable text', () => {
  assert.match(interpretInsightResponse(200, {}), /não foi possível/i);
  assert.match(interpretInsightResponse(200, null), /não foi possível/i);
  assert.match(interpretInsightResponse(200, { text: 42 }), /não foi possível/i);
  assert.match(interpretInsightResponse(200, { text: '   ' }), /não foi possível/i);
});

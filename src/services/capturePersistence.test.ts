import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssessedValidationCapture } from '@/types';
import { persistValidationCapture } from './capturePersistence';

const capture = {
  id: 'capture-stable-id',
  timestamp: 1_750_000_000_000,
  durationMs: 20_500,
  validity: {
    contractVersion: 1,
    assessedAt: 1_750_000_020_500,
    grade: 'comparable',
    reasonCodes: [],
    durationMs: 20_500,
    coverage: 96,
    signalSource: 'calibrated-mediapipe',
    selectedSourceRatio: 0.98,
    sampleRateHz: 50,
    temporalTier: 'high-temporal',
    gapCount: 0,
    interruption: null,
  },
} as unknown as AssessedValidationCapture;

test('persistValidationCapture retains the exact immutable capture on failure and retry', async () => {
  const attempts: AssessedValidationCapture[] = [];
  let attempt = 0;
  const save = async (candidate: AssessedValidationCapture) => {
    attempts.push(candidate);
    attempt += 1;
    if (attempt === 1) throw new Error('IndexedDB temporarily unavailable');
  };

  const failed = await persistValidationCapture(capture, save);
  const saved = await persistValidationCapture(failed.capture, save);

  assert.equal(failed.persistence, 'failed');
  assert.equal(saved.persistence, 'saved');
  assert.strictEqual(failed.capture, capture);
  assert.strictEqual(saved.capture, capture);
  assert.strictEqual(attempts[0], capture);
  assert.strictEqual(attempts[1], capture);
  assert.equal(saved.capture.id, 'capture-stable-id');
  assert.equal(saved.capture.timestamp, 1_750_000_000_000);
  assert.strictEqual(saved.capture.validity, capture.validity);
});

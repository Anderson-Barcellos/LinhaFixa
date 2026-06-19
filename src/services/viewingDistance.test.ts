import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampViewingDistanceCm, normalizeViewingDistanceInput } from './viewingDistance';

test('normalizeViewingDistanceInput lets the user type partial values without forcing 40', () => {
  assert.equal(normalizeViewingDistanceInput(''), '');
  assert.equal(normalizeViewingDistanceInput('4'), '4');
  assert.equal(normalizeViewingDistanceInput('40'), '40');
  assert.equal(normalizeViewingDistanceInput(' 045cm '), '045');
});

test('clampViewingDistanceCm applies safe defaults only on commit', () => {
  assert.equal(clampViewingDistanceCm(''), 40);
  assert.equal(clampViewingDistanceCm('4'), 20);
  assert.equal(clampViewingDistanceCm('40'), 40);
  assert.equal(clampViewingDistanceCm('200'), 120);
  assert.equal(clampViewingDistanceCm('abc'), 40);
});

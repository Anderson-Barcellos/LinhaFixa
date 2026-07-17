import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAssessmentWorkspaceSnapshot,
  mapLegacyRoute,
} from './assessmentAdapter';

test('mapLegacyRoute keeps the old diagnostics entrypoint compatible', () => {
  assert.equal(mapLegacyRoute('/eye-tracking-test'), '/assessment');
  assert.equal(mapLegacyRoute('/dashboard'), null);
});

test('buildAssessmentWorkspaceSnapshot exposes stable shell-facing labels', () => {
  const snapshot = buildAssessmentWorkspaceSnapshot({
    mode: 'recall',
    stage: 'text-ready',
    blockReason: null,
    captureCount: 3,
    latestSessionLabel: 'Ultima captura ha 2 horas',
    recallOutcome: null,
  });

  assert.deepEqual(snapshot.primaryAction, {
    label: 'Ler e responder',
    disabled: false,
  });
  assert.equal(snapshot.savedCapturesLabel, 'Capturas salvas (3)');
  assert.equal(snapshot.latestSessionLabel, 'Ultima captura ha 2 horas');
});

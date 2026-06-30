import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeFunctionalVisualSignal, type VisualSignalSample } from './visualSignal';

test('summarizeFunctionalVisualSignal reports no useful capture with sparse samples', () => {
  const summary = summarizeFunctionalVisualSignal([{ t: 0, h: 0.5, v: 0.5 }]);

  assert.equal(summary.status, 'sem-sinal');
  assert.equal(summary.label, 'Sem sinal útil');
  assert.equal(summary.sensitivityScore, 0);
  assert.equal(summary.lineReturnCandidate, false);
});

test('summarizeFunctionalVisualSignal recognizes useful horizontal reading movement', () => {
  const samples: VisualSignalSample[] = [
    { t: 0, h: 0.18, v: 0.48, calibrated: true },
    { t: 120, h: 0.19, v: 0.48, calibrated: true },
    { t: 240, h: 0.40, v: 0.49, calibrated: true },
    { t: 360, h: 0.41, v: 0.49, calibrated: true },
    { t: 480, h: 0.68, v: 0.50, calibrated: true },
    { t: 600, h: 0.69, v: 0.50, calibrated: true },
  ];

  const summary = summarizeFunctionalVisualSignal(samples, { coverage: 92 });

  assert.equal(summary.status, 'adequado');
  assert.equal(summary.label, 'Captação útil');
  assert.equal(summary.sourceLabel, 'Calibrado');
  assert.ok(summary.horizontalRange >= 0.5);
  assert.ok(summary.fixationShare >= 30);
  assert.ok(summary.sensitivityScore >= 70);
  assert.equal(summary.lineReturnCandidate, false);
});

test('summarizeFunctionalVisualSignal separates broad line return from short regression', () => {
  const samples: VisualSignalSample[] = [
    { t: 0, h: 0.22, v: 0.42, calibrated: true },
    { t: 100, h: 0.55, v: 0.42, calibrated: true },
    { t: 200, h: 0.86, v: 0.43, calibrated: true },
    { t: 300, h: 0.18, v: 0.61, calibrated: true },
    { t: 400, h: 0.34, v: 0.61, calibrated: true },
  ];

  const summary = summarizeFunctionalVisualSignal(samples, { coverage: 88 });

  assert.equal(summary.lineReturnCandidate, true);
  assert.match(summary.eventLabel, /retorno de linha/i);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSaccades } from './saccadeAnalysis';
import { GazeSample } from '@/types';

test('analyzeSaccades counts rightward sacades and leftward regressions from gaze samples', () => {
  const samples: GazeSample[] = [
    { t: 0, h: 0.20, v: 0.5 },
    { t: 40, h: 0.21, v: 0.5 },
    { t: 50, h: 0.42, v: 0.5 },
    { t: 90, h: 0.43, v: 0.5 },
    { t: 100, h: 0.30, v: 0.5 },
    { t: 140, h: 0.31, v: 0.5 },
  ];

  const metrics = analyzeSaccades(samples, { signalSource: 'calibrated-mediapipe' });

  assert.equal(metrics.trackingAvailable, true);
  assert.equal(metrics.signalSource, 'calibrated-mediapipe');
  assert.equal(metrics.saccadeCount, 2);
  assert.equal(metrics.regressionCount, 1);
  assert.equal(metrics.samplesValid, 6);
  assert.equal(metrics.sampleRateHz, 36);
  assert.equal(Math.round(metrics.meanFixationMs), 40);
});

test('analyzeSaccades marks unavailable signal when there are too few calibrated samples', () => {
  const metrics = analyzeSaccades([{ t: 0, h: 0.2, v: 0.5 }], { signalSource: 'unavailable' });

  assert.equal(metrics.trackingAvailable, false);
  assert.equal(metrics.signalSource, 'unavailable');
  assert.equal(metrics.sampleRateHz, 0);
});

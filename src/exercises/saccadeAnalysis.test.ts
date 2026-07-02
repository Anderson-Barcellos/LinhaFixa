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
  assert.equal(metrics.lineReturnCount, 0);
  assert.equal(metrics.samplesValid, 6);
  assert.equal(metrics.sampleRateHz, 36);
  assert.equal(Math.round(metrics.meanFixationMs), 40);
});

test('analyzeSaccades marks unavailable signal when there are too few calibrated samples', () => {
  const metrics = analyzeSaccades([{ t: 0, h: 0.2, v: 0.5 }], { signalSource: 'unavailable' });

  assert.equal(metrics.trackingAvailable, false);
  assert.equal(metrics.signalSource, 'unavailable');
  assert.equal(metrics.lineReturnCount, 0);
  assert.equal(metrics.sampleRateHz, 0);
});

test('analyzeSaccades separates large leftward line-return sweeps from regressions', () => {
  const samples: GazeSample[] = [
    { t: 0, h: 0.10, v: 0.5 },
    { t: 20, h: 0.10, v: 0.5 },
    { t: 40, h: 0.50, v: 0.5 },  // progressive saccade (+0.40)
    { t: 60, h: 0.50, v: 0.5 },
    { t: 80, h: 0.50, v: 0.5 },
    { t: 100, h: 0.10, v: 0.6 }, // line-return sweep (-0.40)
    { t: 120, h: 0.10, v: 0.6 },
    { t: 140, h: 0.10, v: 0.6 },
  ];

  const metrics = analyzeSaccades(samples);

  assert.equal(metrics.saccadeCount, 1);
  assert.equal(metrics.regressionCount, 0);
  assert.equal(metrics.lineReturnCount, 1);
  assert.equal(Math.round(metrics.meanSaccadeAmplitude * 100) / 100, 0.4);
});

test('analyzeSaccades keeps small leftward saccades as regressions', () => {
  const samples: GazeSample[] = [
    { t: 0, h: 0.30, v: 0.5 },
    { t: 20, h: 0.30, v: 0.5 },
    { t: 40, h: 0.20, v: 0.5 }, // small leftward saccade (-0.10): true regression
    { t: 60, h: 0.20, v: 0.5 },
    { t: 80, h: 0.20, v: 0.5 },
  ];

  const metrics = analyzeSaccades(samples);

  assert.equal(metrics.saccadeCount, 1);
  assert.equal(metrics.regressionCount, 1);
  assert.equal(metrics.lineReturnCount, 0);
});

test('analyzeSaccades suppresses an isolated single-frame landmark spike', () => {
  const samples: GazeSample[] = [
    { t: 0, h: 0.20, v: 0.5 },
    { t: 20, h: 0.20, v: 0.5 },
    { t: 40, h: 0.60, v: 0.5 }, // one-frame spike, not a real saccade
    { t: 60, h: 0.20, v: 0.5 },
    { t: 80, h: 0.20, v: 0.5 },
    { t: 100, h: 0.20, v: 0.5 },
  ];

  const metrics = analyzeSaccades(samples);

  assert.equal(metrics.saccadeCount, 0);
  assert.equal(metrics.regressionCount, 0);
  assert.equal(metrics.lineReturnCount, 0);
});

test('analyzeSaccades discards fixation intervals that contain a tracking gap', () => {
  const samples: GazeSample[] = [
    { t: 0, h: 0.10, v: 0.5 },
    { t: 20, h: 0.10, v: 0.5 },
    { t: 40, h: 0.50, v: 0.5 },  // saccade 1; preceding fixation = 20ms (kept)
    { t: 60, h: 0.50, v: 0.5 },
    { t: 80, h: 0.50, v: 0.5 },
    { t: 400, h: 0.50, v: 0.5 }, // 320ms tracking gap inside the fixation
    { t: 420, h: 0.50, v: 0.5 },
    { t: 440, h: 0.10, v: 0.6 }, // saccade 2; preceding fixation contains the gap (dropped)
    { t: 460, h: 0.10, v: 0.6 },
    { t: 480, h: 0.10, v: 0.6 },
  ];

  const metrics = analyzeSaccades(samples);

  assert.equal(Math.round(metrics.meanFixationMs), 20);
  assert.equal(metrics.saccadeCount, 1);
  assert.equal(metrics.lineReturnCount, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSaccades } from './saccadeAnalysis';
import { GazeSample } from '@/types';
import { classifyTemporalTier } from '@/services/captureValidity';

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
  assert.ok(metrics.meanFixationMs !== null);
  assert.equal(Math.round(metrics.meanFixationMs), 40);
});

test('analyzeSaccades marks unavailable signal when there are too few calibrated samples', () => {
  const metrics = analyzeSaccades([{ t: 0, h: 0.2, v: 0.5 }], { signalSource: 'unavailable' });

  assert.equal(metrics.trackingAvailable, false);
  assert.equal(metrics.signalSource, 'unavailable');
  assert.equal(metrics.lineReturnCount, 0);
  assert.equal(metrics.sampleRateHz, 0);
  assert.equal(metrics.saccadeCount, 0);
  assert.equal(metrics.regressionCount, 0);
  assert.equal(metrics.meanSaccadeAmplitude, null);
  assert.equal(metrics.meanFixationMs, null);
});

test('analyzeSaccades keeps real zero counts but nulls estimates when no event is detected', () => {
  const samples: GazeSample[] = Array.from({ length: 8 }, (_, index) => ({
    t: index * 20,
    h: 0.4,
    v: 0.5,
  }));

  const metrics = analyzeSaccades(samples);

  assert.equal(metrics.trackingAvailable, true);
  assert.equal(metrics.saccadeCount, 0);
  assert.equal(metrics.regressionCount, 0);
  assert.equal(metrics.lineReturnCount, 0);
  assert.equal(metrics.meanSaccadeAmplitude, null);
  assert.equal(metrics.meanFixationMs, null);
});

test('golden plateau trace pins event detection to the measured temporal tier', () => {
  const cases = [
    { rateHz: 60, expectedEvents: 1, expectedTier: 'high-temporal' },
    { rateHz: 50, expectedEvents: 1, expectedTier: 'high-temporal' },
    { rateHz: 30, expectedEvents: 0, expectedTier: 'coarse-temporal' },
    { rateHz: 24, expectedEvents: 0, expectedTier: 'coarse-temporal' },
  ] as const;

  for (const { rateHz, expectedEvents, expectedTier } of cases) {
    const dt = 1000 / rateHz;
    const samples: GazeSample[] = Array.from({ length: 6 }, (_, index) => ({
      t: index * dt,
      h: index < 3 ? 0.4 : 0.46,
      v: 0.5,
    }));

    const metrics = analyzeSaccades(samples, { collectEvents: true });

    assert.equal(metrics.events?.length, expectedEvents, `${rateHz} Hz event count`);
    assert.equal(metrics.saccadeCount, expectedEvents, `${rateHz} Hz aggregate count`);
    assert.equal(classifyTemporalTier(metrics.sampleRateHz), expectedTier, `${rateHz} Hz tier`);
  }
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
  assert.ok(metrics.meanSaccadeAmplitude !== null);
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

test('analyzeSaccades adapts the line-return threshold to compressed signals', () => {
  // Raw iris-ratio series: the whole line spans a fraction of the calibrated
  // range, so a real line-return sweep (-0.24) sits below the fixed 0.35 cap.
  // Relative to the reading saccades (~0.06) it is clearly a sweep, not a
  // re-reading regression.
  const plateau = (t0: number, h: number): GazeSample[] => [
    { t: t0, h, v: 0.5 },
    { t: t0 + 20, h, v: 0.5 },
    { t: t0 + 40, h, v: 0.5 },
  ];
  const samples: GazeSample[] = [
    ...plateau(0, 0.40),
    ...plateau(60, 0.46),   // +0.06 progressive
    ...plateau(120, 0.52),  // +0.06 progressive
    ...plateau(180, 0.46),  // -0.06 true regression (re-reading)
    ...plateau(240, 0.52),  // +0.06 progressive
    ...plateau(300, 0.28),  // -0.24 line-return sweep (below the 0.35 cap)
  ];

  const metrics = analyzeSaccades(samples);

  assert.equal(metrics.saccadeCount, 4);
  assert.equal(metrics.regressionCount, 1);
  assert.equal(metrics.lineReturnCount, 1);
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

  assert.ok(metrics.meanFixationMs !== null);
  assert.equal(Math.round(metrics.meanFixationMs), 20);
  assert.equal(metrics.saccadeCount, 1);
  assert.equal(metrics.lineReturnCount, 1);
});

test('analyzeSaccades omits events by default and keeps aggregates identical with collectEvents', () => {
  const samples: GazeSample[] = [
    { t: 0, h: 0.20, v: 0.5 },
    { t: 40, h: 0.21, v: 0.5 },
    { t: 50, h: 0.42, v: 0.5 },
    { t: 90, h: 0.43, v: 0.5 },
    { t: 100, h: 0.30, v: 0.5 },
    { t: 140, h: 0.31, v: 0.5 },
  ];

  const plain = analyzeSaccades(samples, { signalSource: 'calibrated-mediapipe' });
  const withEvents = analyzeSaccades(samples, { signalSource: 'calibrated-mediapipe', collectEvents: true });

  assert.equal('events' in plain, false);
  const { events, ...aggregates } = withEvents;
  assert.deepEqual(aggregates, plain);
  assert.ok(events);
  assert.equal(events.length, plain.saccadeCount + (plain.lineReturnCount ?? 0));
  assert.equal(events.filter(e => e.kind === 'regression').length, plain.regressionCount);
});

test('analyzeSaccades events carry timestamps and signed amplitudes per bucket', () => {
  const samples: GazeSample[] = [
    { t: 0, h: 0.10, v: 0.5 },
    { t: 20, h: 0.10, v: 0.5 },
    { t: 40, h: 0.50, v: 0.5 },  // rightward saccade: 0.10 -> 0.50
    { t: 60, h: 0.50, v: 0.5 },
    { t: 80, h: 0.50, v: 0.5 },
    { t: 100, h: 0.10, v: 0.6 }, // leftward sweep of 0.40 -> line return
    { t: 120, h: 0.10, v: 0.6 },
    { t: 140, h: 0.10, v: 0.6 },
  ];

  const metrics = analyzeSaccades(samples, { collectEvents: true });

  assert.ok(metrics.events);
  assert.equal(metrics.events.length, 2);
  const [saccade, lineReturn] = metrics.events;
  assert.equal(saccade.kind, 'saccade');
  assert.equal(saccade.tStart, 20);
  assert.equal(saccade.tEnd, 60);
  assert.ok(saccade.amplitude > 0);
  assert.equal(lineReturn.kind, 'line-return');
  assert.equal(lineReturn.tStart, 80);
  assert.equal(lineReturn.tEnd, 120);
  assert.ok(lineReturn.amplitude <= -0.35);
});

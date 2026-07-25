import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSaccades } from './saccadeAnalysis';
import { GazeSample } from '@/types';
import { classifyTemporalTier } from '@/services/captureValidity';

// Reading fixations last 200-300ms; below ~100ms the eye is passing through, not
// resting. These traces use 240ms plateaus separated by a one-sample transition,
// so they represent an eye a webcam could actually have recorded. (The previous
// traces used 20-40ms plateaus, which only made sense for the old velocity
// detector — it closed a "fixation" from two samples and had no minimum duration.)

const PLATEAU_MS = 240;
const STEP_MS = 20; // 50Hz, so every timestamp stays a round number
const PLATEAU_SPACING_MS = 260; // plateau + one transition sample

function plateau(t0: number, h: number, v = 0.5, durationMs = PLATEAU_MS): GazeSample[] {
  const out: GazeSample[] = [];
  for (let t = 0; t <= durationMs; t += STEP_MS) out.push({ t: t0 + t, h, v });
  return out;
}

// A sequence of plateaus on a strictly uniform sampling grid, for the invariance
// checks. Timestamps advance by exactly dt throughout, so the measured sample
// rate equals the nominal one and the transition between levels occupies exactly
// one sampling interval — as a real sub-frame saccade does.
function trace(rateHz: number, levels: Array<{ h: number; v?: number }>, durationMs = PLATEAU_MS): GazeSample[] {
  const dt = 1000 / rateHz;
  const samplesPerLevel = Math.floor(durationMs / dt) + 1;
  const out: GazeSample[] = [];
  let index = 0;
  for (const level of levels) {
    for (let k = 0; k < samplesPerLevel; k++) {
      // Timestamps are index * dt, never an accumulated sum: accumulation drifts
      // by float error and would push a nominal 24Hz trace to 23.9999Hz, which
      // silently crosses a validity tier boundary.
      out.push({ t: index * dt, h: level.h, v: level.v ?? 0.5 });
      index++;
    }
  }
  return out;
}

test('analyzeSaccades counts rightward sacades and leftward regressions from gaze samples', () => {
  const samples: GazeSample[] = [
    ...plateau(0, 0.20),
    ...plateau(PLATEAU_SPACING_MS, 0.42),      // +0.22 progressive
    ...plateau(PLATEAU_SPACING_MS * 2, 0.30),  // -0.12 regression
  ];

  const metrics = analyzeSaccades(samples, { signalSource: 'calibrated-mediapipe' });

  assert.equal(metrics.trackingAvailable, true);
  assert.equal(metrics.signalSource, 'calibrated-mediapipe');
  assert.equal(metrics.saccadeCount, 2);
  assert.equal(metrics.regressionCount, 1);
  assert.equal(metrics.lineReturnCount, 0);
  assert.ok(metrics.meanFixationMs !== null);
  assert.equal(Math.round(metrics.meanFixationMs), PLATEAU_MS);
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

test('a steady gaze is one real fixation with no saccade to estimate', () => {
  // The eye resting in place IS a fixation. Under the old velocity model this
  // reported no fixation at all, because a fixation was merely the hole between
  // two detected saccades.
  const metrics = analyzeSaccades(plateau(0, 0.4));

  assert.equal(metrics.trackingAvailable, true);
  assert.equal(metrics.saccadeCount, 0);
  assert.equal(metrics.regressionCount, 0);
  assert.equal(metrics.lineReturnCount, 0);
  assert.equal(metrics.meanSaccadeAmplitude, null);
  assert.ok(metrics.meanFixationMs !== null);
  assert.equal(Math.round(metrics.meanFixationMs), PLATEAU_MS);
});

test('analyzeSaccades nulls both estimates when the eye never rests', () => {
  // Continuous drift across the screen: no plateau ever forms, so there is
  // neither a fixation nor a saccade to report — and the counts stay honestly 0.
  const samples: GazeSample[] = Array.from({ length: 40 }, (_, index) => ({
    t: index * STEP_MS,
    h: index * 0.02,
    v: 0.5,
  }));

  const metrics = analyzeSaccades(samples);

  assert.equal(metrics.saccadeCount, 0);
  assert.equal(metrics.regressionCount, 0);
  assert.equal(metrics.lineReturnCount, 0);
  assert.equal(metrics.meanSaccadeAmplitude, null);
  assert.equal(metrics.meanFixationMs, null);
});

test('the same eye movement is detected identically at 24, 30, 50 and 60 Hz', () => {
  // This test used to assert the opposite: that a 0.06 step was seen at 60/50Hz
  // and invisible at 30/24Hz, pinning detection to the temporal tier. That was
  // the velocity detector's dt-dependence, and it silently broke comparability
  // whenever the negotiated frame rate changed. Detection must now be a property
  // of the eye, not of the camera. The measured tier still varies — that is a
  // fact about the recording, and it stays reported.
  const cases = [
    { rateHz: 60, expectedTier: 'high-temporal' },
    { rateHz: 50, expectedTier: 'high-temporal' },
    { rateHz: 30, expectedTier: 'coarse-temporal' },
    { rateHz: 24, expectedTier: 'coarse-temporal' },
  ] as const;

  for (const { rateHz, expectedTier } of cases) {
    const metrics = analyzeSaccades(trace(rateHz, [{ h: 0.40 }, { h: 0.46 }]), { collectEvents: true });

    assert.equal(metrics.events?.length, 1, `${rateHz} Hz event count`);
    assert.equal(metrics.saccadeCount, 1, `${rateHz} Hz aggregate count`);
    assert.equal(metrics.regressionCount, 0, `${rateHz} Hz regressions`);
    assert.equal(classifyTemporalTier(metrics.sampleRateHz), expectedTier, `${rateHz} Hz tier`);
  }
});

test('amplitude and fixation duration agree across sampling rates', () => {
  // The stronger form of the same property: not just "an event was found", but
  // the measured quantities match. This is what makes a personal baseline
  // survive a camera or machine change.
  const measure = (rateHz: number) =>
    analyzeSaccades(trace(rateHz, [{ h: 0.20 }, { h: 0.45 }, { h: 0.70 }]));

  const at30 = measure(30);
  const at60 = measure(60);

  assert.equal(at30.saccadeCount, at60.saccadeCount);
  assert.ok(at30.meanSaccadeAmplitude !== null && at60.meanSaccadeAmplitude !== null);
  assert.ok(
    Math.abs(at30.meanSaccadeAmplitude - at60.meanSaccadeAmplitude) < 0.01,
    `amplitude divergiu: ${at30.meanSaccadeAmplitude} vs ${at60.meanSaccadeAmplitude}`,
  );
  assert.ok(at30.meanFixationMs !== null && at60.meanFixationMs !== null);
  assert.ok(
    Math.abs(at30.meanFixationMs - at60.meanFixationMs) < 50,
    `fixação divergiu: ${at30.meanFixationMs} vs ${at60.meanFixationMs}`,
  );
});

test('analyzeSaccades preserves fractional rates across validity boundaries', () => {
  for (const rateHz of [23.5, 23.99, 44.5, 44.99, 24, 45]) {
    const metrics = analyzeSaccades(trace(rateHz, [{ h: 0.40 }, { h: 0.46 }]));
    assert.ok((metrics.sampleRateHz ?? 0) > 0, `${rateHz} Hz rate present`);
    assert.equal(
      classifyTemporalTier(metrics.sampleRateHz),
      rateHz < 24 ? 'insufficient-temporal' : rateHz < 45 ? 'coarse-temporal' : 'high-temporal',
    );
  }
});

test('analyzeSaccades separates large leftward line-return sweeps from regressions', () => {
  const samples: GazeSample[] = [
    ...plateau(0, 0.10),
    ...plateau(PLATEAU_SPACING_MS, 0.50),             // progressive saccade (+0.40)
    ...plateau(PLATEAU_SPACING_MS * 2, 0.10, 0.6),    // line-return sweep (-0.40)
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
    ...plateau(0, 0.30),
    ...plateau(PLATEAU_SPACING_MS, 0.20), // small leftward saccade (-0.10): true regression
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
  const samples: GazeSample[] = [
    ...plateau(0, 0.40),
    ...plateau(PLATEAU_SPACING_MS, 0.46),     // +0.06 progressive
    ...plateau(PLATEAU_SPACING_MS * 2, 0.52), // +0.06 progressive
    ...plateau(PLATEAU_SPACING_MS * 3, 0.46), // -0.06 true regression (re-reading)
    ...plateau(PLATEAU_SPACING_MS * 4, 0.52), // +0.06 progressive
    ...plateau(PLATEAU_SPACING_MS * 5, 0.28), // -0.24 line-return sweep (below the 0.35 cap)
  ];

  const metrics = analyzeSaccades(samples);

  assert.equal(metrics.saccadeCount, 4);
  assert.equal(metrics.regressionCount, 1);
  assert.equal(metrics.lineReturnCount, 1);
});

test('analyzeSaccades suppresses an isolated single-frame landmark spike', () => {
  const samples = plateau(0, 0.20);
  const mid = Math.floor(samples.length / 2);
  samples[mid] = { ...samples[mid], h: 0.60 }; // one-frame spike, not a real saccade

  const metrics = analyzeSaccades(samples);

  assert.equal(metrics.saccadeCount, 0);
  assert.equal(metrics.regressionCount, 0);
  assert.equal(metrics.lineReturnCount, 0);
  // The spike is filtered out, so the plateau survives as a single fixation.
  assert.ok(metrics.meanFixationMs !== null);
});

test('a tracking gap cuts the fixation instead of being spanned', () => {
  // Two rests at the same place separated by a 320ms dropout. The eye could have
  // gone anywhere inside the hole, so this must read as two fixations of 240ms —
  // not one uninterrupted fixation of 800ms — and the dropout must not fabricate
  // a saccade.
  const samples: GazeSample[] = [
    ...plateau(0, 0.50),
    ...plateau(PLATEAU_MS + 320, 0.50),
  ];

  const metrics = analyzeSaccades(samples);

  assert.equal(metrics.saccadeCount, 0);
  assert.equal(metrics.lineReturnCount, 0);
  assert.ok(metrics.meanFixationMs !== null);
  assert.equal(Math.round(metrics.meanFixationMs), PLATEAU_MS);
});

test('analyzeSaccades omits events by default and keeps aggregates identical with collectEvents', () => {
  const samples: GazeSample[] = [
    ...plateau(0, 0.20),
    ...plateau(PLATEAU_SPACING_MS, 0.42),
    ...plateau(PLATEAU_SPACING_MS * 2, 0.30),
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
    ...plateau(0, 0.10),                           // fixation 1: 0 -> 240
    ...plateau(PLATEAU_SPACING_MS, 0.50),          // fixation 2: 260 -> 500
    ...plateau(PLATEAU_SPACING_MS * 2, 0.10, 0.6), // fixation 3: 520 -> 760
  ];

  const metrics = analyzeSaccades(samples, { collectEvents: true });

  assert.ok(metrics.events);
  assert.equal(metrics.events.length, 2);
  const [saccade, lineReturn] = metrics.events;
  // Each event spans the interval between the fixations it connects.
  assert.equal(saccade.kind, 'saccade');
  assert.equal(saccade.tStart, PLATEAU_MS);
  assert.equal(saccade.tEnd, PLATEAU_SPACING_MS);
  assert.ok(saccade.amplitude > 0);
  assert.equal(lineReturn.kind, 'line-return');
  assert.equal(lineReturn.tStart, PLATEAU_SPACING_MS + PLATEAU_MS);
  assert.equal(lineReturn.tEnd, PLATEAU_SPACING_MS * 2);
  assert.ok(lineReturn.amplitude <= -0.35);
});

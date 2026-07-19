import assert from 'node:assert/strict';
import test from 'node:test';
import { assistedReadingExercise } from './assistedReading';

function makeContext(overrides: Record<string, unknown> = {}) {
  let finished: any = null;
  const context = {
    ctx: {} as CanvasRenderingContext2D,
    width: 1000,
    height: 600,
    timeMs: 0,
    dt: 0,
    state: {
      loading: false,
      setupDone: true,
      chunks: [{ text: 'texto', x: 0, y: 0, width: 100, height: 20 }],
      currentIndex: 0,
      intervals: [],
      calibratedGazeSamples: [],
      rawGazeSamples: [],
      lastTapTime: 0,
      fontPx: 32,
      contentReady: true,
    },
    parameters: {
      targetSizeMm: 10,
      speedDegPerSec: 1,
      amplitudeDeg: 12,
      lineSpacingMultiplier: 1.4,
      contrastMode: 'light',
      durationSec: 120,
      textComplexity: 'facil',
    },
    onEvent: () => {},
    cmToPx: (cm: number) => cm * 37.8,
    degToPx: (deg: number) => deg * 40,
    viewingDistanceCm: 40,
    latestGaze: { t: 0, h: 0.25, v: 0.5 },
    latestGazePoint: null,
    isGazeCalibrated: false,
    fontSizePreference: 'normal',
    finishExercise: (extraData?: any) => {
      finished = extraData;
    },
    ...overrides,
  } as any;
  return { context, getFinished: () => finished };
}

test('assisted reading sizes the font by visual angle via degToPx, matching the diagnostics screen', () => {
  const { context } = makeContext({ degToPx: (deg: number) => deg * 50, fontSizePreference: 'normal' });
  context.state = {};

  assistedReadingExercise.init(context);

  // 'normal' preference = 1.2 degrees of visual angle (viewingGeometry.READING_ANGLE_DEG),
  // 1.2 * 50 = 60px, capped at the 56px readability ceiling.
  assert.equal(context.state.fontPx, 56);
});

test('assisted reading clamps the font to 56px even with a huge profile distance', () => {
  const { context } = makeContext({ degToPx: (deg: number) => deg * 100, fontSizePreference: 'huge' });
  context.state = {};

  assistedReadingExercise.init(context);

  assert.equal(context.state.fontPx, 56);
});

test('assisted reading clamps the font to at least 18px', () => {
  const { context } = makeContext({ degToPx: (deg: number) => deg * 10, fontSizePreference: 'small' });
  context.state = {};

  assistedReadingExercise.init(context);

  assert.equal(context.state.fontPx, 18);
});

test('forced-raw assisted reading produces raw MediaPipe metrics', () => {
  const { context, getFinished } = makeContext();

  for (let index = 0; index < 5; index++) {
    context.timeMs = index * 40;
    context.latestGaze = { t: context.timeMs, h: 0.2 + index * 0.1, v: 0.5 };
    assistedReadingExercise.update(context);
  }
  // Past the minimum reading window, so the final tap is allowed to finish.
  context.timeMs = 100_000;
  assistedReadingExercise.onInput(0, 0, context);

  const finished = getFinished();
  assert.equal(context.state.calibratedGazeSamples.length, 0);
  assert.equal(context.state.rawGazeSamples.length, 5);
  assert.equal(finished.saccadeMetrics.trackingAvailable, true);
  assert.equal(finished.saccadeMetrics.signalSource, 'raw-mediapipe');
  assert.equal(finished.calibratedSampleCount, 0);
  assert.equal(finished.rawSampleCount, 5);
});

test('assisted reading samples calibrated MediaPipe gaze for reading saccades', () => {
  const { context } = makeContext({
    latestGazePoint: { x: 250, y: 300 },
    isGazeCalibrated: true,
  });

  assistedReadingExercise.update(context);

  assert.deepEqual(context.state.calibratedGazeSamples, [{ t: 0, h: 0.25, v: 0.5 }]);
  assert.deepEqual(context.state.rawGazeSamples, []);
});

test('assisted reading does not sample gaze while generated text is still loading', () => {
  const { context } = makeContext({
    latestGazePoint: { x: 250, y: 300 },
    isGazeCalibrated: true,
  });
  context.state.loading = true;

  assistedReadingExercise.update(context);

  assert.deepEqual(context.state.calibratedGazeSamples, []);
  assert.deepEqual(context.state.rawGazeSamples, []);
});

test('assisted reading timeout before AI text loads returns an invalid incomplete result', () => {
  const { context } = makeContext();
  context.state.loading = true;
  context.state.contentReady = false;
  context.state.calibratedGazeSamples = [
    { t: 0, h: 0.2, v: 0.5 },
    { t: 40, h: 0.8, v: 0.5 },
  ];

  const result = assistedReadingExercise.getResultData?.(context);

  assert.equal(result?.score, 0);
  assert.equal(result?.invalidReason, 'reading-content-unavailable');
  assert.equal(result?.textLoaded, false);
  assert.equal(result?.saccadeMetrics.trackingAvailable, false);
  assert.equal('intervals' in result!, false);
});

test('assisted reading returns ocular metrics when the exercise times out', () => {
  const { context } = makeContext();
  context.state.calibratedGazeSamples = [
    { t: 0, h: 0.2, v: 0.5 },
    { t: 40, h: 0.21, v: 0.5 },
    { t: 80, h: 0.5, v: 0.5 },
    { t: 120, h: 0.52, v: 0.5 },
    { t: 160, h: 0.8, v: 0.5 },
    { t: 200, h: 0.82, v: 0.5 },
  ];

  const result = assistedReadingExercise.getResultData?.(context);

  assert.equal(result?.saccadeMetrics.trackingAvailable, true);
  assert.equal(result?.saccadeMetrics.signalSource, 'calibrated-mediapipe');
  assert.deepEqual(result?.intervals, []);
  assert.equal(result?.textComplexity, 'facil');
  assert.equal(result?.calibratedSampleCount, 6);
  assert.equal(result?.rawSampleCount, 0);
});

test('finishing the chunks before 70% of the duration restarts the loop instead of ending', () => {
  const { context, getFinished } = makeContext();
  context.timeMs = 1000; // durationSec=120 → minimum window is 84s

  assistedReadingExercise.onInput(0, 0, context);

  assert.equal(getFinished(), null);
  assert.equal(context.state.currentIndex, 0);
});

test('finishing the chunks after 70% of the duration ends the exercise', () => {
  const { context, getFinished } = makeContext();
  context.timeMs = 90_000;

  assistedReadingExercise.onInput(0, 0, context);

  assert.notEqual(getFinished(), null);
});

test('assisted reading keeps mid-run calibrated and raw samples in separate units', () => {
  const { context } = makeContext({
    latestGazePoint: { x: 250, y: 300 },
    latestGaze: { t: 0, h: 0.1, v: 0.5 },
  });

  assistedReadingExercise.update(context);
  context.latestGazePoint = null;
  for (let index = 1; index <= 5; index++) {
    context.timeMs = index * 40;
    context.latestGaze = { t: context.timeMs, h: 0.1 + index * 0.05, v: 0.5 };
    assistedReadingExercise.update(context);
  }

  const result = assistedReadingExercise.getResultData?.(context);

  assert.equal(context.state.calibratedGazeSamples.length, 1);
  assert.equal(context.state.rawGazeSamples.length, 5);
  assert.equal(result?.calibratedSampleCount, 1);
  assert.equal(result?.rawSampleCount, 5);
  assert.equal(result?.saccadeMetrics.signalSource, 'raw-mediapipe');
  assert.equal(result?.saccadeMetrics.samplesValid, 5);
});

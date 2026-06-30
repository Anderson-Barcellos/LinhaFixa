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
      gazeSamples: [],
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

test('assisted reading ignores raw MediaPipe gaze when calculating reading saccades', () => {
  const { context, getFinished } = makeContext();

  assistedReadingExercise.update(context);
  context.timeMs = 40;
  assistedReadingExercise.update(context);
  assistedReadingExercise.onInput(0, 0, context);

  const finished = getFinished();
  assert.equal(context.state.gazeSamples.length, 0);
  assert.equal(finished.saccadeMetrics.trackingAvailable, false);
  assert.equal(finished.saccadeMetrics.signalSource, 'unavailable');
});

test('assisted reading samples calibrated MediaPipe gaze for reading saccades', () => {
  const { context } = makeContext({
    latestGazePoint: { x: 250, y: 300 },
    isGazeCalibrated: true,
  });

  assistedReadingExercise.update(context);

  assert.deepEqual(context.state.gazeSamples, [{ t: 0, h: 0.25, v: 0.5 }]);
});

test('assisted reading does not sample gaze while generated text is still loading', () => {
  const { context } = makeContext({
    latestGazePoint: { x: 250, y: 300 },
    isGazeCalibrated: true,
  });
  context.state.loading = true;

  assistedReadingExercise.update(context);

  assert.deepEqual(context.state.gazeSamples, []);
});

test('assisted reading timeout before AI text loads returns an invalid incomplete result', () => {
  const { context } = makeContext();
  context.state.loading = true;
  context.state.contentReady = false;
  context.state.gazeSamples = [
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
  context.state.gazeSamples = [
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
});

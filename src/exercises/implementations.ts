import { ExerciseImplementation } from './engine';
import { assistedReadingExercise } from './assistedReading';
import { OcSample, analyzeFixation, analyzeSaccadeTask, analyzePursuit } from './oculomotorAnalysis';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const fixationExercise: ExerciseImplementation = {
  id: 'fixation',
  init: (ctx) => {
    ctx.state = {
      targetColor: '#3b82f6',
      changed: false,
      lastChangeTimestamp: ctx.timeMs,
      hits: 0,
      totalChanges: 0,
      samples: [] as OcSample[],
    };
  },
  update: (context) => {
    const s = context.state;
    // Sample calibrated gaze against the fixed central target.
    s.samples.push({
      t: context.timeMs,
      gaze: context.latestGazePoint,
      target: { x: context.width / 2, y: context.height / 2 },
    });

    // Every 1.5-2.5 seconds, change color for 1 second
    if (!s.changed && context.timeMs - s.lastChangeTimestamp > 1500 + Math.random() * 1000) {
      s.changed = true;
      s.targetColor = '#ef4444'; // Red
      s.lastChangeTimestamp = context.timeMs;
      s.totalChanges++;
      // Reset color after short time
      setTimeout(() => {
        s.changed = false;
        s.targetColor = '#3b82f6';
      }, 1000);
    }
  },
  draw: (context) => {
    const { ctx, width, height, parameters } = context;
    const s = context.state;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = s.targetColor;
    ctx.beginPath();
    // Default 10mm target, use simple mapping
    const targetPx = context.cmToPx(parameters.targetSizeMm / 10);
    ctx.arc(width / 2, height / 2, targetPx, 0, Math.PI * 2);
    ctx.fill();
  },
  onInput: (x, y, context) => {
    const s = context.state;
    if (s.changed) {
      s.hits++;
      s.changed = false; // Prevent double hitting
      s.targetColor = '#22c55e'; // Green for nice feedback
      context.onEvent('hit', s.hits);
    }
  },
  getResultData: (context) => {
    const s = context.state;
    const metrics = analyzeFixation(
      s.samples,
      { x: context.width / 2, y: context.height / 2 },
      context.degToPx(1)
    );
    // Score from how much of the time gaze stayed on the target.
    const score = metrics.trackingAvailable ? Math.round(metrics.percentWithinThreshold) : undefined;
    return { fixationMetrics: metrics, hits: s.hits, totalChanges: s.totalChanges, score };
  }
};

export const saccadesExercise: ExerciseImplementation = {
  id: 'saccades',
  init: (ctx) => {
    ctx.state = {
      side: -1, // -1 left, 1 right
      lastSwitch: ctx.timeMs,
      interval: 1500, // Ms per jump
      targetColor: '#3b82f6',
      targetX: ctx.width / 2,
      samples: [] as OcSample[],
    };
  },
  update: (context) => {
    const s = context.state;
    if (context.timeMs - s.lastSwitch > s.interval) {
      s.side *= -1;
      s.lastSwitch = context.timeMs;
    }
    // Target position (also used by draw) so analysis sees the same coordinates.
    const offsetPx = Math.min(context.width * 0.4, context.degToPx(context.parameters.amplitudeDeg));
    s.targetX = context.width / 2 + s.side * offsetPx;

    s.samples.push({
      t: context.timeMs,
      gaze: context.latestGazePoint,
      target: { x: s.targetX, y: context.height / 2 },
    });
  },
  draw: (context) => {
    const { ctx, width, height, parameters } = context;
    const s = context.state;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = s.targetColor;
    ctx.beginPath();
    const targetPx = context.cmToPx(parameters.targetSizeMm / 10);
    ctx.arc(s.targetX, height / 2, targetPx, 0, Math.PI * 2);
    ctx.fill();
  },
  onInput: () => {},
  getResultData: (context) => {
    const metrics = analyzeSaccadeTask(context.state.samples, context.degToPx(1));
    // Score blends landing accuracy (smaller error better) and gain (near 1 better).
    let score: number | undefined;
    if (metrics.trackingAvailable) {
      const accScore = clamp(100 - metrics.meanAccuracyDeg * 15, 0, 100);
      const gainScore = clamp(100 - Math.abs(1 - metrics.meanGain) * 100, 0, 100);
      score = Math.round(0.6 * accScore + 0.4 * gainScore);
    }
    return { saccadeTaskMetrics: metrics, score };
  }
};

export const smoothPursuitExercise: ExerciseImplementation = {
  id: 'smooth_pursuit',
  init: (ctx) => {
    ctx.state = {
      targetX: ctx.width / 2,
      samples: [] as OcSample[],
    };
  },
  update: (context) => {
    const s = context.state;
    const speed = context.parameters.speedDegPerSec || 1;
    const offsetPx = Math.min(context.width * 0.4, context.degToPx(context.parameters.amplitudeDeg));
    s.targetX = context.width / 2 + Math.sin(context.timeMs * 0.001 * speed) * offsetPx;

    s.samples.push({
      t: context.timeMs,
      gaze: context.latestGazePoint,
      target: { x: s.targetX, y: context.height / 2 },
    });
  },
  draw: (context) => {
    const { ctx, width, height, parameters } = context;
    const s = context.state;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    const targetPx = context.cmToPx(parameters.targetSizeMm / 10);
    ctx.arc(s.targetX, height / 2, targetPx, 0, Math.PI * 2);
    ctx.fill();
  },
  onInput: () => {},
  getResultData: (context) => {
    const metrics = analyzePursuit(context.state.samples, context.degToPx(1));
    // Score from how much of the time gaze stayed on the moving target.
    const score = metrics.trackingAvailable ? Math.round(metrics.percentOnTarget) : undefined;
    return { pursuitMetrics: metrics, score };
  }
};

export const registry: Record<string, ExerciseImplementation> = {
  fixation: fixationExercise,
  saccades: saccadesExercise,
  smooth_pursuit: smoothPursuitExercise,
  assistedReading: assistedReadingExercise
};

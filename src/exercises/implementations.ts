import { ExerciseImplementation } from './engine';
import { assistedReadingExercise } from './assistedReading';

export const fixationExercise: ExerciseImplementation = {
  id: 'fixation',
  init: (ctx) => {
    (ctx as any).state = {
      targetColor: '#3b82f6',
      changed: false,
      lastChangeTimestamp: ctx.timeMs,
      hits: 0,
      totalChanges: 0
    };
  },
  update: (context) => {
    const s = (context as any).state;
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
    const s = (context as any).state;
    
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = s.targetColor;
    ctx.beginPath();
    // Default 10mm target, use simple mapping
    const targetPx = context.cmToPx(parameters.targetSizeMm / 10);
    ctx.arc(width / 2, height / 2, targetPx, 0, Math.PI * 2);
    ctx.fill();
  },
  onInput: (x, y, context) => {
    const s = (context as any).state;
    if (s.changed) {
      s.hits++;
      s.changed = false; // Prevent double hitting
      s.targetColor = '#22c55e'; // Green for nice feedback
      context.onEvent('hit', s.hits);
    }
  }
};

export const saccadesExercise: ExerciseImplementation = {
  id: 'saccades',
  init: (ctx) => {
    (ctx as any).state = {
      side: -1, // -1 left, 1 right
      lastSwitch: ctx.timeMs,
      interval: 1500, // Ms per jump
      targetColor: '#3b82f6'
    };
  },
  update: (context) => {
    const s = (context as any).state;
    if (context.timeMs - s.lastSwitch > s.interval) {
      s.side *= -1;
      s.lastSwitch = context.timeMs;
    }
  },
  draw: (context) => {
    const { ctx, width, height, parameters } = context;
    const s = (context as any).state;
    ctx.clearRect(0, 0, width, height);
    
    ctx.fillStyle = s.targetColor;
    ctx.beginPath();
    const targetPx = context.cmToPx(parameters.targetSizeMm / 10);
    
    // Amplitude mapping
    const offsetPx = Math.min(width * 0.4, context.cmToPx(parameters.amplitudeDeg)); // Very rough approximation
    
    ctx.arc(width / 2 + (s.side * offsetPx), height / 2, targetPx, 0, Math.PI * 2);
    ctx.fill();
  },
  onInput: () => {}
};

export const smoothPursuitExercise: ExerciseImplementation = {
  id: 'smooth_pursuit',
  init: (ctx) => {},
  update: () => {},
  draw: (context) => {
    const { ctx, width, height, parameters, timeMs } = context;
    ctx.clearRect(0, 0, width, height);
    
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    const targetPx = context.cmToPx(parameters.targetSizeMm / 10);
    const speed = parameters.speedDegPerSec || 1; 
    const offsetPx = Math.min(width * 0.4, context.cmToPx(parameters.amplitudeDeg));
    
    // Sine wave motion
    const x = width / 2 + Math.sin(timeMs * 0.001 * speed) * offsetPx;
    
    ctx.arc(x, height / 2, targetPx, 0, Math.PI * 2);
    ctx.fill();
  },
  onInput: () => {}
};

export const registry: Record<string, ExerciseImplementation> = {
  fixation: fixationExercise,
  saccades: saccadesExercise,
  smooth_pursuit: smoothPursuitExercise,
  assistedReading: assistedReadingExercise
};

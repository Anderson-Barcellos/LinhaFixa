import type { DiagnosticsLayoutMode } from './deviceProfile';

export interface DiagnosticsSurfaceInput {
  // MEASURED CSS px of the box that hosts the surface. The flexbox already
  // subtracted header, panel, paddings and safe-area — this module no longer
  // predicts space from viewport-minus-constants (that arithmetic silently
  // diverged from the real container and the CSS clipped the difference).
  availableWidth: number;
  availableHeight: number;
  layoutMode: DiagnosticsLayoutMode;
}

export interface DiagnosticsSurface {
  mode: DiagnosticsLayoutMode;
  width: number;
  height: number;
}

const DESKTOP_MIN_WIDTH = 720;
const DESKTOP_MAX_WIDTH = 1180;
const DESKTOP_MIN_HEIGHT = 420;
const DESKTOP_MAX_HEIGHT = 760;
// Portrait desktop (vertical monitor): the 16:9 aspect would squash the surface into
// a short strip, so the column fills the available height up to this ceiling instead.
const DESKTOP_MAX_HEIGHT_PORTRAIT = 1280;
const DESKTOP_TARGET_ASPECT = 16 / 9;

export function computeDiagnosticsSurface(input: DiagnosticsSurfaceInput): DiagnosticsSurface {
  const availableWidth = Math.max(0, input.availableWidth);
  const availableHeight = Math.max(0, input.availableHeight);

  if (input.layoutMode === 'compact') {
    return { mode: 'compact', width: availableWidth, height: availableHeight };
  }

  // The 720×420 floor is soft: when the measured box is tighter than the floor,
  // the surface shrinks to fit instead of overflowing.
  const minWidth = Math.min(DESKTOP_MIN_WIDTH, availableWidth);
  const minHeight = Math.min(DESKTOP_MIN_HEIGHT, availableHeight);
  const widthByBounds = clamp(availableWidth, minWidth, DESKTOP_MAX_WIDTH);

  // Portrait desktop: height is the abundant axis, so the aspect coupling is dropped
  // and the surface fills the column (more visible lines, less neck travel).
  if (availableWidth < availableHeight) {
    return {
      mode: 'desktop',
      width: Math.round(widthByBounds),
      height: Math.round(clamp(availableHeight, minHeight, DESKTOP_MAX_HEIGHT_PORTRAIT)),
    };
  }

  const heightFromAspect = widthByBounds / DESKTOP_TARGET_ASPECT;
  const height = clamp(Math.min(availableHeight, heightFromAspect), minHeight, DESKTOP_MAX_HEIGHT);
  const width = clamp(Math.min(widthByBounds, height * DESKTOP_TARGET_ASPECT), minWidth, DESKTOP_MAX_WIDTH);
  return { mode: 'desktop', width: Math.round(width), height: Math.round(height) };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return value;
  return Math.max(min, Math.min(max, value));
}

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
const DESKTOP_MAX_WIDTH = 1440;
const DESKTOP_MIN_HEIGHT = 420;
const DESKTOP_MAX_HEIGHT = 1280;

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

  // Unified desktop rule: the surface always fills the measured box, each axis
  // clamped independently (1440 wide × 1280 tall), regardless of orientation.
  // Height is the clinically valuable axis — more visible lines means more of
  // the reading flow is captured — so it is never traded off against width.
  // The old 16:9 coupling below the width≈height boundary was cosmetic legacy
  // and caused a visible jump (1181→664) the instant width crossed height.
  return {
    mode: 'desktop',
    width: Math.round(clamp(availableWidth, minWidth, DESKTOP_MAX_WIDTH)),
    height: Math.round(clamp(availableHeight, minHeight, DESKTOP_MAX_HEIGHT)),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return value;
  return Math.max(min, Math.min(max, value));
}

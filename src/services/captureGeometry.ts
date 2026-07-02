import type { DiagnosticsLayoutMode } from './deviceProfile';

export interface DiagnosticsSurfaceInput {
  viewportWidth: number;
  viewportHeight: number;
  layoutMode: DiagnosticsLayoutMode;
  panelWidth: number;
  headerHeight: number;
}

export interface DiagnosticsSurface {
  mode: DiagnosticsLayoutMode;
  left: number;
  top: number;
  width: number;
  height: number;
}

const DESKTOP_MIN_WIDTH = 720;
const DESKTOP_MAX_WIDTH = 1180;
const DESKTOP_MIN_HEIGHT = 420;
const DESKTOP_MAX_HEIGHT = 760;
const DESKTOP_TARGET_ASPECT = 16 / 9;

export function computeDiagnosticsSurface(input: DiagnosticsSurfaceInput): DiagnosticsSurface {
  const viewportWidth = Math.max(0, input.viewportWidth);
  const viewportHeight = Math.max(0, input.viewportHeight);
  const headerHeight = Math.max(0, input.headerHeight);
  const panelWidth = input.layoutMode === 'desktop' ? Math.max(0, input.panelWidth) : 0;
  const availableWidth = Math.max(0, viewportWidth - panelWidth);
  const availableHeight = Math.max(0, viewportHeight - headerHeight);

  if (input.layoutMode === 'compact') {
    return {
      mode: 'compact',
      left: 0,
      top: headerHeight,
      width: availableWidth,
      height: availableHeight,
    };
  }

  const widthByBounds = clamp(availableWidth, DESKTOP_MIN_WIDTH, DESKTOP_MAX_WIDTH);
  const heightFromAspect = widthByBounds / DESKTOP_TARGET_ASPECT;
  const height = clamp(Math.min(availableHeight, heightFromAspect), DESKTOP_MIN_HEIGHT, DESKTOP_MAX_HEIGHT);
  const width = clamp(Math.min(widthByBounds, height * DESKTOP_TARGET_ASPECT), DESKTOP_MIN_WIDTH, DESKTOP_MAX_WIDTH);

  return {
    mode: 'desktop',
    left: Math.max(0, (availableWidth - width) / 2),
    top: headerHeight + Math.max(0, (availableHeight - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return value;
  return Math.max(min, Math.min(max, value));
}

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
// Portrait desktop (vertical monitor): the 16:9 aspect would squash the surface into
// a short strip, so the column fills the available height up to this ceiling instead.
const DESKTOP_MAX_HEIGHT_PORTRAIT = 1280;
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

  // The 720×420 floor is soft: when the viewport minus the panel is tighter than the
  // floor, the surface shrinks to fit instead of overflowing (which would clip the
  // diagnostics panel under justify-center). The real surface size is recorded per
  // capture, so a smaller measured surface stays honest.
  const minWidth = Math.min(DESKTOP_MIN_WIDTH, availableWidth);
  const minHeight = Math.min(DESKTOP_MIN_HEIGHT, availableHeight);
  const widthByBounds = clamp(availableWidth, minWidth, DESKTOP_MAX_WIDTH);

  // Portrait desktop: height is the abundant axis, so the aspect coupling is dropped
  // and the surface fills the column (more visible lines, less neck travel).
  if (availableWidth < availableHeight) {
    const portraitHeight = clamp(availableHeight, minHeight, DESKTOP_MAX_HEIGHT_PORTRAIT);
    return {
      mode: 'desktop',
      left: Math.max(0, (availableWidth - widthByBounds) / 2),
      top: headerHeight + Math.max(0, (availableHeight - portraitHeight) / 2),
      width: Math.round(widthByBounds),
      height: Math.round(portraitHeight),
    };
  }

  const heightFromAspect = widthByBounds / DESKTOP_TARGET_ASPECT;
  const height = clamp(Math.min(availableHeight, heightFromAspect), minHeight, DESKTOP_MAX_HEIGHT);
  const width = clamp(Math.min(widthByBounds, height * DESKTOP_TARGET_ASPECT), minWidth, DESKTOP_MAX_WIDTH);

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

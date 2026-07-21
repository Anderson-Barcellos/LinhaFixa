import type { CaptureInterruptionReason } from './captureValidity';
import type { SurfaceRect } from './ocularSignalContract';

export interface SessionGeometry {
  orientation: 'portrait' | 'landscape';
  surfaceRect: SurfaceRect;
}

export function sessionGeometryInterruption(
  frozen: SessionGeometry,
  current: SessionGeometry,
  tolerancePx = 1,
): CaptureInterruptionReason | null {
  if (frozen.orientation !== current.orientation) {
    return 'orientation-changed-during-capture';
  }
  const keys = ['left', 'top', 'width', 'height'] as const;
  return keys.some(key => (
    Math.abs(frozen.surfaceRect[key] - current.surfaceRect[key]) > tolerancePx
  ))
    ? 'geometry-changed-during-capture'
    : null;
}

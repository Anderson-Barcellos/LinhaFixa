export type OrientationKind = 'portrait' | 'landscape';

export interface SurfaceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewportNormPoint {
  x: number;
  y: number;
}

export interface SurfacePoint {
  x: number;
  y: number;
  inBounds: boolean;
}

export interface CalibrationSignature {
  viewportWidth: number;
  viewportHeight: number;
  orientation: OrientationKind;
  devicePixelRatio: number;
  surfaceRect: SurfaceRect;
  videoWidth?: number;
  videoHeight?: number;
  trackFrameRate?: number;
}

export interface CalibrationSignatureMatch {
  matches: boolean;
  reasons: string[];
}

const VIEWPORT_TOLERANCE_PX = 24;
const SURFACE_TOLERANCE_PX = 24;
const DPR_TOLERANCE = 0.15;
const VIDEO_ASPECT_TOLERANCE = 0.04;

export function viewportNormToRectPoint(
  point: ViewportNormPoint,
  rect: SurfaceRect,
  viewport: ViewportSize
): SurfacePoint {
  const viewportX = point.x * viewport.width;
  const viewportY = point.y * viewport.height;
  const x = viewportX - rect.left;
  const y = viewportY - rect.top;
  return {
    x,
    y,
    inBounds: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height,
  };
}

export function calibrationSignatureMatches(
  expected: CalibrationSignature | null | undefined,
  actual: CalibrationSignature
): CalibrationSignatureMatch {
  if (!expected) {
    return { matches: false, reasons: ['sem assinatura de calibracao'] };
  }

  const reasons: string[] = [];
  if (expected.orientation !== actual.orientation) {
    reasons.push('orientacao mudou');
  }
  if (Math.abs(expected.viewportWidth - actual.viewportWidth) > VIEWPORT_TOLERANCE_PX) {
    reasons.push('largura do viewport mudou');
  }
  if (Math.abs(expected.viewportHeight - actual.viewportHeight) > VIEWPORT_TOLERANCE_PX) {
    reasons.push('altura do viewport mudou');
  }
  if (Math.abs(expected.devicePixelRatio - actual.devicePixelRatio) > DPR_TOLERANCE) {
    reasons.push('devicePixelRatio mudou');
  }
  if (rectDiffers(expected.surfaceRect, actual.surfaceRect)) {
    reasons.push('superficie de leitura mudou');
  }
  if (
    expected.videoWidth && expected.videoHeight
    && actual.videoWidth && actual.videoHeight
    && Math.abs(aspect(expected.videoWidth, expected.videoHeight) - aspect(actual.videoWidth, actual.videoHeight)) > VIDEO_ASPECT_TOLERANCE
  ) {
    reasons.push('aspecto do video mudou');
  }

  return { matches: reasons.length === 0, reasons };
}

export function currentOrientation(width = window.innerWidth, height = window.innerHeight): OrientationKind {
  return width >= height ? 'landscape' : 'portrait';
}

export function rectFromElement(element: Element): SurfaceRect {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function fullViewportRect(width = window.innerWidth, height = window.innerHeight): SurfaceRect {
  return { left: 0, top: 0, width, height };
}

function rectDiffers(a: SurfaceRect, b: SurfaceRect): boolean {
  return Math.abs(a.left - b.left) > SURFACE_TOLERANCE_PX
    || Math.abs(a.top - b.top) > SURFACE_TOLERANCE_PX
    || Math.abs(a.width - b.width) > SURFACE_TOLERANCE_PX
    || Math.abs(a.height - b.height) > SURFACE_TOLERANCE_PX;
}

function aspect(width: number, height: number): number {
  return height > 0 ? width / height : 0;
}

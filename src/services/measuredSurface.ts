// Single source of truth for "how big is this box, really": parses a
// ResizeObserverEntry-shaped object into CSS px + device px. Prefers
// devicePixelContentBoxSize (exact physical pixels, Chromium) and falls back to
// contentBoxSize × dpr (Safari/iOS has no device-pixel box) then contentRect.
// Pure so node:test can cover it without a DOM.

export interface MeasuredSurface {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  devicePxWidth: number;
  devicePxHeight: number;
}

interface BoxSize { inlineSize: number; blockSize: number }

export interface SurfaceBoxEntry {
  devicePixelContentBoxSize?: ReadonlyArray<BoxSize>;
  contentBoxSize?: ReadonlyArray<BoxSize>;
  contentRect?: { width: number; height: number };
}

export function measuredSurfaceFromEntry(entry: SurfaceBoxEntry, dpr: number): MeasuredSurface | null {
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;

  const contentBox = entry.contentBoxSize?.[0];
  const cssWidth = contentBox ? contentBox.inlineSize : entry.contentRect?.width;
  const cssHeight = contentBox ? contentBox.blockSize : entry.contentRect?.height;
  if (cssWidth == null || cssHeight == null) return null;

  const deviceBox = entry.devicePixelContentBoxSize?.[0];
  return {
    cssWidth,
    cssHeight,
    dpr: safeDpr,
    devicePxWidth: deviceBox ? deviceBox.inlineSize : Math.round(cssWidth * safeDpr),
    devicePxHeight: deviceBox ? deviceBox.blockSize : Math.round(cssHeight * safeDpr),
  };
}

export function measuredSurfaceEquals(a: MeasuredSurface | null, b: MeasuredSurface | null): boolean {
  if (a === null || b === null) return a === b;
  return a.cssWidth === b.cssWidth
    && a.cssHeight === b.cssHeight
    && a.dpr === b.dpr
    && a.devicePxWidth === b.devicePxWidth
    && a.devicePxHeight === b.devicePxHeight;
}

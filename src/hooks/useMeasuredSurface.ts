import { useCallback, useRef, useState } from 'react';
import {
  measuredSurfaceFromEntry,
  measuredSurfaceEquals,
  type MeasuredSurface,
  type SurfaceBoxEntry,
} from '@/services/measuredSurface';

// Measures the element's real content box via ResizeObserver, so layout math can
// consume reality instead of predicting it from viewport-minus-constants. The
// equality guard keeps setState quiet on no-op callbacks (avoids RO feedback loops).
export function useMeasuredSurface<T extends HTMLElement>(): {
  ref: (el: T | null) => void;
  surface: MeasuredSurface | null;
} {
  const [surface, setSurface] = useState<MeasuredSurface | null>(null);
  const lastRef = useRef<MeasuredSurface | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[entries.length - 1] as unknown as SurfaceBoxEntry;
      const next = measuredSurfaceFromEntry(entry, window.devicePixelRatio || 1);
      if (next && !measuredSurfaceEquals(next, lastRef.current)) {
        lastRef.current = next;
        setSurface(next);
      }
    });
    // device-pixel-content-box is a Chromium-only observe option; Safari throws.
    try {
      observer.observe(el, { box: 'device-pixel-content-box' } as ResizeObserverOptions);
    } catch {
      observer.observe(el);
    }
    observerRef.current = observer;
  }, []);

  return { ref, surface };
}

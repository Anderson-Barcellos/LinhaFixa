export type DiagnosticsLayoutMode = 'compact' | 'desktop';

export interface DiagnosticsLayoutInput {
  viewportWidth: number;
  hasTouch: boolean;
}

const DESKTOP_DIAGNOSTICS_MIN_WIDTH_PX = 1024;

export function diagnosticsLayoutMode({ viewportWidth, hasTouch }: DiagnosticsLayoutInput): DiagnosticsLayoutMode {
  if (hasTouch) return 'compact';
  return viewportWidth >= DESKTOP_DIAGNOSTICS_MIN_WIDTH_PX ? 'desktop' : 'compact';
}

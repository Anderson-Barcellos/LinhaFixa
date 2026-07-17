import { preloadCameraRouteCode } from './routeModules';

interface AdaptivePreloadDependencies {
  isVisible(): boolean;
  requestIdle(run: () => void): number;
  cancelIdle(handle: number): void;
  preloadCameraCode(): Promise<void>;
}

export function createAdaptivePreloadController(deps: AdaptivePreloadDependencies) {
  let idleHandle: number | null = null;
  let completed = false;
  let generation = 0;

  const cancel = () => {
    generation += 1;
    if (idleHandle !== null) deps.cancelIdle(idleHandle);
    idleHandle = null;
  };

  const schedule = () => {
    if (completed || idleHandle !== null || !deps.isVisible()) return;
    const token = ++generation;
    idleHandle = deps.requestIdle(() => {
      idleHandle = null;
      if (completed || token !== generation || !deps.isVisible()) return;
      completed = true;
      void deps.preloadCameraCode().catch(() => { completed = false; });
    });
  };

  return {
    start: schedule,
    stop: cancel,
    visibilityChanged() {
      if (deps.isVisible()) schedule();
      else cancel();
    },
  };
}

type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};

interface IdleSchedulerSource {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
}

export function createPairedIdleScheduler(source: IdleSchedulerSource) {
  const useNative = typeof source.requestIdleCallback === 'function'
    && typeof source.cancelIdleCallback === 'function';
  return {
    requestIdle: (run: () => void) => useNative
      ? source.requestIdleCallback!(run)
      : source.setTimeout(run, 1_500),
    cancelIdle: (handle: number) => useNative
      ? source.cancelIdleCallback!(handle)
      : source.clearTimeout(handle),
  };
}

export function startAdaptiveCameraCodePreload(): () => void {
  const browser = window as IdleWindow;
  const idleScheduler = createPairedIdleScheduler({
    requestIdleCallback: browser.requestIdleCallback
      ? run => browser.requestIdleCallback!(run)
      : undefined,
    cancelIdleCallback: browser.cancelIdleCallback
      ? handle => browser.cancelIdleCallback!(handle)
      : undefined,
    setTimeout: (run, delay) => window.setTimeout(run, delay),
    clearTimeout: handle => window.clearTimeout(handle),
  });
  const controller = createAdaptivePreloadController({
    isVisible: () => document.visibilityState === 'visible',
    requestIdle: idleScheduler.requestIdle,
    cancelIdle: idleScheduler.cancelIdle,
    preloadCameraCode: preloadCameraRouteCode,
  });
  const onVisibility = () => controller.visibilityChanged();
  document.addEventListener('visibilitychange', onVisibility);
  controller.start();
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    controller.stop();
  };
}

export function signalCameraIntent(): void {
  void import('./faceTracking')
    .then(module => module.initFaceTracking())
    .catch(() => false);
}

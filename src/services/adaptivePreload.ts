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

export function startAdaptiveCameraCodePreload(): () => void {
  const browser = window as IdleWindow;
  const controller = createAdaptivePreloadController({
    isVisible: () => document.visibilityState === 'visible',
    requestIdle: run => browser.requestIdleCallback
      ? browser.requestIdleCallback(run)
      : window.setTimeout(run, 1_500),
    cancelIdle: handle => browser.cancelIdleCallback
      ? browser.cancelIdleCallback(handle)
      : window.clearTimeout(handle),
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

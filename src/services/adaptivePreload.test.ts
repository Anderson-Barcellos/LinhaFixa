import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdaptivePreloadController } from './adaptivePreload';

test('visible idle schedules code once and hidden state cancels pending work', async () => {
  let visible = true;
  let callback: (() => void) | null = null;
  let cancelled = 0;
  let preloads = 0;
  const controller = createAdaptivePreloadController({
    isVisible: () => visible,
    requestIdle: run => { callback = run; return 7; },
    cancelIdle: handle => { assert.equal(handle, 7); cancelled += 1; },
    preloadCameraCode: async () => { preloads += 1; },
  });
  controller.start();
  visible = false;
  controller.visibilityChanged();
  assert.equal(cancelled, 1);
  callback?.();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(preloads, 0);
});

test('returning visible reschedules and successful idle callback runs only once', async () => {
  let visible = false;
  const callbacks: Array<() => void> = [];
  let preloads = 0;
  const controller = createAdaptivePreloadController({
    isVisible: () => visible,
    requestIdle: run => { callbacks.push(run); return callbacks.length; },
    cancelIdle: () => {},
    preloadCameraCode: async () => { preloads += 1; },
  });
  controller.start();
  assert.equal(callbacks.length, 0);
  visible = true;
  controller.visibilityChanged();
  callbacks[0]();
  callbacks[0]();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(preloads, 1);
});

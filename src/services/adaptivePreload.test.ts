import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdaptivePreloadController, createPairedIdleScheduler } from './adaptivePreload';

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

test('idle scheduler uses native callbacks only when request and cancel coexist', () => {
  for (const nativePair of ['request-only', 'cancel-only'] as const) {
    const calls: string[] = [];
    const browser = {
      ...(nativePair === 'request-only' ? { requestIdleCallback: () => { calls.push('native-request'); return 11; } } : {}),
      ...(nativePair === 'cancel-only' ? { cancelIdleCallback: () => { calls.push('native-cancel'); } } : {}),
      setTimeout: () => { calls.push('timer-request'); return 21; },
      clearTimeout: () => { calls.push('timer-cancel'); },
    };
    const scheduler = createPairedIdleScheduler(browser);
    const handle = scheduler.requestIdle(() => {});
    scheduler.cancelIdle(handle);
    assert.deepEqual(calls, ['timer-request', 'timer-cancel']);
  }

  const calls: string[] = [];
  const scheduler = createPairedIdleScheduler({
    requestIdleCallback: () => { calls.push('native-request'); return 31; },
    cancelIdleCallback: () => { calls.push('native-cancel'); },
    setTimeout: () => { calls.push('timer-request'); return 41; },
    clearTimeout: () => { calls.push('timer-cancel'); },
  });
  const handle = scheduler.requestIdle(() => {});
  scheduler.cancelIdle(handle);
  assert.deepEqual(calls, ['native-request', 'native-cancel']);
});

test('failed preload can be scheduled for a real retry', async () => {
  const callbacks: Array<() => void> = [];
  let attempts = 0;
  const controller = createAdaptivePreloadController({
    isVisible: () => true,
    requestIdle: run => { callbacks.push(run); return callbacks.length; },
    cancelIdle: () => {},
    preloadCameraCode: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary preload failure');
    },
  });
  controller.start();
  callbacks[0]();
  await new Promise<void>(resolve => setImmediate(resolve));
  controller.start();
  callbacks[1]();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(attempts, 2);
});

test('stop invalidates stale work while a StrictMode-style restart can complete', async () => {
  const callbacks: Array<() => void> = [];
  let preloads = 0;
  const deps = {
    isVisible: () => true,
    requestIdle: (run: () => void) => { callbacks.push(run); return callbacks.length; },
    cancelIdle: () => {},
    preloadCameraCode: async () => { preloads += 1; },
  };
  const discarded = createAdaptivePreloadController(deps);
  discarded.start();
  discarded.stop();
  callbacks[0]();

  const active = createAdaptivePreloadController(deps);
  active.start();
  callbacks[1]();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(preloads, 1);
});

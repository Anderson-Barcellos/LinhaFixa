import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRouteChunkRecovery,
  isDynamicImportFailure,
} from './routeChunkRecovery';

test('isDynamicImportFailure recognizes browser dynamic-import failures only', () => {
  assert.equal(isDynamicImportFailure(new TypeError('Failed to fetch dynamically imported module: /gaze/assets/Dashboard.js')), true);
  assert.equal(isDynamicImportFailure(new Error('ChunkLoadError: Loading chunk 4 failed')), true);
  assert.equal(isDynamicImportFailure(new Error('calibration rejected')), false);
});

test('route recovery reloads once inside the cooldown and never reloads generic errors', () => {
  const values = new Map<string, string>();
  let reloads = 0;
  const dependencies = {
    now: () => 50_000,
    storage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    },
    reload: () => { reloads += 1; },
  };
  const chunkError = new TypeError('Importing a module script failed');
  const beforeReload = createRouteChunkRecovery(dependencies);
  assert.equal(beforeReload.tryReload(chunkError), true);

  const afterReload = createRouteChunkRecovery(dependencies);
  assert.equal(afterReload.tryReload(chunkError), false);
  assert.equal(afterReload.tryReload(new Error('domain failure')), false);
  assert.equal(reloads, 1);
});

test('successful route load clears stale recovery state', async () => {
  const values = new Map([['gaze:route-chunk-reload-at', '49000']]);
  const recovery = createRouteChunkRecovery({
    now: () => 50_000,
    storage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    },
    reload: () => {},
  });
  assert.deepEqual(await recovery.load(() => Promise.resolve({ screen: 'dashboard' })), { screen: 'dashboard' });
  assert.equal(values.has('gaze:route-chunk-reload-at'), false);
});

test('load reloads a failed dynamic import and remains pending for navigation', async () => {
  const values = new Map<string, string>();
  const chunkError = new TypeError('Importing a module script failed');
  let reloads = 0;
  let markReloadObserved!: () => void;
  const reloadObserved = new Promise<void>(resolve => { markReloadObserved = resolve; });
  const dependencies = {
    now: () => 50_000,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
    reload: () => {
      reloads += 1;
      markReloadObserved();
    },
  };
  const recovery = createRouteChunkRecovery({
    ...dependencies,
  });

  const pendingLoad = recovery.load(() => Promise.reject(chunkError));
  await reloadObserved;
  await Promise.resolve();

  let releaseSentinel!: () => void;
  const sentinel = new Promise<'sentinel'>(resolve => { releaseSentinel = () => resolve('sentinel'); });
  const pendingState = Promise.race([
    pendingLoad.then(() => 'resolved' as const, () => 'rejected' as const),
    sentinel,
  ]);
  releaseSentinel();

  assert.equal(reloads, 1);
  assert.equal(await pendingState, 'sentinel');

  const afterReload = createRouteChunkRecovery(dependencies);
  await assert.rejects(afterReload.load(() => Promise.reject(chunkError)), error => error === chunkError);
  assert.equal(reloads, 1);
});

test('load preserves a generic loader error when storage throws', async () => {
  const loaderError = new Error('calibration rejected');
  const storageError = new Error('storage blocked');
  let reloads = 0;
  const recovery = createRouteChunkRecovery({
    now: () => 50_000,
    storage: {
      getItem: () => { throw storageError; },
      setItem: () => { throw storageError; },
      removeItem: () => { throw storageError; },
    },
    reload: () => { reloads += 1; },
  });

  await assert.rejects(recovery.load(() => Promise.reject(loaderError)), error => error === loaderError);
  assert.equal(reloads, 0);
});

test('storage failures do not prevent a successful route load', async () => {
  const storageError = new Error('storage blocked');
  const recovery = createRouteChunkRecovery({
    now: () => 50_000,
    storage: {
      getItem: () => { throw storageError; },
      setItem: () => { throw storageError; },
      removeItem: () => { throw storageError; },
    },
    reload: () => {},
  });

  assert.deepEqual(await recovery.load(() => Promise.resolve({ screen: 'dashboard' })), { screen: 'dashboard' });
});

test('storage read and write failures skip automatic reload and preserve the original chunk error', async () => {
  const storageError = new Error('storage blocked');
  const chunkError = new TypeError('Failed to fetch dynamically imported module: /gaze/assets/Dashboard.js');
  for (const blockedOperation of ['getItem', 'setItem'] as const) {
    let reloads = 0;
    let markReloadObserved!: () => void;
    const reloadObserved = new Promise<'reloaded'>(resolve => { markReloadObserved = () => resolve('reloaded'); });
    const recovery = createRouteChunkRecovery({
      now: () => 50_000,
      storage: {
        getItem: () => {
          if (blockedOperation === 'getItem') throw storageError;
          return null;
        },
        setItem: () => {
          if (blockedOperation === 'setItem') throw storageError;
        },
        removeItem: () => {},
      },
      reload: () => {
        reloads += 1;
        markReloadObserved();
      },
    });

    const outcome = await Promise.race([
      recovery.load(() => Promise.reject(chunkError)).then(() => 'resolved' as const, error => error),
      reloadObserved,
    ]);

    assert.equal(outcome, chunkError, blockedOperation);
    assert.equal(reloads, 0, blockedOperation);
  }
});

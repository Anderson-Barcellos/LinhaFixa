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
  const recovery = createRouteChunkRecovery({
    now: () => 50_000,
    storage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    },
    reload: () => { reloads += 1; },
  });
  const chunkError = new TypeError('Importing a module script failed');
  assert.equal(recovery.tryReload(chunkError), true);
  assert.equal(recovery.tryReload(chunkError), false);
  assert.equal(recovery.tryReload(new Error('domain failure')), false);
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
  let reloads = 0;
  const recovery = createRouteChunkRecovery({
    now: () => 50_000,
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    reload: () => { reloads += 1; },
  });

  void recovery.load(() => Promise.reject(new TypeError('Importing a module script failed')));
  await new Promise<void>(resolve => setImmediate(resolve));

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

test('storage failures keep chunk reload limited in memory and preserve the original error', async () => {
  const storageError = new Error('storage blocked');
  const chunkError = new TypeError('Failed to fetch dynamically imported module: /gaze/assets/Dashboard.js');
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

  void recovery.load(() => Promise.reject(chunkError));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(reloads, 1);

  await assert.rejects(recovery.load(() => Promise.reject(chunkError)), error => error === chunkError);
  assert.equal(reloads, 1);
});

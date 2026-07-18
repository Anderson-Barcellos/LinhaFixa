import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetryableSingleFlight } from './mediaPipeRuntime';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('single flight shares one in-flight load and becomes ready', async () => {
  const pending = deferred<string>();
  let calls = 0;
  const loader = createRetryableSingleFlight(() => { calls += 1; return pending.promise; });
  const first = loader.run();
  const second = loader.run();
  assert.equal(calls, 1);
  assert.equal(loader.state(), 'loading');
  pending.resolve('ready');
  assert.equal(await first, 'ready');
  assert.equal(await second, 'ready');
  assert.equal(loader.state(), 'ready');
});

test('single flight clears a rejected promise and permits a real retry', async () => {
  let calls = 0;
  const loader = createRetryableSingleFlight(async () => {
    calls += 1;
    if (calls === 1) throw new Error('warmup failed');
    return 'ready';
  });
  await assert.rejects(loader.run(), /warmup failed/);
  assert.equal(loader.state(), 'failed');
  assert.equal(await loader.run(), 'ready');
  assert.equal(calls, 2);
  assert.equal(loader.state(), 'ready');
});

test('single flight converts a synchronous loader throw into a retryable rejection', async () => {
  let calls = 0;
  const loader = createRetryableSingleFlight(() => {
    calls += 1;
    if (calls === 1) throw new Error('sync warmup failed');
    return Promise.resolve('ready');
  });
  const first = loader.run();
  assert.ok(first instanceof Promise);
  await assert.rejects(first, /sync warmup failed/);
  assert.equal(loader.state(), 'failed');
  assert.equal(await loader.run(), 'ready');
  assert.equal(calls, 2);
});

test('single flight returns the cached ready value without loading again', async () => {
  const value = { runtime: 'ready' };
  let calls = 0;
  const loader = createRetryableSingleFlight(async () => {
    calls += 1;
    return value;
  });
  assert.equal(await loader.run(), value);
  assert.equal(await loader.run(), value);
  assert.equal(calls, 1);
  assert.equal(loader.state(), 'ready');
});

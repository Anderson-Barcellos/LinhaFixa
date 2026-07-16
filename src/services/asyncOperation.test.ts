import assert from 'node:assert/strict';
import test from 'node:test';
import { createAsyncOperationGate, guardedAwait } from './asyncOperation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function startupHarness(boundaries: Array<Promise<string>>, effects: string[]) {
  const gate = createAsyncOperationGate();
  const token = gate.begin();
  const run = (async () => {
    const permission = await guardedAwait(gate, token, boundaries[0]);
    if (!permission.current) return;
    effects.push('sensor');
    const face = await guardedAwait(gate, token, boundaries[1]);
    if (!face.current) return;
    effects.push('face');
    const camera = await guardedAwait(gate, token, boundaries[2]);
    if (!camera.current) return;
    effects.push('camera');
    const attach = await guardedAwait(gate, token, boundaries[3]);
    if (!attach.current) return;
    effects.push('state');
  })();
  return { gate, run };
}

test('guarded startup suppresses resources and state after each deferred boundary', async () => {
  for (let staleBoundary = 0; staleBoundary < 4; staleBoundary += 1) {
    const steps = Array.from({ length: 4 }, () => deferred<string>());
    const effects: string[] = [];
    const { gate, run } = await startupHarness(steps.map(step => step.promise), effects);
    for (let index = 0; index < staleBoundary; index += 1) {
      steps[index].resolve('ok');
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    gate.invalidate();
    steps[staleBoundary].resolve('late');
    for (let index = staleBoundary + 1; index < steps.length; index += 1) steps[index].resolve('unused');
    await run;
    assert.deepEqual(effects, ['sensor', 'face', 'camera'].slice(0, staleBoundary), `boundary ${staleBoundary}`);
    assert.equal(effects.includes('state'), false);
  }
});

test('unmount and supersede invalidate an operation before a deferred permission resolves', async () => {
  for (const invalidate of ['unmount', 'supersede'] as const) {
    const gate = createAsyncOperationGate();
    const token = gate.begin();
    const permission = deferred<string>();
    const result = guardedAwait(gate, token, permission.promise);
    if (invalidate === 'unmount') gate.unmount();
    else gate.begin();
    permission.resolve('granted');
    assert.deepEqual(await result, { current: false });
  }
});

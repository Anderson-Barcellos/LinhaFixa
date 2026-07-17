import { spawn } from 'node:child_process';
import {
  assertPortFree,
  formatSmokeSummary,
  observeChild,
  parseSmokeResult,
  terminateObserved,
  waitForOwnedHttp,
} from './smoke-runtime.mjs';

const PORT = '4175';
const BASE_URL = `http://127.0.0.1:${PORT}/gaze/`;

function run(script) {
  return new Promise((resolve, reject) => {
    const observed = observeChild(
      spawn(process.execPath, [script, BASE_URL], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }),
      { label: script },
    );
    observed.exited.then(exit => {
      if (exit.error || exit.code !== 0) {
        reject(new Error(`${script} exited ${exit.error?.message ?? exit.code}\n${observed.output.stdout}${observed.output.stderr}`));
        return;
      }
      try {
        resolve(parseSmokeResult(`${observed.output.stdout}\n${observed.output.stderr}`));
      } catch (error) {
        reject(error);
      }
    });
  });
}

await assertPortFree({ host: '127.0.0.1', port: Number(PORT), label: 'built smoke server' });
let server = null;

try {
  server = observeChild(spawn(process.execPath, ['dist/server.cjs'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production', APP_BASE_PATH: '/gaze', PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
  }), { label: 'built smoke server', prefix: '[built:4175] ' });
  await waitForOwnedHttp({
    observed: server,
    url: BASE_URL,
    isReady: async response => response.ok && (await response.text()).includes('<div id="root">'),
  });
  console.log(`\nIsolated fresh build ready at ${BASE_URL}`);
  const results = [
    await run('scripts/smoke-layout.mjs'),
    await run('scripts/smoke-validity.mjs'),
    await run('scripts/smoke-assessment-workflow.mjs'),
  ];
  console.log(`\n${formatSmokeSummary(results)}`);
} finally {
  await terminateObserved(server);
}

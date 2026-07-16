import { spawn } from 'node:child_process';

const PORT = '4175';
const BASE_URL = `http://127.0.0.1:${PORT}/gaze/`;

async function waitFor(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok && (await response.text()).includes('<div id="root">')) return;
    } catch { /* retry */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`fresh built server did not become ready: ${url}`);
}

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, BASE_URL], { cwd: process.cwd(), stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
  });
}

const server = spawn(process.execPath, ['dist/server.cjs'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'production', APP_BASE_PATH: '/gaze', PORT },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => process.stdout.write(`[built:4175] ${chunk}`));
server.stderr.on('data', chunk => process.stderr.write(`[built:4175] ${chunk}`));

try {
  await waitFor(BASE_URL);
  console.log(`\nIsolated fresh build ready at ${BASE_URL}`);
  await run('scripts/smoke-layout.mjs');
  await run('scripts/smoke-validity.mjs');
  console.log(`\nBoth smoke suites passed against isolated port ${PORT}.`);
} finally {
  server.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3_000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

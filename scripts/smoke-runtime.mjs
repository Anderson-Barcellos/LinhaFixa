import net from 'node:net';

const RESULT_PREFIX = 'SMOKE_RESULT ';

export async function assertPortFree({ host, port, label, timeoutMs = 750 }) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = callback => {
      if (settled) return;
      settled = true;
      socket.destroy();
      callback();
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(() => reject(new Error(`${label} port ${host}:${port} is already occupied; refusing to use a stale listener`))));
    socket.once('timeout', () => finish(resolve));
    socket.once('error', error => {
      if (error.code === 'ECONNREFUSED' || error.code === 'EHOSTUNREACH') finish(resolve);
      else finish(() => reject(error));
    });
  });
}

export function observeChild(child, { label, forward = true, prefix = '' }) {
  const output = { stdout: '', stderr: '' };
  const append = (stream, chunk) => {
    const text = chunk.toString();
    output[stream] += text;
    if (forward) (stream === 'stdout' ? process.stdout : process.stderr).write(prefix ? `${prefix}${text}` : text);
  };
  child.stdout?.on('data', chunk => append('stdout', chunk));
  child.stderr?.on('data', chunk => append('stderr', chunk));
  const exited = new Promise(resolve => {
    child.once('error', error => resolve({ code: null, signal: null, error }));
    child.once('exit', (code, signal) => resolve({ code, signal, error: null }));
  });
  return { child, label, output, exited };
}

export async function waitForOwnedHttp({ observed, url, isReady, timeoutMs = 20_000, requestTimeoutMs = 1_000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const outcome = await Promise.race([
      fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) })
        .then(response => isReady(response))
        .catch(() => false)
        .then(ready => ({ type: 'readiness', ready })),
      observed.exited.then(exit => ({ type: 'exit', exit })),
    ]);
    if (outcome.type === 'exit') throw exitedBeforeReadiness(observed, outcome.exit, url);
    if (outcome.ready) {
      const ownership = await Promise.race([
        observed.exited.then(exit => ({ type: 'exit', exit })),
        delay(25).then(() => ({ type: 'alive' })),
      ]);
      if (ownership.type === 'exit' || observed.child.exitCode !== null) {
        throw exitedBeforeReadiness(observed, ownership.exit ?? { code: observed.child.exitCode, signal: observed.child.signalCode }, url);
      }
      return;
    }
    const pause = await Promise.race([
      observed.exited.then(exit => ({ type: 'exit', exit })),
      delay(125).then(() => ({ type: 'retry' })),
    ]);
    if (pause.type === 'exit') throw exitedBeforeReadiness(observed, pause.exit, url);
  }
  throw new Error(`${observed.label} did not become ready at ${url} within ${timeoutMs}ms${capturedOutput(observed)}`);
}

export async function terminateObserved(observed, timeoutMs = 3_000) {
  if (!observed || observed.child.exitCode !== null || observed.child.signalCode !== null) return;
  observed.child.kill('SIGTERM');
  const result = await Promise.race([
    observed.exited.then(() => 'exited'),
    delay(timeoutMs).then(() => 'timeout'),
  ]);
  if (result === 'timeout' && observed.child.exitCode === null) observed.child.kill('SIGKILL');
}

export function parseSmokeResult(output) {
  const marker = output.split(/\r?\n/).filter(line => line.startsWith(RESULT_PREFIX)).at(-1);
  if (!marker) throw new Error('smoke child exited without a structured SMOKE_RESULT marker');
  const result = JSON.parse(marker.slice(RESULT_PREFIX.length));
  if (
    typeof result.suite !== 'string'
    || !Number.isSafeInteger(result.assertionsPassed)
    || !Number.isSafeInteger(result.assertionsTotal)
    || !Number.isSafeInteger(result.blockedRequiredCapabilities)
    || !Array.isArray(result.blockedCapabilityNames)
  ) throw new Error('invalid structured SMOKE_RESULT marker');
  return result;
}

export function smokeResultMarker(result) {
  return `${RESULT_PREFIX}${JSON.stringify(result)}`;
}

export function formatSmokeSummary(results) {
  const blockedCount = results.reduce((sum, result) => sum + result.blockedRequiredCapabilities, 0);
  const blockedNames = [...new Set(results.flatMap(result => result.blockedCapabilityNames))];
  const suites = results.map(result => `${result.suite} ${result.assertionsPassed}/${result.assertionsTotal}`).join('; ');
  return `Smoke assertions passed: ${suites}; ${blockedCount} required ${blockedCount === 1 ? 'capability' : 'capabilities'} BLOCKED${blockedNames.length ? ` (${blockedNames.join(', ')})` : ''}.`;
}

function exitedBeforeReadiness(observed, exit, url) {
  const status = exit?.error
    ? `with error ${exit.error.message}`
    : `with code ${String(exit?.code)}${exit?.signal ? ` signal ${exit.signal}` : ''}`;
  return new Error(`${observed.label} exited ${status} before readiness at ${url}${capturedOutput(observed)}`);
}

function capturedOutput(observed) {
  const text = `${observed.output.stdout}${observed.output.stderr}`.trim();
  return text ? `\nCaptured output:\n${text.slice(-4_000)}` : '';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

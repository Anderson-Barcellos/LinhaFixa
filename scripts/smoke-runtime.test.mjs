import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import test from 'node:test';

import {
  assertPortFree,
  formatSmokeSummary,
  observeChild,
  parseSmokeResult,
  waitForOwnedHttp,
} from './smoke-runtime.mjs';

test('assertPortFree refuses a listener that already owns the requested port', async () => {
  const server = http.createServer((_request, response) => response.end('stale'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await assert.rejects(
      assertPortFree({ host: '127.0.0.1', port: address.port, label: 'fixture' }),
      /fixture.*already occupied/i,
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('waitForOwnedHttp rejects child exit before readiness and includes captured output', async () => {
  const child = spawn(process.execPath, ['-e', "console.error('boom-before-ready'); process.exit(23)"] , {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const observed = observeChild(child, { label: 'early-child', forward: false });
  await assert.rejects(
    waitForOwnedHttp({
      observed,
      url: 'http://127.0.0.1:9/never',
      isReady: async () => false,
      timeoutMs: 2_000,
    }),
    /early-child exited.*23[\s\S]*boom-before-ready/i,
  );
});

test('parseSmokeResult and formatSmokeSummary preserve required blocked capabilities', () => {
  const layout = parseSmokeResult('noise\nSMOKE_RESULT {"suite":"layout","assertionsPassed":87,"assertionsTotal":87,"blockedRequiredCapabilities":1,"blockedCapabilityNames":["real-tab-hidden"]}\n');
  const validity = parseSmokeResult('SMOKE_RESULT {"suite":"validity","assertionsPassed":48,"assertionsTotal":48,"blockedRequiredCapabilities":0,"blockedCapabilityNames":[]}');
  assert.equal(layout.blockedRequiredCapabilities, 1);
  assert.equal(
    formatSmokeSummary([layout, validity]),
    'Smoke assertions passed: layout 87/87; validity 48/48; 1 required capability BLOCKED (real-tab-hidden).',
  );
});

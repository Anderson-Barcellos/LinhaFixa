import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

import { MEDIAPIPE_PUBLIC_ROOT } from '../config/mediapipe-assets.mjs';
import { HTML_CACHE_CONTROL, IMMUTABLE_CACHE_CONTROL } from '../config/static-cache.mjs';
import { smokeResultMarker } from './smoke-runtime.mjs';

const BASE_URL = (process.argv[2] ?? 'http://localhost:3060/gaze').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const manifest = JSON.parse(await readFile(resolve('dist/.vite/manifest.json'), 'utf8'));

const chunkFile = source => {
  const record = manifest[source];
  if (!record?.file) throw new Error(`Missing Vite manifest source ${source}`);
  return `/${record.file}`;
};

const dashboardChunk = chunkFile('src/screens/DashboardScreen.tsx');
const diagnosticChunk = chunkFile('src/screens/EyeTrackingTestScreen.tsx');
const playerChunk = chunkFile('src/screens/ExercisePlayerScreen.tsx');
const entryChunk = chunkFile('index.html');
const mediaPipeRecord = Object.values(manifest).find(record => (
  record?.src?.includes('node_modules/@mediapipe/tasks-vision/vision_bundle.mjs')
));
if (!mediaPipeRecord?.file) {
  throw new Error('Missing Vite manifest record for node_modules/@mediapipe/tasks-vision/vision_bundle.mjs');
}
const mediaPipeChunk = `/${mediaPipeRecord.file}`;
const modelPath = `/${MEDIAPIPE_PUBLIC_ROOT}/face_landmarker.task`;
const wasmRoot = `/${MEDIAPIPE_PUBLIC_ROOT}/wasm/`;

let checks = 0;
const failures = [];

function check(scope, label, ok, detail = '') {
  checks += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`[${scope}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function hasPath(paths, suffix) {
  return paths.some(pathname => pathname.endsWith(suffix));
}

function hasWasm(paths) {
  return paths.some(pathname => pathname.includes(wasmRoot) && pathname.endsWith('.wasm'));
}

async function waitUntil(predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function acceptConsent(page) {
  await page.goto(`${BASE_URL}/consent`, { waitUntil: 'networkidle' });
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.waitForURL(url => url.pathname.replace(/\/$/, '').endsWith('/gaze'));
  await page.getByRole('heading', { name: 'Linha Fixa' }).waitFor({ state: 'visible' });
}

async function cameraRequests(page) {
  return page.evaluate(() => window.__gazeSmoke.cameraRequests());
}

async function assertCacheHeader(request, scope, label, path, expected) {
  const response = await request.get(new URL(path.replace(/^\//, ''), `${BASE_URL}/`).href);
  check(scope, `${label} responde 2xx`, response.ok(), `status=${response.status()}`);
  check(
    scope,
    `${label} usa cache-control exato`,
    response.headers()['cache-control'] === expected,
    response.headers()['cache-control'] ?? '(ausente)',
  );
}

console.log(`\nAdaptive loading smoke (${BASE_URL})`);
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  await context.addInitScript(() => {
    const idleCallbacks = new Map();
    let nextIdleId = 1;
    let cameraRequestsCount = 0;
    window.requestIdleCallback = callback => {
      const id = nextIdleId++;
      idleCallbacks.set(id, callback);
      return id;
    };
    window.cancelIdleCallback = id => { idleCallbacks.delete(id); };
    window.__gazeSmoke = {
      releaseIdle() {
        const pending = [...idleCallbacks.values()];
        idleCallbacks.clear();
        pending.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 }));
      },
      cameraRequests: () => cameraRequestsCount,
    };
    navigator.mediaDevices.getUserMedia = async () => {
      cameraRequestsCount += 1;
      throw new Error('camera must not be requested during preload smoke');
    };
  });

  const page = await context.newPage();
  const appOrigin = new URL(BASE_URL).origin;
  const localPaths = [];
  const externalMediaPipeRequests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === appOrigin) localPaths.push(url.pathname);
    else if (/mediapipe|face_landmarker|tasks-vision/i.test(url.href)) externalMediaPipeRequests.push(url.href);
  });

  try {
    await acceptConsent(page);

    check('before-idle', 'Dashboard ainda não foi solicitado', !hasPath(localPaths, dashboardChunk));
    check('before-idle', 'runtime MediaPipe ainda não foi solicitado', !hasPath(localPaths, mediaPipeChunk));
    check('before-idle', 'modelo ainda não foi solicitado', !hasPath(localPaths, modelPath));
    check('before-idle', 'WASM ainda não foi solicitado', !hasWasm(localPaths));
    check('before-idle', 'permissão de câmera ainda não foi solicitada', await cameraRequests(page) === 0);

    await page.evaluate(() => window.__gazeSmoke.releaseIdle());
    await waitUntil(
      () => hasPath(localPaths, diagnosticChunk) && hasPath(localPaths, playerChunk),
      'camera route chunks after idle',
    );
    check('after-idle', 'chunk do diagnóstico foi pré-carregado', hasPath(localPaths, diagnosticChunk));
    check('after-idle', 'chunk do player foi pré-carregado', hasPath(localPaths, playerChunk));
    check('after-idle', 'runtime MediaPipe continua adiado', !hasPath(localPaths, mediaPipeChunk));
    check('after-idle', 'modelo continua adiado', !hasPath(localPaths, modelPath));
    check('after-idle', 'WASM continua adiado', !hasWasm(localPaths));
    check('after-idle', 'preload não pede permissão de câmera', await cameraRequests(page) === 0);

    const diagnosticButton = page.getByRole('button', { name: /Diagnóstico de rastreamento/ });
    await diagnosticButton.dispatchEvent('pointerdown', { pointerType: 'mouse', button: 0, bubbles: true });
    await waitUntil(
      () => hasPath(localPaths, mediaPipeChunk) && hasPath(localPaths, modelPath) && hasWasm(localPaths),
      'versioned MediaPipe runtime, model and WASM after camera intent',
      25_000,
    );
    check('intent', 'pointerdown carrega runtime MediaPipe', hasPath(localPaths, mediaPipeChunk));
    check('intent', 'pointerdown carrega modelo versionado', hasPath(localPaths, modelPath));
    check('intent', 'pointerdown carrega WASM versionado', hasWasm(localPaths));
    check('intent', 'pointerdown sem click não navega', new URL(page.url()).pathname.replace(/\/$/, '').endsWith('/gaze'));
    check('intent', 'intenção não pede permissão de câmera', await cameraRequests(page) === 0);

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    check('dashboard', 'Dashboard/Recharts carrega apenas ao abrir a rota', hasPath(localPaths, dashboardChunk));

    await assertCacheHeader(context.request, 'cache', 'HTML', '/', HTML_CACHE_CONTROL);
    await assertCacheHeader(context.request, 'cache', 'asset com hash', entryChunk, IMMUTABLE_CACHE_CONTROL);
    await assertCacheHeader(context.request, 'cache', 'modelo versionado', modelPath, IMMUTABLE_CACHE_CONTROL);
    check('privacy', 'nenhuma dependência MediaPipe externa foi solicitada', externalMediaPipeRequests.length === 0, externalMediaPipeRequests.join(' | '));
  } catch (error) {
    check('loading', 'suite completa sem erro inesperado', false, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}

const result = {
  suite: 'loading',
  assertionsPassed: checks - failures.length,
  assertionsTotal: checks,
  blockedRequiredCapabilities: 0,
  blockedCapabilityNames: [],
};
console.log(`\n${result.assertionsPassed}/${result.assertionsTotal} loading assertions passed; 0 required capabilities BLOCKED`);
console.log(smokeResultMarker(result));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

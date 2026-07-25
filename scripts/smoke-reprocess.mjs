// Integration check for the analyser-version lift.
//
// The unit tests prove reprocessCapture() is correct as a function. This proves
// the thing that actually matters: a capture recorded by the OLD analyser, sitting
// in a real IndexedDB, is re-measured when the app boots — and that the original
// measurement survives in legacyMetrics.
//
// Requires system Chrome, same as the other smokes. No camera is needed: the
// capture is seeded directly into IndexedDB.

import { chromium } from 'playwright';
import { smokeResultMarker } from './smoke-runtime.mjs';

const BASE_URL = (process.argv[2] ?? 'http://localhost:3060/gaze').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

const failures = [];
let checks = 0;

function check(label, ok, detail = '') {
  checks++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

// A 240ms plateau trio: three fixations, two saccades. Recorded here as if the
// old detector had measured it, with deliberately wrong aggregates.
function seedCapture() {
  const samples = [];
  for (const [i, h] of [0.20, 0.45, 0.70].entries()) {
    const t0 = i * 260;
    for (let t = 0; t <= 240; t += 20) samples.push({ t: t0 + t, h, v: 0.5 });
  }
  return {
    id: 'smoke-legacy-capture',
    timestamp: Date.now(),
    conditions: { lighting: 'good', posture: 'seated', distanceCm: 40 },
    coverage: 95,
    calibrated: true,
    // No analyzerVersion: this is exactly how a pre-lift record looks.
    metrics: {
      trackingAvailable: true,
      samplesValid: samples.length,
      signalSource: 'calibrated-mediapipe',
      sampleRateHz: 50,
      saccadeCount: 99,
      regressionCount: 7,
      lineReturnCount: 3,
      meanSaccadeAmplitude: 0.123,
      meanFixationMs: 42,
    },
    postural: {},
    axis: {},
    sampleCount: samples.length,
    samples,
  };
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const context = await browser.newContext();
  const page = await context.newPage();

  // First load: establishes the origin so IndexedDB can be written to.
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });

  const seeded = await page.evaluate(async capture => {
    const open = indexedDB.open('linhafixa_db', 3);
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onupgradeneeded = () => {
        const d = open.result;
        if (!d.objectStoreNames.contains('profile')) d.createObjectStore('profile');
        if (!d.objectStoreNames.contains('consent')) d.createObjectStore('consent');
        if (!d.objectStoreNames.contains('sessions')) {
          d.createObjectStore('sessions', { keyPath: 'id' }).createIndex('by-date', 'timestamp');
        }
        if (!d.objectStoreNames.contains('validationCaptures')) {
          d.createObjectStore('validationCaptures', { keyPath: 'id' }).createIndex('by-date', 'timestamp');
        }
        if (!d.objectStoreNames.contains('recallTests')) {
          d.createObjectStore('recallTests', { keyPath: 'id' }).createIndex('by-date', 'timestamp');
        }
      };
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['validationCaptures', 'consent'], 'readwrite');
      tx.objectStore('validationCaptures').put(capture);
      // Consent must exist or the app parks on the consent screen and never boots.
      tx.objectStore('consent').put({ acceptedAt: Date.now() }, 'status');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  }, seedCapture());

  check('captura legada semeada no IndexedDB', seeded === true);

  // Second load: the app boots and should lift the capture.
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });

  // waitForFunction hands back a JSHandle, and an async callback makes that a
  // handle to a pending Promise — so poll with evaluate, which awaits properly.
  const readCapture = () => page.evaluate(async () => {
    const open = indexedDB.open('linhafixa_db', 3);
    const db = await new Promise(resolve => { open.onsuccess = () => resolve(open.result); });
    const capture = await new Promise(resolve => {
      const req = db.transaction('validationCaptures').objectStore('validationCaptures').get('smoke-legacy-capture');
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return capture ?? null;
  });

  let result = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    result = await readCapture();
    if (result?.metrics?.analyzerVersion) break;
    await page.waitForTimeout(500);
  }

  check('captura foi remedida no boot', result?.metrics?.analyzerVersion === 2,
    `analyzerVersion=${result?.metrics?.analyzerVersion}`);
  check('contagem legada foi substituída pela medida real', result?.metrics?.saccadeCount === 2,
    `saccadeCount=${result?.metrics?.saccadeCount} (era 99)`);
  check('duração de fixação remedida', Math.round(result?.metrics?.meanFixationMs ?? 0) === 240,
    `meanFixationMs=${result?.metrics?.meanFixationMs} (era 42)`);
  check('métricas originais preservadas em legacyMetrics', result?.legacyMetrics?.saccadeCount === 99,
    `legacyMetrics.saccadeCount=${result?.legacyMetrics?.saccadeCount}`);
  check('sinal bruto intocado', Array.isArray(result?.samples) && result.samples.length === 39,
    `samples=${result?.samples?.length}`);

  // Third load: idempotence on real data — nothing is re-archived.
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const afterSecondBoot = await page.evaluate(async () => {
    const open = indexedDB.open('linhafixa_db', 3);
    const db = await new Promise(resolve => { open.onsuccess = () => resolve(open.result); });
    const capture = await new Promise(resolve => {
      const req = db.transaction('validationCaptures').objectStore('validationCaptures').get('smoke-legacy-capture');
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return capture;
  });

  check('reprocessamento é idempotente entre boots',
    afterSecondBoot?.legacyMetrics?.saccadeCount === 99 && afterSecondBoot?.metrics?.saccadeCount === 2,
    `legacy=${afterSecondBoot?.legacyMetrics?.saccadeCount} atual=${afterSecondBoot?.metrics?.saccadeCount}`);

  await context.close();
} finally {
  await browser.close();
}

console.log(smokeResultMarker({
  suite: 'reprocess',
  assertionsPassed: checks - failures.length,
  assertionsTotal: checks,
  blockedRequiredCapabilities: 0,
  blockedCapabilityNames: [],
}));

if (failures.length) {
  console.error(`\n${failures.length} falha(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} verificações de reprocessamento passaram.`);

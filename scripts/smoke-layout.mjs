// Scripted layout/pipeline smoke for the diagnostics screen.
//
// Replaces the ad-hoc Playwright pokes we ran after every deploy with one
// repeatable gate. For each viewport profile it walks consent → diagnostics,
// then asserts the invariants that have actually regressed in the past:
// layout mode per device, camera preview/badge visibility, card alignment
// inside the panel ("cartão estreitando"), reading-surface geometry, no
// external CDN requests, and (camera profiles) calibration overlay geometry
// with the dot inside the marked surface.
//
// Usage: node scripts/smoke-layout.mjs [baseUrl]
//   baseUrl defaults to http://localhost:3060/gaze (the deployed service).
//
// Requires system Chrome — no playwright browser download. The camera is faked
// by replacing getUserMedia with a canvas.captureStream() at document init:
// Chrome's --use-fake-device-for-media-capture stopped registering devices in
// headless 149, and the injected stream is deterministic across versions while
// still exercising attachStream/videoFrameLoop/MediaPipe with real frames.

import { chromium } from 'playwright';

const BASE_URL = (process.argv[2] ?? 'http://localhost:3060/gaze').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

const VIEWPORTS = [
  { name: 'iphone-portrait', width: 390, height: 844, touch: true, expectDesktopPanel: false, checkCalibration: true },
  { name: 'iphone-landscape', width: 844, height: 390, touch: true, expectDesktopPanel: false, checkCalibration: false },
  { name: 'desktop', width: 1440, height: 860, touch: false, expectDesktopPanel: true, checkCalibration: true },
  // Vertical monitor (Anders' desktop): the reading surface must fill the column
  // instead of collapsing into the landscape 16:9 strip.
  { name: 'desktop-portrait', width: 1077, height: 1436, touch: false, expectDesktopPanel: true, checkCalibration: false, expectPortraitSurface: true },
];

const failures = [];
let checks = 0;

function check(scope, label, ok, detail = '') {
  checks++;
  const line = `${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!ok) failures.push(`[${scope}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function acceptConsent(page) {
  await page.goto(`${BASE_URL}/consent`, { waitUntil: 'networkidle' });
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.waitForURL(/\/(gaze\/?)?$/, { timeout: 10_000 });
}

// The panel rows we align-check: direct children of <aside>, with wrappers that
// have no box of their own (display:contents, and the desktop scroll section
// whose -mr-4 makes it intentionally wider) replaced by their children.
async function panelRows(page) {
  return page.evaluate(() => {
    const aside = document.querySelector('aside');
    if (!aside) return null;
    const rows = [];
    for (const el of aside.children) {
      const style = getComputedStyle(el);
      const isWrapper = style.display === 'contents' || style.overflowY === 'auto';
      const targets = isWrapper ? [...el.children] : [el];
      for (const t of targets) {
        const r = t.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) rows.push({ left: r.left, right: r.right, tag: t.tagName });
      }
    }
    const asideRect = aside.getBoundingClientRect();
    return { rows, aside: { x: asideRect.x, y: asideRect.y, width: asideRect.width, height: asideRect.height } };
  });
}

async function runViewport(browser, profile) {
  console.log(`\n▸ ${profile.name} (${profile.width}×${profile.height}${profile.touch ? ', touch' : ''})`);
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    hasTouch: profile.touch,
    deviceScaleFactor: profile.touch ? 3 : 1,
    permissions: ['camera'],
  });
  // Deterministic fake camera: a continuously repainted canvas stream.
  await context.addInitScript(() => {
    let stream = null;
    const makeStream = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      let tick = 0;
      setInterval(() => {
        tick++;
        ctx.fillStyle = `hsl(${tick % 360}, 40%, 35%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }, 33);
      return canvas.captureStream(30);
    };
    navigator.mediaDevices.getUserMedia = async () => (stream ??= makeStream());
    navigator.mediaDevices.enumerateDevices = async () => [
      { kind: 'videoinput', deviceId: 'fake-cam', groupId: 'fake', label: 'Smoke canvas camera', toJSON() { return this; } },
    ];
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    // MediaPipe routes INFO/WARNING glog lines through console.error.
    if (msg.type() === 'error' && !/^(INFO|WARNING|I\d{4}|W\d{4}):?\s/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(String(err)));
  // Inter via Google Fonts is a known, accepted external; the invariant exists
  // to catch MediaPipe (or anything else) silently reaching for a CDN again.
  const ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const externalRequests = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (!ALLOWED_HOSTS.includes(url.hostname)) externalRequests.push(req.url());
  });

  try {
    await acceptConsent(page);
    await page.goto(`${BASE_URL}/eye-tracking-test`, { waitUntil: 'networkidle' });

    // --- Layout mode and reading surface ---
    const surfaceChip = page.getByText('Área fixa de leitura e calibração');
    check(profile.name, 'moldura da área de leitura visível', await surfaceChip.isVisible());

    const canvasBox = await page.locator('canvas').first().boundingBox();
    check(profile.name, 'canvas com área não nula', !!canvasBox && canvasBox.width > 100 && canvasBox.height > 100,
      canvasBox ? `${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)}` : 'ausente');

    if (profile.expectPortraitSurface) {
      check(profile.name, 'superfície portrait ocupa a coluna (mais alta que larga)',
        !!canvasBox && canvasBox.height > canvasBox.width,
        canvasBox ? `${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)}` : 'ausente');
    }

    const panel = await panelRows(page);
    check(profile.name, 'painel de diagnóstico presente', !!panel);
    if (panel) {
      const sidePanel = panel.aside.x > profile.width * 0.6 && panel.aside.width < profile.width * 0.4;
      check(profile.name, profile.expectDesktopPanel ? 'painel lateral (desktop)' : 'painel empilhado (compacto)',
        profile.expectDesktopPanel ? sidePanel : !sidePanel,
        `aside x=${Math.round(panel.aside.x)} w=${Math.round(panel.aside.width)}`);

      // Card alignment: every visible row shares the same left/right edges.
      const lefts = panel.rows.map(r => r.left);
      const rights = panel.rows.map(r => r.right);
      const spreadL = Math.max(...lefts) - Math.min(...lefts);
      const spreadR = Math.max(...rights) - Math.min(...rights);
      check(profile.name, 'cartões do painel alinhados (sem estreitamento)', spreadL <= 1.5 && spreadR <= 1.5,
        `spread esq=${spreadL.toFixed(1)}px dir=${spreadR.toFixed(1)}px em ${panel.rows.length} fileiras`);
    }

    // --- Camera preview and px badge: desktop-only elements ---
    const previewVisible = await page.getByText('sem vídeo', { exact: true }).isVisible().catch(() => false);
    check(profile.name, profile.expectDesktopPanel ? 'preview de câmera presente (desktop)' : 'preview de câmera oculto (compacto)',
      previewVisible === profile.expectDesktopPanel);

    const badgeVisible = await page.getByText(/^\d+×\d+ px$/).isVisible().catch(() => false);
    check(profile.name, profile.expectDesktopPanel ? 'selo de dimensão presente (desktop)' : 'selo de dimensão oculto (compacto)',
      badgeVisible === profile.expectDesktopPanel);

    // --- Camera + calibration overlay (fake device) ---
    if (profile.checkCalibration) {
      await page.getByRole('button', { name: 'Iniciar câmera + sensores' }).click();
      const cameraChip = page.getByText('Câmera', { exact: true });
      await cameraChip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
      check(profile.name, 'câmera fake ativa (chip "Câmera")', await cameraChip.isVisible().catch(() => false));

      await page.getByRole('button', { name: 'Calibrar' }).click();
      const calibrating = page.getByText('Calibrando posição do olhar');
      // MediaPipe init (local wasm + model) can take a few seconds on first hit.
      await calibrating.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
      const overlayUp = await calibrating.isVisible().catch(() => false);
      check(profile.name, 'overlay de calibração ativo', overlayUp);

      if (overlayUp) {
        const frame = await page.getByText('Área calibrada do teste').locator('..').boundingBox();
        const dot = await page.locator('.animate-ping').locator('..').boundingBox();
        const dotInside = !!(frame && dot &&
          dot.x + dot.width / 2 >= frame.x - 1 && dot.x + dot.width / 2 <= frame.x + frame.width + 1 &&
          dot.y + dot.height / 2 >= frame.y - 1 && dot.y + dot.height / 2 <= frame.y + frame.height + 1);
        check(profile.name, 'ponto de calibração dentro da área marcada', dotInside,
          frame && dot ? `dot(${Math.round(dot.x)},${Math.round(dot.y)}) frame(${Math.round(frame.x)},${Math.round(frame.y)},${Math.round(frame.width)}×${Math.round(frame.height)})` : 'geometria indisponível');
        check(profile.name, 'moldura de calibração dentro do viewport',
          !!frame && frame.x >= -1 && frame.y >= -1 &&
          frame.x + frame.width <= profile.width + 1 && frame.y + frame.height <= profile.height + 1);
      }
      await page.getByText('Pular calibração').click().catch(() => {});
    }

    // --- Hygiene ---
    check(profile.name, 'sem requests externos (CDN)', externalRequests.length === 0,
      externalRequests.slice(0, 3).join(', '));
    check(profile.name, 'sem erros de console', consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | '));
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-fake-ui-for-media-capture',
    '--use-fake-device-for-media-capture',
  ],
});

try {
  for (const profile of VIEWPORTS) await runViewport(browser, profile);
} finally {
  await browser.close();
}

console.log(`\n${checks - failures.length}/${checks} checks OK`);
if (failures.length) {
  console.error('\nFALHAS:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

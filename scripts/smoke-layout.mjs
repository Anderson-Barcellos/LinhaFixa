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
import { MEDIAPIPE_PUBLIC_ROOT } from '../config/mediapipe-assets.mjs';
import { smokeResultMarker } from './smoke-runtime.mjs';

const BASE_URL = (process.argv[2] ?? 'http://localhost:3060/gaze').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const MEDIAPIPE_PATH = `/${MEDIAPIPE_PUBLIC_ROOT}`;

const VIEWPORTS = [
  { name: 'iphone-portrait', width: 390, height: 844, touch: true, expectDesktopPanel: false, drawer: 'sheet', checkCalibration: true },
  { name: 'iphone-landscape', width: 844, height: 390, touch: true, expectDesktopPanel: false, drawer: 'side', checkCalibration: true },
  { name: 'desktop', width: 1440, height: 860, touch: false, expectDesktopPanel: true, checkCalibration: true, checkLifecycle: true },
  // Vertical monitor (Anders' desktop): the reading surface must fill the column
  // instead of collapsing into the landscape 16:9 strip.
  { name: 'desktop-portrait', width: 1077, height: 1436, touch: false, expectDesktopPanel: true, checkCalibration: true, expectPortraitSurface: true },
];

const failures = [];
let checks = 0;
let blockedRequiredCapabilities = 0;
const blockedCapabilityNames = [];

function check(scope, label, ok, detail = '') {
  checks++;
  const line = `${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!ok) failures.push(`[${scope}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function requiredAssetExpectation(pathname) {
  if (/\/assets\/.*\.js$/.test(pathname)) return { key: 'script', mime: /^(?:application|text)\/javascript(?:;|$)/i };
  if (/\/assets\/.*\.css$/.test(pathname)) return { key: 'styles', mime: /^text\/css(?:;|$)/i };
  if (pathname.endsWith(`${MEDIAPIPE_PATH}/face_landmarker.task`)) {
    return { key: 'mediapipeModel', mime: /^application\/octet-stream(?:;|$)/i };
  }
  if (pathname.includes(`${MEDIAPIPE_PATH}/wasm/`) && pathname.endsWith('.wasm')) {
    return { key: 'mediapipeWasm', mime: /^application\/wasm(?:;|$)/i };
  }
  return null;
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
  await context.route('**/api/generateReadingContent', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ text: 'Texto determinístico para validar a captura ocular sem depender de serviços externos.' }),
  }));
  await context.tracing.start({ screenshots: true, snapshots: true });
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
    if (
      (msg.type() === 'error' || msg.type() === 'warning')
      && !/^(INFO|WARNING|I\d{4}|W\d{4}):?\s/.test(msg.text())
      && !/GL Driver Message .*GPU stall due to ReadPixels/.test(msg.text())
    ) consoleErrors.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', err => consoleErrors.push(String(err)));
  // Inter via Google Fonts is a known, accepted external; the invariant exists
  // to catch MediaPipe (or anything else) silently reaching for a CDN again.
  const ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  const externalRequests = [];
  const resourceIssues = [];
  const optionalThirdPartyIssues = [];
  const requiredAssets = { script: false, styles: false, mediapipeModel: false, mediapipeWasm: false };
  const requiredAssetValidations = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (!ALLOWED_HOSTS.includes(url.hostname)) externalRequests.push(req.url());
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    const failure = request.failure()?.errorText ?? 'request failed';
    const detail = `${url.pathname}: ${failure}`;
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') resourceIssues.push(detail);
    else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') optionalThirdPartyIssues.push(`Google Fonts optional — ${detail}`);
    else resourceIssues.push(`unexpected third-party failure ${url.href}: ${detail}`);
  });
  page.on('response', response => {
    const url = new URL(response.url());
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    const expectation = local ? requiredAssetExpectation(url.pathname) : null;
    if (expectation && response.ok()) {
      requiredAssetValidations.push((async () => {
        const finishError = await response.finished();
        const contentType = response.headers()['content-type'] ?? '';
        if (finishError) {
          resourceIssues.push(`${url.pathname}: ${finishError.message}`);
        } else if (!expectation.mime.test(contentType)) {
          resourceIssues.push(`${url.pathname}: unexpected content-type ${contentType || '(missing)'}`);
        } else {
          requiredAssets[expectation.key] = true;
        }
      })());
    }
    if (response.status() < 400) return;
    const detail = `${response.status()} ${url.href}`;
    if (local) resourceIssues.push(detail);
    else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') optionalThirdPartyIssues.push(`Google Fonts optional — ${detail}`);
    else resourceIssues.push(`unexpected third-party response ${detail}`);
  });

  try {
    await acceptConsent(page);
    await Promise.all([
      page.waitForURL(/\/eye-tracking-test$/),
      page.getByRole('button', { name: /Diagnóstico de rastreamento/ }).click(),
    ]);

    // --- Layout mode and reading surface ---
    const surfaceChip = page.getByText('Área fixa de leitura e calibração');
    const surfaceReady = await surfaceChip.waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true, () => false);
    check(profile.name, 'moldura da área de leitura visível', surfaceReady);

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
      if (profile.drawer === 'sheet') {
        check(profile.name, 'gaveta sheet colapsada no rodapé (faixa fina, largura total)',
          panel.aside.y > profile.height * 0.7 && panel.aside.width > profile.width * 0.9 && panel.aside.height < 120,
          `aside y=${Math.round(panel.aside.y)} w=${Math.round(panel.aside.width)} h=${Math.round(panel.aside.height)}`);
      } else if (profile.drawer === 'side') {
        check(profile.name, 'gaveta side colapsada à direita (coluna fina, altura total)',
          panel.aside.x > profile.width * 0.8 && panel.aside.width < 80 && panel.aside.height > profile.height * 0.7,
          `aside x=${Math.round(panel.aside.x)} w=${Math.round(panel.aside.width)} h=${Math.round(panel.aside.height)}`);
      } else {
        const sidePanel = panel.aside.x > profile.width * 0.6 && panel.aside.width < profile.width * 0.4;
        check(profile.name, 'painel lateral (desktop)', sidePanel,
          `aside x=${Math.round(panel.aside.x)} w=${Math.round(panel.aside.width)}`);

        // Card alignment: every visible row shares the same left/right edges.
        const lefts = panel.rows.map(r => r.left);
        const rights = panel.rows.map(r => r.right);
        const spreadL = Math.max(...lefts) - Math.min(...lefts);
        const spreadR = Math.max(...rights) - Math.min(...rights);
        check(profile.name, 'cartões do painel alinhados (sem estreitamento)', spreadL <= 1.5 && spreadR <= 1.5,
          `spread esq=${spreadL.toFixed(1)}px dir=${spreadR.toFixed(1)}px em ${panel.rows.length} fileiras`);
      }
    }

    // --- Drawer: expand/collapse must never move the reading surface (overlay, not reflow) ---
    if (profile.drawer) {
      const canvasBefore = await page.locator('canvas').first().boundingBox();
      await page.getByRole('button', { name: 'Expandir diagnóstico' }).click();
      const drawerPanel = page.getByTestId('drawer-panel');
      await drawerPanel.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
      const panelBox = await drawerPanel.boundingBox();
      check(profile.name, 'painel expandido visível', !!panelBox && panelBox.height > 100 && panelBox.width > 100,
        panelBox ? `${Math.round(panelBox.width)}×${Math.round(panelBox.height)}` : 'ausente');

      const canvasAfter = await page.locator('canvas').first().boundingBox();
      const stable = !!(canvasBefore && canvasAfter &&
        Math.abs(canvasBefore.x - canvasAfter.x) <= 1 && Math.abs(canvasBefore.y - canvasAfter.y) <= 1 &&
        Math.abs(canvasBefore.width - canvasAfter.width) <= 1 && Math.abs(canvasBefore.height - canvasAfter.height) <= 1);
      check(profile.name, 'superfície estável com gaveta expandida (overlay, não reflow)', stable,
        canvasBefore && canvasAfter ? `antes ${Math.round(canvasBefore.width)}×${Math.round(canvasBefore.height)} depois ${Math.round(canvasAfter.width)}×${Math.round(canvasAfter.height)}` : 'geometria indisponível');

      // Card alignment inside the expanded panel (the mobile "cartão estreitando").
      const spread = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="drawer-panel"]');
        if (!p) return null;
        const rows = [...p.children].map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
        if (!rows.length) return null;
        const lefts = rows.map(r => r.left);
        const rights = rows.map(r => r.right);
        return { l: Math.max(...lefts) - Math.min(...lefts), r: Math.max(...rights) - Math.min(...rights), n: rows.length };
      });
      check(profile.name, 'cartões da gaveta alinhados', !!spread && spread.l <= 1.5 && spread.r <= 1.5,
        spread ? `spread esq=${spread.l.toFixed(1)}px dir=${spread.r.toFixed(1)}px em ${spread.n} fileiras` : 'painel não medido');

      // --- Acordeão (D2): um card aberto por vez; toques não movem a superfície ---
      const metricsHeader = page.getByTestId('accordion-metrics');
      const signalHeader = page.getByTestId('accordion-signal');
      check(profile.name, 'acordeão começa todo colapsado',
        await metricsHeader.getAttribute('aria-expanded') === 'false' &&
        await signalHeader.getAttribute('aria-expanded') === 'false');

      await metricsHeader.click();
      check(profile.name, 'toque abre só o card tocado',
        await metricsHeader.getAttribute('aria-expanded') === 'true' &&
        await signalHeader.getAttribute('aria-expanded') === 'false');

      await signalHeader.click();
      check(profile.name, 'abrir outro card fecha o anterior',
        await signalHeader.getAttribute('aria-expanded') === 'true' &&
        await metricsHeader.getAttribute('aria-expanded') === 'false');

      await signalHeader.click();
      check(profile.name, 'tocar no card aberto fecha tudo',
        await signalHeader.getAttribute('aria-expanded') === 'false' &&
        await metricsHeader.getAttribute('aria-expanded') === 'false');

      const canvasAfterAccordion = await page.locator('canvas').first().boundingBox();
      const accordionStable = !!(canvasBefore && canvasAfterAccordion &&
        Math.abs(canvasBefore.x - canvasAfterAccordion.x) <= 1 &&
        Math.abs(canvasBefore.y - canvasAfterAccordion.y) <= 1 &&
        Math.abs(canvasBefore.width - canvasAfterAccordion.width) <= 1 &&
        Math.abs(canvasBefore.height - canvasAfterAccordion.height) <= 1);
      check(profile.name, 'superfície estável durante toques no acordeão', accordionStable,
        canvasAfterAccordion ? `${Math.round(canvasAfterAccordion.width)}×${Math.round(canvasAfterAccordion.height)}` : 'geometria indisponível');

      await page.getByRole('button', { name: 'Recolher diagnóstico' }).click();
      await drawerPanel.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
      check(profile.name, 'gaveta recolhe de volta', !(await drawerPanel.isVisible().catch(() => false)));
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
      const cameraChip = profile.drawer === 'side'
        ? page.getByLabel('Câmera', { exact: true })
        : page.getByText('Câmera', { exact: true });
      await cameraChip.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
      check(profile.name, 'câmera fake ativa (chip "Câmera")', await cameraChip.isVisible().catch(() => false));

      await page.getByRole('button', { name: 'Calibrar' }).click();
      // The frame exists in both chrome modes; the "Calibrando..." headline is
      // desktop-only now (mobile shows the single-line guide instead).
      const calibrating = page.getByTestId('calibration-frame');
      // MediaPipe init (local wasm + model) can take a few seconds on first hit.
      await calibrating.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
      const overlayUp = await calibrating.isVisible().catch(() => false);
      check(profile.name, 'overlay de calibração ativo', overlayUp);

      if (overlayUp) {
        // The badge text is hidden on mobile (compactChrome), so the frame is
        // located by testid instead of by its former label.
        const frame = await page.getByTestId('calibration-frame').boundingBox();
        const dot = await page.locator('.animate-ping').locator('..').boundingBox();
        const dotInside = !!(frame && dot &&
          dot.x + dot.width / 2 >= frame.x - 1 && dot.x + dot.width / 2 <= frame.x + frame.width + 1 &&
          dot.y + dot.height / 2 >= frame.y - 1 && dot.y + dot.height / 2 <= frame.y + frame.height + 1);
        check(profile.name, 'ponto de calibração dentro da área marcada', dotInside,
          frame && dot ? `dot(${Math.round(dot.x)},${Math.round(dot.y)}) frame(${Math.round(frame.x)},${Math.round(frame.y)},${Math.round(frame.width)}×${Math.round(frame.height)})` : 'geometria indisponível');
        check(profile.name, 'moldura de calibração dentro do viewport',
          !!frame && frame.x >= -1 && frame.y >= -1 &&
          frame.x + frame.width <= profile.width + 1 && frame.y + frame.height <= profile.height + 1);

        // Chrome per mode: badge/headline on desktop, single-line guide on mobile.
        const calibBadge = await page.getByText('Área calibrada do teste').isVisible().catch(() => false);
        check(profile.name, profile.expectDesktopPanel ? 'badge de calibração presente (desktop)' : 'badge de calibração oculto (compacto)',
          calibBadge === profile.expectDesktopPanel);
        const compactGuide = await page.getByText(/^Olhe para o ponto azul · \d+\/\d+$/).isVisible().catch(() => false);
        check(profile.name, profile.expectDesktopPanel ? 'guia compacto ausente (desktop)' : 'guia de uma linha presente (compacto)',
          compactGuide !== profile.expectDesktopPanel);
      }
      const rejected = page.getByRole('heading', { name: 'Calibração não aceita' });
      await rejected.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
      check(profile.name, 'amostras insuficientes terminam em rejeição finita', await rejected.isVisible().catch(() => false));
      check(profile.name, 'rejeição oferece nova tentativa sem reiniciar em loop',
        await page.getByRole('button', { name: 'Tentar novamente' }).isVisible().catch(() => false));
      await page.getByRole('button', { name: 'Continuar sem calibração' }).click().catch(() => {});
      await page.getByText('Área fixa de leitura e calibração').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    }

    if (profile.checkLifecycle) {
      const startCapture = page.getByRole('button', { name: 'Iniciar captura de leitura' });
      await startCapture.click();
      const register = page.getByRole('button', { name: 'Registrar e iniciar captura' });
      if (await register.isVisible().catch(() => false)) await register.click();
      await page.getByRole('button', { name: 'Terminei de ler' }).waitFor({ state: 'visible', timeout: 5_000 });

      const secondTab = await context.newPage();
      await secondTab.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await secondTab.bringToFront();
      await secondTab.waitForTimeout(300);
      const hiddenState = await page.evaluate(() => document.visibilityState);
      if (hiddenState === 'hidden') {
        check(profile.name, 'segunda aba oculta a captura com visibilityState real', true, hiddenState);
        await page.bringToFront();
        await page.getByText('Captura não utilizável — a página perdeu visibilidade').waitFor({ state: 'visible', timeout: 5_000 });
        check(profile.name, 'ocultação interrompe captura automaticamente', true);
        await page.getByRole('button', { name: 'Fechar' }).click();
        await startCapture.click();
      } else {
        console.warn(`  ⚠ SKIP/BLOCKED real-tab-hidden unavailable — capture=${hiddenState}, second=${await secondTab.evaluate(() => document.visibilityState)}`);
        blockedRequiredCapabilities += 1;
        blockedCapabilityNames.push('real-tab-hidden');
        await page.bringToFront();
      }
      await secondTab.close();

      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      await page.getByText('Captura não utilizável — a página perdeu visibilidade').waitFor({ state: 'visible', timeout: 5_000 });
      check(profile.name, 'pagehide separado interrompe e invalida a captura',
        await page.getByText('Inválida', { exact: true }).isVisible());
      await page.getByRole('button', { name: 'Fechar' }).click();
      check(profile.name, 'retorno não retoma nem concatena a captura interrompida',
        !(await page.getByRole('button', { name: 'Terminei de ler' }).isVisible().catch(() => false)));
    }

    // --- Hygiene ---
    await Promise.all(requiredAssetValidations);
    check(profile.name, 'sem requests externos (CDN)', externalRequests.length === 0,
      externalRequests.slice(0, 3).join(', '));
    check(profile.name, 'sem erros de console', consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | '));
    check(profile.name, 'sem falhas HTTP locais ou assets quebrados', resourceIssues.length === 0,
      resourceIssues.slice(0, 3).join(' | '));
    check(profile.name, 'JS, CSS e MediaPipe locais carregados',
      Object.values(requiredAssets).every(Boolean),
      Object.entries(requiredAssets).map(([name, loaded]) => `${name}=${loaded}`).join(' '));
    if (optionalThirdPartyIssues.length) {
      console.warn(`  ⚠ opcional nominal: ${optionalThirdPartyIssues.slice(0, 2).join(' | ')}`);
    }
  } finally {
    await page.screenshot({ path: `/tmp/gaze-smoke-layout-${profile.name}.png`, fullPage: false }).catch(() => {});
    await context.tracing.stop({ path: `/tmp/gaze-smoke-layout-${profile.name}.zip` }).catch(() => {});
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

const result = {
  suite: 'layout',
  assertionsPassed: checks - failures.length,
  assertionsTotal: checks,
  blockedRequiredCapabilities,
  blockedCapabilityNames,
};
console.log(`\n${result.assertionsPassed}/${result.assertionsTotal} layout assertions passed; ${blockedRequiredCapabilities} required ${blockedRequiredCapabilities === 1 ? 'capability' : 'capabilities'} BLOCKED`);
console.log(smokeResultMarker(result));
if (failures.length) {
  console.error('\nFALHAS:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

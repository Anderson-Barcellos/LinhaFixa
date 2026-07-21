import { chromium } from 'playwright';
import { smokeResultMarker } from './smoke-runtime.mjs';

const BASE_URL = (process.argv[2] ?? 'http://127.0.0.1:3060/gaze').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const VIEWPORTS = [
  { name: 'phone-small', width: 320, height: 568, touch: true, chrome: 'bottom', columns: 'stack' },
  { name: 'phone', width: 390, height: 844, touch: true, chrome: 'bottom', columns: 'stack' },
  { name: 'tablet', width: 834, height: 1194, touch: true, chrome: 'rail', columns: 'stack' },
  { name: 'compact-desktop', width: 1024, height: 768, touch: false, chrome: 'rail', columns: 'stack' },
  { name: 'desktop', width: 1366, height: 768, touch: false, chrome: 'sidebar', columns: 'side' },
  { name: 'desktop-large', width: 1440, height: 1024, touch: false, chrome: 'sidebar', columns: 'side' },
];

const failures = [];
let checks = 0;

function check(scope, label, condition, detail = '') {
  checks += 1;
  console.log(`  ${condition ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(`[${scope}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function acceptConsent(page) {
  await page.goto(`${BASE_URL}/consent`, { waitUntil: 'networkidle' });
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.waitForURL(/\/assessment(?:\?|$)/);
  await page.getByTestId('experiment-notebook').waitFor();
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  for (const profile of VIEWPORTS) {
    console.log(`\n▸ ${profile.name} (${profile.width}×${profile.height})`);
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      hasTouch: profile.touch,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });

    try {
      await acceptConsent(page);

      const labels = await page.locator('nav[aria-label="Navegação principal"] a').allTextContents();
      check(
        profile.name,
        'four primary destinations',
        ['Hoje', 'Sessões', 'Progresso', 'Ajustes'].every(label => labels.some(text => text.includes(label))),
      );
      check(
        profile.name,
        'notebook has no horizontal overflow',
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      );
      check(
        profile.name,
        'post-consent notebook starts at the top',
        await page.evaluate(() => window.scrollY <= 1),
        `scrollY=${await page.evaluate(() => Math.round(window.scrollY))}`,
      );

      const current = await page.getByTestId('current-series-card').boundingBox();
      const recent = await page.getByTestId('recent-sessions-card').boundingBox();
      check(profile.name, 'current and recent cards rendered', Boolean(current && recent));
      if (current && recent) {
        check(
          profile.name,
          `notebook composition is ${profile.columns}`,
          profile.columns === 'side'
            ? Math.abs(current.y - recent.y) <= 2 && recent.x > current.x
            : recent.y > current.y,
          `current=(${Math.round(current.x)},${Math.round(current.y)}) recent=(${Math.round(recent.x)},${Math.round(recent.y)})`,
        );
      }

      const nav = await page.locator('nav[aria-label="Navegação principal"]').boundingBox();
      check(
        profile.name,
        `responsive chrome is ${profile.chrome}`,
        Boolean(nav) && (
          profile.chrome === 'bottom'
            ? nav.y + nav.height >= profile.height - 4
            : profile.chrome === 'rail'
              ? nav.x < 160 && nav.width < 150
              : nav.x < 280 && nav.width < 280
        ),
        nav ? `x=${Math.round(nav.x)} y=${Math.round(nav.y)} w=${Math.round(nav.width)} h=${Math.round(nav.height)}` : 'nav ausente',
      );

      await page.getByRole('button', { name: 'Nova sessão' }).click();
      const dialog = page.getByRole('dialog', { name: 'Preparar nova sessão' });
      await dialog.waitFor();
      check(
        profile.name,
        'launcher keeps both real assessment modes',
        await dialog.getByRole('button', { name: /captura simples/i }).isVisible()
          && await dialog.getByRole('button', { name: /ler e responder/i }).isVisible(),
      );
      const closeButton = dialog.getByRole('button', { name: /fechar/i });
      const closeBox = await closeButton.boundingBox();
      check(
        profile.name,
        'launcher close control stays inside the viewport',
        Boolean(closeBox)
          && closeBox.y >= 0
          && closeBox.y + closeBox.height <= profile.height,
        closeBox ? `y=${Math.round(closeBox.y)} h=${Math.round(closeBox.height)}` : 'controle ausente',
      );
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      check(profile.name, 'render has no runtime errors', errors.length === 0, errors.join(' | '));
    } catch (error) {
      check(profile.name, 'viewport flow completes', false, error instanceof Error ? error.message : String(error));
    } finally {
      await context.close();
    }
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await context.newPage();
  try {
    await acceptConsent(page);
    await page.getByRole('button', { name: 'Biblioteca' }).click();
    await page.getByRole('heading', { name: 'Biblioteca', exact: true }).waitFor();
    for (const name of ['Fixação', 'Sacadas', 'Perseguição suave', 'Leitura assistida']) {
      check('capabilities', `library exposes ${name}`, await page.getByText(name, { exact: true }).count() > 0);
    }
    for (const route of [
      { path: '/player', heading: 'Contexto de hoje' },
      { path: '/history', heading: 'Sessões' },
      { path: '/dashboard', heading: 'Progresso' },
      { path: '/statistics', heading: 'Progresso' },
      { path: '/settings', heading: 'Ajustes & Perfil' },
    ]) {
      const response = await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: route.heading, exact: true }).waitFor();
      check('capabilities', `${route.path} route is preserved`, response?.status() === 200);
    }
  } catch (error) {
    check('capabilities', 'preserved capability flow completes', false, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error('\nNotebook V2 smoke failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
}

console.log(smokeResultMarker({
  suite: 'notebook-v2',
  assertionsPassed: checks - failures.length,
  assertionsTotal: checks,
  blockedRequiredCapabilities: 0,
  blockedCapabilityNames: [],
}));

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  assertPortFree,
  observeChild,
  smokeResultMarker,
  terminateObserved,
  waitForOwnedHttp,
} from './smoke-runtime.mjs';

const BUILD_BASE_URL = (process.argv[2] ?? '').replace(/\/$/, '');
if (!BUILD_BASE_URL) throw new Error('smoke-validity requires the exact built base URL');
const FIXTURE_URL = 'http://127.0.0.1:4176/scripts/fixtures/validity-states.html';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 860, touch: false },
  { name: 'desktop-portrait', width: 1077, height: 1436, touch: false },
  { name: 'iphone-portrait', width: 390, height: 844, touch: true },
  { name: 'iphone-landscape', width: 844, height: 390, touch: true },
];

let checks = 0;
const failures = [];
function check(scope, label, ok, detail = '') {
  checks += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`[${scope}] ${label}${detail ? ` — ${detail}` : ''}`);
}

await assertPortFree({ host: '127.0.0.1', port: 4176, label: 'validity fixture server' });
let vite = null;

try {
  vite = observeChild(spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4176', '--strictPort'], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, APP_BASE_PATH: '/' },
  }), { label: 'validity fixture server', forward: false });
  await waitForOwnedHttp({
    observed: vite,
    url: FIXTURE_URL,
    isReady: async response => response.ok && (await response.text()).includes('Gaze validity component smoke'),
  });
  console.log(`\nValidity component smoke (real components; build identity ${BUILD_BASE_URL})`);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const profile of VIEWPORTS) {
      console.log(`\n▸ ${profile.name} (${profile.width}×${profile.height})`);
      const context = await browser.newContext({ viewport: profile, hasTouch: profile.touch, deviceScaleFactor: profile.touch ? 3 : 1 });
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      const consoleIssues = [];
      const resourceIssues = [];
      const optionalThirdPartyIssues = [];
      const requiredAssets = { script: false, styles: false };
      page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') consoleIssues.push(`${msg.type()}: ${msg.text()}`);
      });
      page.on('pageerror', error => consoleIssues.push(String(error)));
      page.on('requestfailed', request => {
        const url = new URL(request.url());
        const detail = `${url.pathname}: ${request.failure()?.errorText ?? 'request failed'}`;
        if (url.hostname === '127.0.0.1' && url.port === '4176') resourceIssues.push(detail);
        else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') optionalThirdPartyIssues.push(`Google Fonts optional — ${detail}`);
        else resourceIssues.push(`unexpected third-party failure ${url.href}: ${detail}`);
      });
      page.on('response', response => {
        const url = new URL(response.url());
        const local = url.hostname === '127.0.0.1' && url.port === '4176';
        if (local && response.ok()) {
          if (/\.(?:tsx|jsx|js|mjs)$/.test(url.pathname)) requiredAssets.script = true;
          if (/\.css$/.test(url.pathname)) requiredAssets.styles = true;
        }
        if (response.status() < 400) return;
        const detail = `${response.status()} ${url.href}`;
        if (local) resourceIssues.push(detail);
        else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') optionalThirdPartyIssues.push(`Google Fonts optional — ${detail}`);
        else resourceIssues.push(`unexpected third-party response ${detail}`);
      });
      try {
        await page.goto(FIXTURE_URL, { waitUntil: 'networkidle' });
        check(profile.name, 'identidade da fixture real', (await page.title()) === 'Gaze validity component smoke');
        check(profile.name, 'página não está em branco', await page.getByText('Esta calibração não combina com a tela atual').isVisible());
        check(profile.name, 'sem overlay de framework', !(await page.locator('vite-error-overlay').isVisible().catch(() => false)));
        await page.getByRole('button', { name: 'Continuar em modo bruto' }).click();
        check(profile.name, 'interação do prompt real responde', await page.getByTestId('fixture-action').getByText('ação: modo-bruto').isVisible());
        check(profile.name, 'prompt de mismatch sem clipping horizontal', await page.evaluate(() => (
          [...document.querySelectorAll('[data-testid="fixture-mismatch"] *')].every(node => {
            const box = node.getBoundingClientRect();
            return box.left >= -1 && box.right <= document.documentElement.clientWidth + 1;
          })
        )));

        for (const state of ['comparable', 'exploratory', 'invalid']) {
          await page.locator(`button[data-state="${state}"]`).click();
          const fixture = page.getByTestId(`fixture-${state}`);
          await fixture.waitFor({ state: 'visible' });
          const expected = state === 'comparable' ? 'Comparável' : state === 'exploratory' ? 'Exploratória' : 'Inválida';
          check(profile.name, `selo ${expected} renderiza`, await fixture.getByText(expected, { exact: true }).isVisible());
          const geometry = await fixture.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const overflowing = [...element.querySelectorAll('*')].some(node => {
              const box = node.getBoundingClientRect();
              return box.right > document.documentElement.clientWidth + 1 || box.left < -1;
            });
            return { width: rect.width, overflowing };
          });
          check(profile.name, `${expected} sem clipping horizontal`, geometry.width > 0 && !geometry.overflowing);
        }
        check(profile.name, 'console sem erros/warnings relevantes', consoleIssues.length === 0, consoleIssues.slice(0, 3).join(' | '));
        check(profile.name, 'sem falhas HTTP locais ou assets quebrados', resourceIssues.length === 0, resourceIssues.slice(0, 3).join(' | '));
        check(profile.name, 'entry TSX e CSS reais carregados', requiredAssets.script && requiredAssets.styles,
          `script=${requiredAssets.script} css=${requiredAssets.styles}`);
        if (optionalThirdPartyIssues.length) {
          console.warn(`  ⚠ opcional nominal: ${optionalThirdPartyIssues.slice(0, 2).join(' | ')}`);
        }
      } finally {
        await page.screenshot({ path: `/tmp/gaze-smoke-validity-${profile.name}.png`, fullPage: true }).catch(() => {});
        await context.tracing.stop({ path: `/tmp/gaze-smoke-validity-${profile.name}.zip` }).catch(() => {});
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  await terminateObserved(vite);
}

const result = {
  suite: 'validity',
  assertionsPassed: checks - failures.length,
  assertionsTotal: checks,
  blockedRequiredCapabilities: 0,
  blockedCapabilityNames: [],
};
console.log(`\n${result.assertionsPassed}/${result.assertionsTotal} validity assertions passed; 0 required capabilities BLOCKED`);
console.log(smokeResultMarker(result));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

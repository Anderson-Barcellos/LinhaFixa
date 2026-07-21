import { chromium } from 'playwright';

import { smokeResultMarker } from './smoke-runtime.mjs';

const BASE_URL = (process.argv[2] ?? 'http://127.0.0.1:3060/gaze').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

let assertionsTotal = 0;
let assertionsPassed = 0;
const failures = [];

function check(label, condition, detail = '') {
  assertionsTotal += 1;
  if (condition) {
    assertionsPassed += 1;
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  const message = `${label}${detail ? ` — ${detail}` : ''}`;
  failures.push(message);
  console.log(`  ✗ ${message}`);
}

async function acceptConsent(page) {
  await page.goto(`${BASE_URL}/consent`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.waitForURL(/\/assessment(?:\?|$)/, { timeout: 10_000 });
}

async function openWorkspace(page) {
  await page.route('**/api/generateReadingContent', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ text: 'Texto determinístico para validar a orientação da sessão.' }),
  }));
  await acceptConsent(page);
  await page.goto(`${BASE_URL}/assessment?workspace=live&mode=capture&quality=exploratory`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('Área fixa de leitura e calibração').waitFor({ timeout: 10_000 });
}

function watchConsole(page) {
  const issues = [];
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') issues.push(message.text());
  });
  page.on('pageerror', error => issues.push(String(error)));
  return issues;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  console.log('\n▸ iPhone portrait → landscape → portrait');
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  const phonePage = await phoneContext.newPage();
  const phoneConsoleIssues = watchConsole(phonePage);
  await openWorkspace(phonePage);

  check('portrait starts with the real measurement surface', await phonePage.locator('canvas').first().isVisible());
  await phonePage.setViewportSize({ width: 844, height: 390 });
  const portraitGate = phonePage.getByTestId('phone-portrait-gate');
  const gateVisible = await portraitGate.waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true, () => false);
  check('phone landscape is replaced by the portrait gate', gateVisible);
  await phonePage.waitForTimeout(350);

  const phoneLandscape = await phonePage.evaluate(() => {
    const measurement = document.querySelector('[data-testid="measurement-viewport"]')?.getBoundingClientRect();
    const gate = document.querySelector('[data-testid="phone-portrait-gate"]')?.getBoundingClientRect();
    return {
      measurementHeight: measurement?.height ?? null,
      gate: gate ? { x: gate.x, y: gate.y, width: gate.width, height: gate.height } : null,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      canvasCount: document.querySelectorAll('canvas').length,
    };
  });
  check(
    'rotation replaces the frozen portrait height with the landscape visual height',
    phoneLandscape.measurementHeight !== null && phoneLandscape.measurementHeight <= phoneLandscape.innerHeight + 1,
    `${phoneLandscape.measurementHeight} / ${phoneLandscape.innerHeight}`,
  );
  check(
    'phone landscape has no vertical document scroll',
    phoneLandscape.documentHeight <= phoneLandscape.innerHeight + 1,
    `${phoneLandscape.documentHeight} / ${phoneLandscape.innerHeight}`,
  );
  check('the measurement canvas is not offered in phone landscape', phoneLandscape.canvasCount === 0);
  check(
    'the portrait gate stays entirely inside the phone viewport',
    Boolean(phoneLandscape.gate)
      && phoneLandscape.gate.x >= -1
      && phoneLandscape.gate.y >= -1
      && phoneLandscape.gate.x + phoneLandscape.gate.width <= phoneLandscape.innerWidth + 1
      && phoneLandscape.gate.y + phoneLandscape.gate.height <= phoneLandscape.innerHeight + 1,
  );
  await phonePage.screenshot({ path: '/tmp/gaze-phone-landscape-portrait-gate.png', fullPage: false });

  await phonePage.setViewportSize({ width: 390, height: 844 });
  await phonePage.getByText('Área fixa de leitura e calibração').waitFor({ timeout: 3_000 });
  check('returning to portrait resumes the same measurement engine', await phonePage.locator('canvas').first().isVisible());
  check('portrait gate disappears after rotation back', !(await portraitGate.isVisible().catch(() => false)));
  check('phone flow has no console errors or warnings', phoneConsoleIssues.length === 0, phoneConsoleIssues.slice(0, 2).join(' | '));
  await phoneContext.close();

  console.log('\n▸ iPad portrait → landscape');
  const tabletContext = await browser.newContext({
    viewport: { width: 834, height: 1194 },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const tabletPage = await tabletContext.newPage();
  const tabletConsoleIssues = watchConsole(tabletPage);
  await openWorkspace(tabletPage);
  await tabletPage.setViewportSize({ width: 1194, height: 834 });
  await tabletPage.waitForTimeout(350);
  const tabletLandscape = await tabletPage.evaluate(() => ({
    measurementHeight: document.querySelector('[data-testid="measurement-viewport"]')?.getBoundingClientRect().height ?? null,
    innerHeight: window.innerHeight,
    documentHeight: document.documentElement.scrollHeight,
  }));
  check('tablet landscape keeps the real measurement engine', await tabletPage.locator('canvas').first().isVisible());
  check('tablet landscape never receives the phone portrait gate', await tabletPage.getByTestId('phone-portrait-gate').count() === 0);
  check(
    'tablet rotation also refreshes the measurement viewport height',
    tabletLandscape.measurementHeight !== null && tabletLandscape.measurementHeight <= tabletLandscape.innerHeight + 1,
    `${tabletLandscape.measurementHeight} / ${tabletLandscape.innerHeight}`,
  );
  check(
    'tablet landscape has no vertical document scroll',
    tabletLandscape.documentHeight <= tabletLandscape.innerHeight + 1,
    `${tabletLandscape.documentHeight} / ${tabletLandscape.innerHeight}`,
  );
  check('tablet flow has no console errors or warnings', tabletConsoleIssues.length === 0, tabletConsoleIssues.slice(0, 2).join(' | '));
  await tabletPage.screenshot({ path: '/tmp/gaze-tablet-landscape-engine.png', fullPage: false });
  await tabletContext.close();

  if (failures.length > 0) {
    console.error('\nPhone portrait smoke failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }

  console.log(smokeResultMarker({
    suite: 'phone-portrait',
    assertionsPassed,
    assertionsTotal,
    blockedRequiredCapabilities: 0,
    blockedCapabilityNames: [],
  }));
} finally {
  await browser.close();
}

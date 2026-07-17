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
  await page.goto(`${BASE_URL}/consent`, { waitUntil: 'networkidle' });
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.waitForURL(/\/assessment(?:\?|$)/, { timeout: 10_000 });
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  await acceptConsent(page);

  console.log(`\n▸ post-consent entrypoint`);
  const heading = page.getByRole('heading', { name: 'Avaliacao', exact: true });
  await heading.waitFor();
  check('consent opens the new assessment shell', await heading.isVisible());
  check('consent leaves the legacy home out of the flow', await page.getByText('Sessão Guiada do Dia').count() === 0);
  check('post-consent URL belongs to assessment', /\/assessment(?:\?|$)/.test(page.url()), page.url());

  console.log(`\n▸ assessment route`);
  await page.goto(`${BASE_URL}/assessment`, { waitUntil: 'networkidle' });
  const primaryAction = page.getByRole('button', { name: /ler e responder|iniciar captura/i });
  await heading.waitFor();
  await primaryAction.waitFor();
  check('assessment heading rendered', await heading.isVisible());
  check('assessment primary action rendered', await primaryAction.isVisible());

  console.log(`\n▸ legacy alias route`);
  await page.goto(`${BASE_URL}/eye-tracking-test`, { waitUntil: 'networkidle' });
  await heading.waitFor();
  check('legacy alias resolves to assessment heading', await heading.isVisible());
  check('legacy alias stays under /assessment family', /\/assessment(?:\?|$)/.test(page.url()), page.url());

  if (failures.length > 0) {
    console.error('\nAssessment workflow smoke failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }

  console.log(
    smokeResultMarker({
      suite: 'assessment-workflow',
      assertionsPassed,
      assertionsTotal,
      blockedRequiredCapabilities: 0,
      blockedCapabilityNames: [],
    }),
  );
} finally {
  await browser.close();
}

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
  const notebook = page.getByTestId('experiment-notebook');
  await notebook.waitFor();
  check('consent opens the experimental notebook', await notebook.isVisible());
  check('consent leaves the legacy home out of the flow', await page.getByText('Sessão Guiada do Dia').count() === 0);
  check('post-consent URL belongs to assessment', /\/assessment(?:\?|$)/.test(page.url()), page.url());

  console.log(`\n▸ assessment route`);
  await page.goto(`${BASE_URL}/assessment`, { waitUntil: 'networkidle' });
  const primaryAction = page.getByRole('button', { name: 'Nova sessão' });
  await notebook.waitFor();
  await primaryAction.waitFor();
  check('assessment notebook rendered', await notebook.isVisible());
  check('assessment primary action rendered', await primaryAction.isVisible());
  await primaryAction.click();
  const launcher = page.getByRole('dialog', { name: 'Preparar nova sessão' });
  await launcher.waitFor();
  check(
    'assessment launcher preserves both modes',
    await launcher.getByRole('button', { name: 'Captura simples' }).isVisible()
      && await launcher.getByRole('button', { name: 'Ler e responder' }).isVisible(),
  );

  console.log(`\n▸ legacy alias route`);
  await page.goto(`${BASE_URL}/eye-tracking-test`, { waitUntil: 'networkidle' });
  // O workspace embedded tem header único com o título do estágio da sessão
  // (o eyebrow "Avaliacao" saiu junto com o chrome duplicado — BUNDLE Layout Mobile).
  const stageHeading = page.getByRole('heading', {
    name: /sessao pronta para iniciar|verificando prontidão|calibração necessária|validando sinal|sessão pronta|preparando leitura|leitura guiada|captura em andamento|gerando questionário|questionário de recall|resultado da sessão/i,
  }).first();
  await stageHeading.waitFor();
  check('legacy alias resolves to assessment stage heading', await stageHeading.isVisible());
  check('legacy alias stays under /assessment family', /\/assessment(?:\?|$)/.test(page.url()), page.url());
  check('legacy alias renders the fixed measurement viewport', await page.getByTestId('measurement-viewport').isVisible());

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SECTIONS } from './appSections.ts';

test('nenhuma seção aponta pra rota-redirect "/"', () => {
  // "/" redireciona pra /assessment — uma aba apontando pra lá duplica a aba
  // Avaliação e quebra o estado ativo do sidebar.
  const hrefs: string[] = APP_SECTIONS.map(s => s.href);
  assert.equal(hrefs.includes('/'), false);
});

test('hrefs das seções são únicos', () => {
  const hrefs: string[] = APP_SECTIONS.map(s => s.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

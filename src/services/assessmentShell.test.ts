import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_SECTIONS } from './appSections.ts';

test('APP_SECTIONS exposes Avaliacao as a first-class shell section', () => {
  assert.equal(
    APP_SECTIONS.some(section => section.id === 'assessment' && section.href === '/assessment'),
    true,
  );
});

test('APP_SECTIONS keeps Historico in the IA while marking it unavailable in the shell', () => {
  const historySection = APP_SECTIONS.find(section => section.id === 'history');

  assert.deepEqual(historySection, {
    id: 'history',
    label: 'Historico',
    href: '/dashboard?tab=history',
    available: false,
  });
});

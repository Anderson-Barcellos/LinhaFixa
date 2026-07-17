import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_SECTIONS } from './appSections.ts';

test('APP_SECTIONS exposes Avaliacao as a first-class shell section', () => {
  assert.equal(
    APP_SECTIONS.some(section => section.id === 'assessment' && section.href === '/assessment'),
    true,
  );
});

test('APP_SECTIONS exposes Historico as a real shell route distinct from Progresso', () => {
  const historySection = APP_SECTIONS.find(section => section.id === 'history');
  const progressSection = APP_SECTIONS.find(section => section.id === 'progress');

  assert.deepEqual(historySection, {
    id: 'history',
    label: 'Historico',
    href: '/history',
    available: true,
  });
  assert.notEqual(historySection?.href, progressSection?.href);
});

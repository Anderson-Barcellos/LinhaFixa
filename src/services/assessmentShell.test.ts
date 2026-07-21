import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_SECTIONS } from './appSections.ts';

test('the shell contract is Today, Sessions, Progress and Settings', () => {
  assert.deepEqual(APP_SECTIONS, [
    { id: 'today', label: 'Hoje', href: '/assessment', available: true },
    { id: 'sessions', label: 'Sessões', href: '/history', available: true },
    { id: 'progress', label: 'Progresso', href: '/dashboard', available: true },
    { id: 'settings', label: 'Ajustes', href: '/settings', available: true },
  ]);
  assert.equal(APP_SECTIONS.some(section => String(section.href) === '/library'), false);
  assert.equal(APP_SECTIONS.some(section => String(section.href) === '/player'), false);
});

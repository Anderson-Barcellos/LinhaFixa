import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SECTIONS } from './appSections.ts';

test('primary navigation exposes the four experimental notebook destinations', () => {
  assert.deepEqual(APP_SECTIONS, [
    { id: 'today', label: 'Hoje', href: '/assessment', available: true },
    { id: 'sessions', label: 'Sessões', href: '/history', available: true },
    { id: 'progress', label: 'Progresso', href: '/dashboard', available: true },
    { id: 'settings', label: 'Ajustes', href: '/settings', available: true },
  ]);
});

test('library and player remain tools instead of duplicate primary destinations', () => {
  assert.equal(APP_SECTIONS.some(section => String(section.href) === '/library'), false);
  assert.equal(APP_SECTIONS.some(section => String(section.href) === '/player'), false);
});

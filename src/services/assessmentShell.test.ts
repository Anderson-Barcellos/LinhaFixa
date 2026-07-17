import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_SECTIONS } from './appSections.ts';

test('APP_SECTIONS exposes Avaliacao as a first-class shell section', () => {
  assert.equal(
    APP_SECTIONS.some(section => section.id === 'assessment' && section.href === '/assessment'),
    true,
  );
});

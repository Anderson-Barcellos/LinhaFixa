import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, THEME_STORAGE_KEY } from './theme';

test('stored value wins over system preference', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
});

test('falls back to system preference when nothing stored', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
});

test('ignores garbage in storage', () => {
  assert.equal(resolveTheme('blue', true), 'dark');
});

test('storage key is stable', () => {
  assert.equal(THEME_STORAGE_KEY, 'linhafixa_theme');
});

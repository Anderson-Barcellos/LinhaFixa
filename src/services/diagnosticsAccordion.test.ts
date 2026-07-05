import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleSection } from './diagnosticsAccordion';

test('abre seção a partir de tudo fechado', () => {
  assert.equal(toggleSection(null, 'metrics'), 'metrics');
});

test('abrir outra seção fecha a anterior (um aberto por vez)', () => {
  assert.equal(toggleSection('metrics', 'signal'), 'signal');
});

test('tocar na seção aberta fecha tudo', () => {
  assert.equal(toggleSection('signal', 'signal'), null);
});

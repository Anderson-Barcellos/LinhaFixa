import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawerLayout } from './diagnosticsDrawerLayout';

test('sheet: faixa fica no fluxo e painel expande como overlay para cima', () => {
  const collapsed = drawerLayout('sheet', false);
  const expanded = drawerLayout('sheet', true);
  assert.ok(!collapsed.root.includes('absolute'), 'root no fluxo flex, não overlay');
  assert.ok(collapsed.strip.includes('min-h-[56px]'));
  assert.ok(expanded.panel.includes('absolute'), 'painel é overlay');
  assert.ok(expanded.panel.includes('bottom-full'), 'painel abre para cima da faixa');
  assert.ok(expanded.panel.includes('max-h-[60vh]'));
  assert.ok(expanded.panel.includes('overflow-y-auto'));
});

test('side: coluna fina no fluxo e painel de 320px desliza da direita', () => {
  const collapsed = drawerLayout('side', false);
  const expanded = drawerLayout('side', true);
  assert.ok(!collapsed.root.includes('absolute'));
  assert.ok(collapsed.strip.includes('w-12'), 'coluna colapsada ~48px');
  assert.ok(expanded.panel.includes('absolute'));
  assert.ok(expanded.panel.includes('right-full'), 'painel abre por cima da superfície, à esquerda da coluna');
  assert.ok(expanded.panel.includes('w-80'), 'painel de ~320px');
});

test('invariante de geometria: root e strip não mudam com expanded', () => {
  for (const variant of ['sheet', 'side'] as const) {
    assert.equal(drawerLayout(variant, false).root, drawerLayout(variant, true).root);
    assert.equal(drawerLayout(variant, false).strip, drawerLayout(variant, true).strip);
  }
});

test('panelOpen espelha expanded', () => {
  assert.equal(drawerLayout('sheet', false).panelOpen, false);
  assert.equal(drawerLayout('side', true).panelOpen, true);
});

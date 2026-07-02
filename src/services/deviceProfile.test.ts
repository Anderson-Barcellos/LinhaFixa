import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnosticsLayoutMode } from './deviceProfile';

test('diagnostics layout keeps iPhone landscape in compact mode', () => {
  assert.equal(diagnosticsLayoutMode({ viewportWidth: 932, hasTouch: true }), 'compact');
});

test('diagnostics layout uses desktop mode only for wide non-touch viewports', () => {
  assert.equal(diagnosticsLayoutMode({ viewportWidth: 1023, hasTouch: false }), 'compact');
  assert.equal(diagnosticsLayoutMode({ viewportWidth: 1280, hasTouch: false }), 'desktop');
});

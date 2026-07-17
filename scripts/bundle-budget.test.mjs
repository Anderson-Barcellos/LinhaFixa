import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertBundleBudget,
  collectInitialJavaScript,
  measureInitialGzipBytes,
} from './bundle-budget.mjs';

const manifest = {
  'index.html': {
    file: 'assets/entry.js',
    isEntry: true,
    imports: ['_shared.js'],
    dynamicImports: ['src/screens/DashboardScreen.tsx'],
  },
  '_shared.js': { file: 'assets/shared.js', imports: [] },
  'src/screens/DashboardScreen.tsx': {
    file: 'assets/dashboard.js',
    isDynamicEntry: true,
  },
};

test('collectInitialJavaScript follows static imports and excludes dynamic routes', () => {
  assert.deepEqual(collectInitialJavaScript(manifest), [
    'assets/entry.js',
    'assets/shared.js',
  ]);
});

test('measureInitialGzipBytes measures every initial file once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gaze-budget-'));
  await mkdir(join(root, '.vite'), { recursive: true });
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, '.vite/manifest.json'), JSON.stringify(manifest));
  await writeFile(join(root, 'assets/entry.js'), 'entry'.repeat(200));
  await writeFile(join(root, 'assets/shared.js'), 'shared'.repeat(200));
  await writeFile(join(root, 'assets/dashboard.js'), 'dashboard'.repeat(10_000));
  const result = await measureInitialGzipBytes({
    manifestPath: join(root, '.vite/manifest.json'),
    distDir: root,
  });
  assert.deepEqual(result.files, ['assets/entry.js', 'assets/shared.js']);
  assert.ok(result.bytes > 0);
  assert.ok(result.bytes < 1_000);
});

test('assertBundleBudget fails above the exact byte ceiling', () => {
  assert.doesNotThrow(() => assertBundleBudget(180_000, 180_000));
  assert.throws(
    () => assertBundleBudget(180_001, 180_000),
    /180001.*exceeds.*180000/i,
  );
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  MEDIAPIPE_ASSET_VERSION,
  MEDIAPIPE_PUBLIC_ROOT,
} from '../config/mediapipe-assets.mjs';
import {
  HTML_CACHE_CONTROL,
  IMMUTABLE_CACHE_CONTROL,
} from '../config/static-cache.mjs';

test('MediaPipe public version matches the pinned dependency', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(MEDIAPIPE_ASSET_VERSION, pkg.dependencies['@mediapipe/tasks-vision']);
  assert.equal(MEDIAPIPE_PUBLIC_ROOT, `vendor/mediapipe/${MEDIAPIPE_ASSET_VERSION}`);
});

test('cache constants distinguish revalidated HTML from immutable assets', () => {
  assert.equal(HTML_CACHE_CONTROL, 'no-cache, must-revalidate');
  assert.equal(IMMUTABLE_CACHE_CONTROL, 'public, max-age=31536000, immutable');
});

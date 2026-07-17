// Copies the MediaPipe tasks-vision wasm assets from the (pinned) node_modules package
// into the versioned public/vendor/mediapipe directory so they ship with the build and
// are served from our own origin — no runtime CDN dependency. Runs automatically before
// `vite build` via the "prebuild" npm script. The wasm files stay out of git (see
// .gitignore); they are copied from the locked package version on every build, so they
// cannot drift from the dependency.
//
// The face_landmarker.task model is NOT handled here: it is the one asset not reproducible
// from npm, so it is vendored (committed) directly under the same versioned directory.

import { access, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIAPIPE_PUBLIC_ROOT } from '../config/mediapipe-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dest = resolve(root, 'public', MEDIAPIPE_PUBLIC_ROOT, 'wasm');
const legacyDest = resolve(root, 'public/vendor/mediapipe/wasm');

try {
  await access(src);
} catch {
  console.error(
    `[copy-mediapipe] Could not find ${src}. Run "npm ci" before building so the wasm assets can be copied.`
  );
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await rm(legacyDest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[copy-mediapipe] Copied wasm assets -> ${dest}`);

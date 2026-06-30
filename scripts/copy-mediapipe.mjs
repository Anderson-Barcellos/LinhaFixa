// Copies the MediaPipe tasks-vision wasm assets from the (pinned) node_modules package
// into public/vendor/mediapipe/wasm so they ship with the build and are served from our
// own origin — no runtime CDN dependency. Runs automatically before `vite build` via the
// "prebuild" npm script. The wasm files stay out of git (see .gitignore); they are copied
// from the locked package version on every build, so they cannot drift from the dependency.
//
// The face_landmarker.task model is NOT handled here: it is the one asset not reproducible
// from npm, so it is vendored (committed) directly under public/vendor/mediapipe/.

import { cp, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const dest = resolve(root, 'public/vendor/mediapipe/wasm');

try {
  await access(src);
} catch {
  console.error(
    `[copy-mediapipe] Could not find ${src}. Run "npm ci" before building so the wasm assets can be copied.`
  );
  process.exit(1);
}

await mkdir(dirname(dest), { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[copy-mediapipe] Copied wasm assets -> ${dest}`);

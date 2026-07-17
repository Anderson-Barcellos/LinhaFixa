# Adaptive Loading Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Gaze's blocking initial JavaScript to at most 180,000 gzip bytes while loading camera code opportunistically, loading MediaPipe only on camera intent, and serving immutable versioned assets safely under `/gaze`.

**Architecture:** Keep consent and home in the initial shell, split every other screen at the router, and move `@mediapipe/tasks-vision` behind a retryable single-flight dynamic import. A visibility-aware idle scheduler preloads camera feature code, while explicit user intent initializes the heavy MediaPipe runtime without requesting camera permission. Vite's manifest, a bundle-budget gate, a network smoke, and scoped Express cache headers make the behavior measurable.

**Tech Stack:** React 19, React Router 7, TypeScript 5.8, Vite 6, Express 4, MediaPipe Tasks Vision 0.10.35, Node test runner, Playwright.

## Global Constraints

- Blocking initial JavaScript is at most 180,000 gzip bytes, measured as the Vite entry plus every transitive static JavaScript import.
- Recharts/Redux/D3 must not transfer before `/dashboard` is opened.
- MediaPipe model and WASM must not transfer before explicit camera intent.
- Idle preload may import camera feature code only; it must not initialize MediaPipe, request camera permission, open a stream, or start detection.
- Camera permission remains inside the existing visible camera flows.
- Calibration, detector behavior, GPU → CPU fallback, thresholds, capture semantics, persisted clinical data, metrics, and normal UI appearance remain unchanged.
- Do not add a service worker, PWA runtime, offline guarantee, or unrelated component refactor.
- HTML uses `no-cache, must-revalidate`; hashed assets and versioned MediaPipe assets use `public, max-age=31536000, immutable`.
- The production basename remains `/gaze`; direct navigation and refresh must work for every lazy route.
- `PACK Repetibilidade e Sanidade do Instrumento` remains queued for the next session and receives no implementation in this plan.
- Do not edit the pre-existing user changes in `index.html` or `docs/superpowers/specs/2026-07-16-adaptive-surface-design.md`.

---

## File Structure

**Create:**

- `scripts/bundle-budget.mjs` — traverses Vite manifest static imports and enforces the gzip budget.
- `scripts/bundle-budget.test.mjs` — proves dynamic chunks are excluded and static chunks cannot hide weight.
- `src/services/routeChunkRecovery.ts` — one-shot stale-chunk recovery policy.
- `src/services/routeChunkRecovery.test.ts` — tests error classification and reload-loop protection.
- `src/services/routeModules.ts` — canonical dynamic import functions shared by router and preload.
- `src/components/RouteLoadBoundary.tsx` — explicit error UI when a lazy route cannot recover.
- `src/services/mediaPipeRuntime.ts` — retryable single-flight runtime loader.
- `src/services/mediaPipeRuntime.test.ts` — concurrency, state, and retry tests.
- `src/services/adaptivePreload.ts` — visibility/idle scheduler and intent entrypoint.
- `src/services/adaptivePreload.test.ts` — deterministic scheduler tests without a browser.
- `config/mediapipe-assets.mjs` — single source of truth for the pinned public asset version.
- `config/static-cache.mjs` — exact cache header constants shared by server and tests.
- `scripts/mediapipe-assets.test.mjs` — verifies dependency version, public paths, and cache constants.
- `scripts/smoke-loading.mjs` — observes initial, idle, intent, Dashboard, and cache request phases.

**Modify:**

- `vite.config.ts` — emit `.vite/manifest.json`.
- `package.json` — expose the budget gate and add it to the production build after splitting.
- `src/App.tsx` — lazy routes, suspense, idle-preload lifecycle, and route error boundary.
- `src/screens/HomeScreen.tsx` — signal camera intent on player/diagnostic controls.
- `src/screens/ExerciseLibraryScreen.tsx` — signal camera intent before player navigation.
- `src/services/faceTracking.ts` — dynamic MediaPipe runtime and shared detector initialization.
- `scripts/copy-mediapipe.mjs` — copy generated WASM into the versioned public path and remove the obsolete generated path.
- `.gitignore` — ignore versioned generated WASM directories while retaining the committed model.
- `server.ts` — scoped immutable/static and revalidated HTML serving.
- `scripts/smoke-layout.mjs` — recognize the versioned MediaPipe URLs.
- `scripts/smoke-built.mjs` — include the loading smoke in the isolated build gate.
- `BACKLOG.md` — record plan path and implementation/review evidence without closing the PACK.
- `/etc/apache2/APACHE.md` — document the verified public cache policy after deploy; this host document is not part of the repo commit.

**Move:**

- `public/vendor/mediapipe/face_landmarker.task` → `public/vendor/mediapipe/0.10.35/face_landmarker.task`.

---

### Task 1: Manifest-aware bundle budget

**Files:**

- Create: `scripts/bundle-budget.mjs`
- Create: `scripts/bundle-budget.test.mjs`
- Modify: `vite.config.ts:15-31`
- Modify: `package.json:6-16`

**Interfaces:**

- Consumes: Vite manifest records with `file`, `isEntry`, and `imports`.
- Produces: `collectInitialJavaScript(manifest): string[]`, `measureInitialGzipBytes({ manifestPath, distDir }): Promise<{ files: string[]; bytes: number }>`, and CLI `node scripts/bundle-budget.mjs <distDir> <budgetBytes>`.

- [ ] **Step 1: Write manifest traversal tests**

Create `scripts/bundle-budget.test.mjs` with a fixture in which the entry imports one shared static chunk and names one dynamic Dashboard chunk:

```js
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
```

- [ ] **Step 2: Run the new tests and verify the missing-module failure**

Run: `node --test scripts/bundle-budget.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/bundle-budget.mjs`.

- [ ] **Step 3: Implement manifest traversal, gzip measurement, and CLI failure**

Create `scripts/bundle-budget.mjs`:

```js
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function collectInitialJavaScript(manifest) {
  const visited = new Set();
  const files = new Set();
  const visit = key => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Vite manifest references missing chunk ${key}`);
    if (chunk.file?.endsWith('.js')) files.add(chunk.file);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry);
  if (entries.length !== 1) throw new Error(`Expected one Vite entry, found ${entries.length}`);
  visit(entries[0][0]);
  return [...files].sort();
}

export async function measureInitialGzipBytes({ manifestPath, distDir }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const files = collectInitialJavaScript(manifest);
  let bytes = 0;
  for (const file of files) {
    bytes += gzipSync(await readFile(resolve(distDir, file))).byteLength;
  }
  return { files, bytes };
}

export function assertBundleBudget(actualBytes, budgetBytes) {
  if (actualBytes > budgetBytes) {
    throw new Error(`Initial JavaScript ${actualBytes} bytes exceeds budget ${budgetBytes} bytes`);
  }
}

async function main() {
  const distDir = resolve(process.argv[2] ?? 'dist');
  const budgetBytes = Number(process.argv[3] ?? '180000');
  const result = await measureInitialGzipBytes({
    manifestPath: resolve(distDir, '.vite/manifest.json'),
    distDir,
  });
  assertBundleBudget(result.bytes, budgetBytes);
  console.log(`Initial JavaScript: ${result.bytes}/${budgetBytes} gzip bytes (${result.files.join(', ')})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Enable the Vite manifest and expose a non-build script**

Add `build: { manifest: true }` to `vite.config.ts`. Add this package script without inserting it into `build` yet, because the unsplit baseline must remain buildable during Tasks 2–5:

```json
"check:bundle": "node scripts/bundle-budget.mjs dist 180000"
```

- [ ] **Step 5: Run focused and complete tests**

Run: `node --test scripts/bundle-budget.test.mjs && npm test`

Expected: bundle-budget tests PASS; complete suite PASS with the existing total plus 3 tests.

- [ ] **Step 6: Commit the budget tooling**

```bash
git add scripts/bundle-budget.mjs scripts/bundle-budget.test.mjs vite.config.ts package.json
git commit -m "test: enforce initial bundle budget"
```

---

### Task 2: Lazy route boundaries and stale-chunk recovery

**Files:**

- Create: `src/services/routeChunkRecovery.ts`
- Create: `src/services/routeChunkRecovery.test.ts`
- Create: `src/services/routeModules.ts`
- Create: `src/components/RouteLoadBoundary.tsx`
- Modify: `src/App.tsx:6-62`

**Interfaces:**

- Consumes: dynamic module loader `() => Promise<T>` and browser reload/storage adapters.
- Produces: `loadRouteModule<T>(loader): Promise<T>`, route module loader functions, `preloadCameraRouteCode(): Promise<void>`, and `RouteLoadBoundary`.

- [ ] **Step 1: Write stale-chunk policy tests**

Create `src/services/routeChunkRecovery.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRouteChunkRecovery,
  isDynamicImportFailure,
} from './routeChunkRecovery';

test('isDynamicImportFailure recognizes browser dynamic-import failures only', () => {
  assert.equal(isDynamicImportFailure(new TypeError('Failed to fetch dynamically imported module: /gaze/assets/Dashboard.js')), true);
  assert.equal(isDynamicImportFailure(new Error('ChunkLoadError: Loading chunk 4 failed')), true);
  assert.equal(isDynamicImportFailure(new Error('calibration rejected')), false);
});

test('route recovery reloads once inside the cooldown and never reloads generic errors', () => {
  const values = new Map<string, string>();
  let reloads = 0;
  const recovery = createRouteChunkRecovery({
    now: () => 50_000,
    storage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    },
    reload: () => { reloads += 1; },
  });
  const chunkError = new TypeError('Importing a module script failed');
  assert.equal(recovery.tryReload(chunkError), true);
  assert.equal(recovery.tryReload(chunkError), false);
  assert.equal(recovery.tryReload(new Error('domain failure')), false);
  assert.equal(reloads, 1);
});

test('successful route load clears stale recovery state', async () => {
  const values = new Map([['gaze:route-chunk-reload-at', '49000']]);
  const recovery = createRouteChunkRecovery({
    now: () => 50_000,
    storage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    },
    reload: () => {},
  });
  assert.deepEqual(await recovery.load(() => Promise.resolve({ screen: 'dashboard' })), { screen: 'dashboard' });
  assert.equal(values.has('gaze:route-chunk-reload-at'), false);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --import tsx --test src/services/routeChunkRecovery.test.ts`

Expected: FAIL because `routeChunkRecovery.ts` does not exist.

- [ ] **Step 3: Implement recovery with a 30-second loop guard**

Create `src/services/routeChunkRecovery.ts` with error patterns for `Failed to fetch dynamically imported module`, `Importing a module script failed`, and `ChunkLoadError`:

```ts
const RELOAD_AT_KEY = 'gaze:route-chunk-reload-at';
const RELOAD_COOLDOWN_MS = 30_000;

interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface RecoveryDependencies {
  now(): number;
  storage: RecoveryStorage;
  reload(): void;
}

export function isDynamicImportFailure(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message);
}

export function createRouteChunkRecovery(deps: RecoveryDependencies) {
  const tryReload = (error: unknown): boolean => {
    if (!isDynamicImportFailure(error)) return false;
    const previous = Number(deps.storage.getItem(RELOAD_AT_KEY) ?? 0);
    if (deps.now() - previous < RELOAD_COOLDOWN_MS) return false;
    deps.storage.setItem(RELOAD_AT_KEY, String(deps.now()));
    deps.reload();
    return true;
  };
  return {
    tryReload,
    async load<T>(loader: () => Promise<T>): Promise<T> {
      try {
        const module = await loader();
        deps.storage.removeItem(RELOAD_AT_KEY);
        return module;
      } catch (error) {
        if (tryReload(error)) return new Promise<T>(() => {});
        throw error;
      }
    },
  };
}

let browserRecovery: ReturnType<typeof createRouteChunkRecovery> | null = null;

function getBrowserRecovery() {
  browserRecovery ??= createRouteChunkRecovery({
    now: () => Date.now(),
    storage: window.sessionStorage,
    reload: () => window.location.reload(),
  });
  return browserRecovery;
}

export function loadRouteModule<T>(loader: () => Promise<T>): Promise<T> {
  return getBrowserRecovery().load(loader);
}
```

The browser singleton is created lazily so importing the pure policy in the Node test runner never reads `window`.

- [ ] **Step 4: Create canonical route loaders**

Create `src/services/routeModules.ts`:

```ts
export const loadExercisePlayerModule = () => import('@/screens/ExercisePlayerScreen');
export const loadDashboardModule = () => import('@/screens/DashboardScreen');
export const loadExerciseLibraryModule = () => import('@/screens/ExerciseLibraryScreen');
export const loadSettingsModule = () => import('@/screens/SettingsScreen');
export const loadEyeTrackingTestModule = () => import('@/screens/EyeTrackingTestScreen');

export async function preloadCameraRouteCode(): Promise<void> {
  await Promise.all([loadExercisePlayerModule(), loadEyeTrackingTestModule()]);
}
```

- [ ] **Step 5: Add a route error boundary and split `App.tsx`**

Create `RouteLoadBoundary.tsx` as a class error boundary:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isDynamicImportFailure } from '@/services/routeChunkRecovery';

interface Props { children: ReactNode }
interface State { error: unknown | null }

export class RouteLoadBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isDynamicImportFailure(error)) console.warn('Lazy route failed to load.', info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (!isDynamicImportFailure(this.state.error)) throw this.state.error;
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-800">Atualização disponível</h1>
          <p className="mt-2 text-slate-600">Recarregue para abrir a versão atual do Gaze.</p>
          <button
            className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white"
            onClick={() => window.location.reload()}
          >
            Recarregar aplicação
          </button>
        </div>
      </main>
    );
  }
}
```

Only dynamic-import failures receive this recovery UI. Generic render or clinical errors are rethrown instead of being mislabeled as an update problem.

In `App.tsx`, keep `HomeScreen` and `ConsentScreen` eager. Replace the five other static screen imports with `lazy(() => loadRouteModule(loader).then(module => ({ default: module.NamedScreen })))`. Wrap `Routes` in `RouteLoadBoundary` and `Suspense fallback={<BootScreen />}`. Do not change paths, consent guards, basename, or `BootScreen` styling.

- [ ] **Step 6: Verify route splitting and direct-route behavior**

Run: `node --import tsx --test src/services/routeChunkRecovery.test.ts && npx tsc --noEmit && APP_BASE_PATH=/gaze npm run build`

Expected: tests and TypeScript PASS; Vite reports multiple JavaScript chunks. `npm run build` still succeeds because `check:bundle` is not wired into `build` yet.

- [ ] **Step 7: Commit route boundaries**

```bash
git add src/App.tsx src/components/RouteLoadBoundary.tsx src/services/routeChunkRecovery.ts src/services/routeChunkRecovery.test.ts src/services/routeModules.ts
git commit -m "perf: split application routes"
```

---

### Task 3: Retryable single-flight MediaPipe runtime

**Files:**

- Create: `src/services/mediaPipeRuntime.ts`
- Create: `src/services/mediaPipeRuntime.test.ts`
- Modify: `src/services/faceTracking.ts:1-45`

**Interfaces:**

- Consumes: `() => Promise<typeof import('@mediapipe/tasks-vision')>`.
- Produces: `createRetryableSingleFlight<T>(load)`, `loadMediaPipeRuntime()`, `mediaPipeRuntimeState()`, and `initFaceTracking(): Promise<boolean>`.

- [ ] **Step 1: Write concurrency and retry tests**

Create `src/services/mediaPipeRuntime.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetryableSingleFlight } from './mediaPipeRuntime';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test('single flight shares one in-flight load and becomes ready', async () => {
  const pending = deferred<string>();
  let calls = 0;
  const loader = createRetryableSingleFlight(() => { calls += 1; return pending.promise; });
  const first = loader.run();
  const second = loader.run();
  assert.equal(calls, 1);
  assert.equal(loader.state(), 'loading');
  pending.resolve('ready');
  assert.equal(await first, 'ready');
  assert.equal(await second, 'ready');
  assert.equal(loader.state(), 'ready');
});

test('single flight clears a rejected promise and permits a real retry', async () => {
  let calls = 0;
  const loader = createRetryableSingleFlight(async () => {
    calls += 1;
    if (calls === 1) throw new Error('warmup failed');
    return 'ready';
  });
  await assert.rejects(loader.run(), /warmup failed/);
  assert.equal(loader.state(), 'failed');
  assert.equal(await loader.run(), 'ready');
  assert.equal(calls, 2);
  assert.equal(loader.state(), 'ready');
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --import tsx --test src/services/mediaPipeRuntime.test.ts`

Expected: FAIL because `mediaPipeRuntime.ts` does not exist.

- [ ] **Step 3: Implement the generic loader and dynamic MediaPipe import**

Create `mediaPipeRuntime.ts` with the complete single-flight state machine:

```ts
export type PreloadState = 'idle' | 'loading' | 'ready' | 'failed';

export function createRetryableSingleFlight<T>(load: () => Promise<T>) {
  let currentState: PreloadState = 'idle';
  let active: Promise<T> | null = null;
  let value: T | undefined;

  return {
    state: () => currentState,
    run(): Promise<T> {
      if (currentState === 'ready') return Promise.resolve(value as T);
      if (active) return active;
      currentState = 'loading';
      active = load().then(
        result => {
          value = result;
          currentState = 'ready';
          return result;
        },
        error => {
          active = null;
          currentState = 'failed';
          throw error;
        },
      );
      return active;
    },
  };
}

const runtime = createRetryableSingleFlight(() => import('@mediapipe/tasks-vision'));

export const loadMediaPipeRuntime = () => runtime.run();
export const mediaPipeRuntimeState = () => runtime.state();
```

- [ ] **Step 4: Move detector initialization behind the loader**

Replace the current imports and initialization block at the top of `faceTracking.ts` with this structure; Task 5 will only change the two asset URL strings:

```ts
import type { FaceLandmarker as FaceLandmarkerInstance } from '@mediapipe/tasks-vision';
import { GazeSample } from '@/types';
import { createRetryableSingleFlight, loadMediaPipeRuntime } from './mediaPipeRuntime';

let faceLandmarker: FaceLandmarkerInstance | null = null;

const detectorInitialization = createRetryableSingleFlight(async () => {
  const { FilesetResolver, FaceLandmarker } = await loadMediaPipeRuntime();
  const vision = await FilesetResolver.forVisionTasks(
    `${import.meta.env.BASE_URL}vendor/mediapipe/wasm`,
  );
  const create = (delegate: 'GPU' | 'CPU') => FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `${import.meta.env.BASE_URL}vendor/mediapipe/face_landmarker.task`,
      delegate,
    },
    outputFaceBlendshapes: true,
    runningMode: 'VIDEO',
    numFaces: 1,
  });
  try {
    faceLandmarker = await create('GPU');
  } catch (gpuErr) {
    console.warn('GPU face tracking unavailable; falling back to CPU.', gpuErr);
    faceLandmarker = await create('CPU');
  }
  return true;
});

export async function initFaceTracking(): Promise<boolean> {
  if (faceLandmarker) return true;
  try {
    return await detectorInitialization.run();
  } catch (err) {
    console.warn('Não foi possível inicializar o rastreamento facial real. O monitoramento de cabeça/olhar ficará indisponível.', err);
    return false;
  }
}
```

The existing synchronous estimate/accessor functions and `BLINK_REJECT_GATE_ENABLED` remain byte-for-byte semantically unchanged.

- [ ] **Step 5: Verify runtime isolation and existing face semantics**

Run: `node --import tsx --test src/services/mediaPipeRuntime.test.ts src/services/faceTracking.test.ts && npx tsc --noEmit && APP_BASE_PATH=/gaze npm run build`

Expected: tests PASS; Vite manifest contains a dynamic chunk whose source is `node_modules/@mediapipe/tasks-vision/vision_bundle.mjs`; entry static imports do not include that chunk.

- [ ] **Step 6: Commit the runtime boundary**

```bash
git add src/services/mediaPipeRuntime.ts src/services/mediaPipeRuntime.test.ts src/services/faceTracking.ts
git commit -m "perf: load mediapipe runtime on demand"
```

---

### Task 4: Visibility-aware idle preload and camera intent

**Files:**

- Create: `src/services/adaptivePreload.ts`
- Create: `src/services/adaptivePreload.test.ts`
- Modify: `src/App.tsx:19-62`
- Modify: `src/screens/HomeScreen.tsx:8-115`
- Modify: `src/screens/ExerciseLibraryScreen.tsx:1-40`

**Interfaces:**

- Consumes: `preloadCameraRouteCode()` from Task 2 and dynamic `import('./faceTracking')` from Task 3.
- Produces: `startAdaptiveCameraCodePreload(): () => void` and `signalCameraIntent(): void`.

- [ ] **Step 1: Write deterministic visibility/idle tests**

Create `src/services/adaptivePreload.test.ts` around an exported `createAdaptivePreloadController(deps)`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdaptivePreloadController } from './adaptivePreload';

test('visible idle schedules code once and hidden state cancels pending work', async () => {
  let visible = true;
  let callback: (() => void) | null = null;
  let cancelled = 0;
  let preloads = 0;
  const controller = createAdaptivePreloadController({
    isVisible: () => visible,
    requestIdle: run => { callback = run; return 7; },
    cancelIdle: handle => { assert.equal(handle, 7); cancelled += 1; },
    preloadCameraCode: async () => { preloads += 1; },
  });
  controller.start();
  visible = false;
  controller.visibilityChanged();
  assert.equal(cancelled, 1);
  callback?.();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(preloads, 0);
});

test('returning visible reschedules and successful idle callback runs only once', async () => {
  let visible = false;
  const callbacks: Array<() => void> = [];
  let preloads = 0;
  const controller = createAdaptivePreloadController({
    isVisible: () => visible,
    requestIdle: run => { callbacks.push(run); return callbacks.length; },
    cancelIdle: () => {},
    preloadCameraCode: async () => { preloads += 1; },
  });
  controller.start();
  assert.equal(callbacks.length, 0);
  visible = true;
  controller.visibilityChanged();
  callbacks[0]();
  callbacks[0]();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(preloads, 1);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --import tsx --test src/services/adaptivePreload.test.ts`

Expected: FAIL because `adaptivePreload.ts` does not exist.

- [ ] **Step 3: Implement the pure controller and browser adapter**

Implement the pure controller, browser adapter, and intent entrypoint:

```ts
import { preloadCameraRouteCode } from './routeModules';

interface AdaptivePreloadDependencies {
  isVisible(): boolean;
  requestIdle(run: () => void): number;
  cancelIdle(handle: number): void;
  preloadCameraCode(): Promise<void>;
}

export function createAdaptivePreloadController(deps: AdaptivePreloadDependencies) {
  let idleHandle: number | null = null;
  let completed = false;
  let generation = 0;

  const cancel = () => {
    generation += 1;
    if (idleHandle !== null) deps.cancelIdle(idleHandle);
    idleHandle = null;
  };

  const schedule = () => {
    if (completed || idleHandle !== null || !deps.isVisible()) return;
    const token = ++generation;
    idleHandle = deps.requestIdle(() => {
      idleHandle = null;
      if (completed || token !== generation || !deps.isVisible()) return;
      completed = true;
      void deps.preloadCameraCode().catch(() => { completed = false; });
    });
  };

  return {
    start: schedule,
    stop: cancel,
    visibilityChanged() {
      if (deps.isVisible()) schedule();
      else cancel();
    },
  };
}

type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function startAdaptiveCameraCodePreload(): () => void {
  const browser = window as IdleWindow;
  const controller = createAdaptivePreloadController({
    isVisible: () => document.visibilityState === 'visible',
    requestIdle: run => browser.requestIdleCallback
      ? browser.requestIdleCallback(run)
      : window.setTimeout(run, 1_500),
    cancelIdle: handle => browser.cancelIdleCallback
      ? browser.cancelIdleCallback(handle)
      : window.clearTimeout(handle),
    preloadCameraCode: preloadCameraRouteCode,
  });
  const onVisibility = () => controller.visibilityChanged();
  document.addEventListener('visibilitychange', onVisibility);
  controller.start();
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    controller.stop();
  };
}

export function signalCameraIntent(): void {
  void import('./faceTracking')
    .then(module => module.initFaceTracking())
    .catch(() => false);
}
```

This function never imports or calls `cameraStream.ts`.

- [ ] **Step 4: Schedule code preload after hydration and consent**

In `App.tsx`, add an effect guarded by `hydrated && consentAccepted`:

```ts
useEffect(() => {
  if (!hydrated || !consentAccepted) return;
  return startAdaptiveCameraCodePreload();
}, [hydrated, consentAccepted]);
```

StrictMode cleanup must cancel the first development-only schedule before the second effect instance starts.

- [ ] **Step 5: Wire intent to camera-facing controls**

In `HomeScreen`, use one callback and attach it to the guided-player button, every direct-exercise player button, and the diagnostics button:

```tsx
const warmCamera = () => signalCameraIntent();

<button
  onPointerDown={warmCamera}
  onFocus={warmCamera}
  onClick={() => navigate('/player')}
>
```

Do not attach it to Dashboard, Settings, or Library navigation.

In `ExerciseLibraryScreen`, import `signalCameraIntent`, define the same callback, and attach `onPointerDown` and `onFocus` to each `Praticar Agora` button. Keep the current `onClick` navigation unchanged.

- [ ] **Step 6: Verify scheduler and no static MediaPipe regression**

Run: `node --import tsx --test src/services/adaptivePreload.test.ts src/services/mediaPipeRuntime.test.ts && npx tsc --noEmit && APP_BASE_PATH=/gaze npm run build`

Expected: tests and build PASS; entry static imports still exclude the MediaPipe runtime chunk.

- [ ] **Step 7: Commit adaptive preload behavior**

```bash
git add src/App.tsx src/screens/HomeScreen.tsx src/screens/ExerciseLibraryScreen.tsx src/services/adaptivePreload.ts src/services/adaptivePreload.test.ts
git commit -m "perf: preload camera resources adaptively"
```

---

### Task 5: Versioned MediaPipe assets and scoped cache headers

**Files:**

- Create: `config/mediapipe-assets.mjs`
- Create: `config/static-cache.mjs`
- Create: `scripts/mediapipe-assets.test.mjs`
- Move: `public/vendor/mediapipe/face_landmarker.task` → `public/vendor/mediapipe/0.10.35/face_landmarker.task`
- Modify: `scripts/copy-mediapipe.mjs:1-29`
- Modify: `.gitignore:11-14`
- Modify: `src/services/faceTracking.ts:15-42`
- Modify: `server.ts:238-255`
- Modify: `scripts/smoke-layout.mjs:129-149`

**Interfaces:**

- Consumes: pinned package dependency `@mediapipe/tasks-vision: 0.10.35`.
- Produces: `MEDIAPIPE_ASSET_VERSION`, `MEDIAPIPE_PUBLIC_ROOT`, `IMMUTABLE_CACHE_CONTROL`, and `HTML_CACHE_CONTROL`.

- [ ] **Step 1: Write asset-version and cache-policy tests**

Create `scripts/mediapipe-assets.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test scripts/mediapipe-assets.test.mjs`

Expected: FAIL because both config modules are absent.

- [ ] **Step 3: Add shared constants and version the committed model**

Create:

```js
// config/mediapipe-assets.mjs
export const MEDIAPIPE_ASSET_VERSION = '0.10.35';
export const MEDIAPIPE_PUBLIC_ROOT = `vendor/mediapipe/${MEDIAPIPE_ASSET_VERSION}`;

// config/static-cache.mjs
export const HTML_CACHE_CONTROL = 'no-cache, must-revalidate';
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
```

Move the committed model with `git mv`. Update `.gitignore` to ignore `public/vendor/mediapipe/*/wasm/` and retain the versioned `.task` model.

- [ ] **Step 4: Copy WASM only to the versioned generated path**

Import `MEDIAPIPE_PUBLIC_ROOT` in `copy-mediapipe.mjs`. Before copying, use `fs/promises.rm` only on the two known generated directories: the destination version's `wasm` directory and legacy `public/vendor/mediapipe/wasm`. Recreate and copy the pinned package's `wasm` directory. This prevents stale generated files from leaking into `dist`.

- [ ] **Step 5: Point face tracking and smoke checks at versioned URLs**

In `faceTracking.ts`, build both URLs from `MEDIAPIPE_PUBLIC_ROOT` and `import.meta.env.BASE_URL`:

```ts
const mediaPipeBase = `${import.meta.env.BASE_URL}${MEDIAPIPE_PUBLIC_ROOT}`;
const vision = await FilesetResolver.forVisionTasks(`${mediaPipeBase}/wasm`);
// ...
modelAssetPath: `${mediaPipeBase}/face_landmarker.task`,
```

Update `smoke-layout.mjs` recognition to match `/vendor/mediapipe/0.10.35/face_landmarker.task` and `/vendor/mediapipe/0.10.35/wasm/*.wasm`.

- [ ] **Step 6: Serve exact cache classes from Express**

In production `server.ts`, register these static mounts before the general static mount:

```ts
app.use(p('/assets'), express.static(path.join(distPath, 'assets'), {
  immutable: true,
  maxAge: '1y',
}));
app.use(
  p(`/${MEDIAPIPE_PUBLIC_ROOT}`),
  express.static(path.join(distPath, MEDIAPIPE_PUBLIC_ROOT), {
    immutable: true,
    maxAge: '1y',
  }),
);
```

Set `HTML_CACHE_CONTROL` through `setHeaders` when the general static mount serves `index.html`, and set the same header explicitly before SPA fallback `sendFile`. API routes remain before every static mount and receive no new cache header.

- [ ] **Step 7: Verify copied assets and local headers**

Run: `node --test scripts/mediapipe-assets.test.mjs && APP_BASE_PATH=/gaze npm run build`

Start the built server on an unused local port, then verify:

- `/gaze/` → `Cache-Control: no-cache, must-revalidate`;
- `/gaze/assets/<hashed>.js` → `public, max-age=31536000, immutable`;
- `/gaze/vendor/mediapipe/0.10.35/face_landmarker.task` → the same immutable header;
- `/gaze/vendor/mediapipe/wasm/...` → 404, proving the legacy URL is gone.

- [ ] **Step 8: Commit asset and cache policy**

```bash
git add .gitignore config/mediapipe-assets.mjs config/static-cache.mjs public/vendor/mediapipe scripts/copy-mediapipe.mjs scripts/mediapipe-assets.test.mjs scripts/smoke-layout.mjs server.ts src/services/faceTracking.ts
git commit -m "perf: cache versioned mediapipe assets"
```

---

### Task 6: Network smoke, build gate, deploy, and operational record

**Files:**

- Create: `scripts/smoke-loading.mjs`
- Modify: `scripts/smoke-built.mjs:49-53`
- Modify: `scripts/smoke-runtime.test.mjs:1-52`
- Modify: `package.json:6-16`
- Modify: `BACKLOG.md:1-8`
- Modify after public verification: `/etc/apache2/APACHE.md`

**Interfaces:**

- Consumes: Vite manifest, built server at `/gaze`, adaptive idle callback, camera-intent controls, and structured `SMOKE_RESULT` output.
- Produces: repeatable `loading` smoke suite and a production build that fails above 180,000 initial gzip bytes.

- [ ] **Step 1: Write the loading smoke with deterministic idle control**

Create `scripts/smoke-loading.mjs`. Reuse the existing `check`/failure pattern from `smoke-layout.mjs`, but keep the phases explicit with these core helpers:

```js
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { smokeResultMarker } from './smoke-runtime.mjs';

const manifest = JSON.parse(await readFile(resolve('dist/.vite/manifest.json'), 'utf8'));
const chunkFile = source => {
  const record = manifest[source];
  if (!record?.file) throw new Error(`Missing Vite manifest source ${source}`);
  return `/${record.file}`;
};
const dashboardChunk = chunkFile('src/screens/DashboardScreen.tsx');
const diagnosticChunk = chunkFile('src/screens/EyeTrackingTestScreen.tsx');
const playerChunk = chunkFile('src/screens/ExercisePlayerScreen.tsx');
```

Before navigation, install deterministic browser hooks:

```js
await context.addInitScript(() => {
  const idleCallbacks = new Map();
  let nextIdleId = 1;
  let cameraRequests = 0;
  window.requestIdleCallback = callback => {
    const id = nextIdleId++;
    idleCallbacks.set(id, callback);
    return id;
  };
  window.cancelIdleCallback = id => { idleCallbacks.delete(id); };
  window.__gazeSmoke = {
    releaseIdle() {
      const pending = [...idleCallbacks.values()];
      idleCallbacks.clear();
      pending.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 }));
    },
    cameraRequests: () => cameraRequests,
  };
  navigator.mediaDevices.getUserMedia = async () => {
    cameraRequests += 1;
    throw new Error('camera must not be requested during preload smoke');
  };
});
```

Declare the injected `window.__gazeSmoke` shape locally in the `page.evaluate` callbacks rather than adding a global production type.

The suite must then:

- launch Playwright with the same system Chrome path as `smoke-layout.mjs`;
- inject a fake `requestIdleCallback` queue and a counted `getUserMedia` before page code runs;
- accept consent and record all local request paths;
- assert no Dashboard chunk, MediaPipe JS, model, WASM, or camera permission before idle;
- release the idle callback and assert camera route code appears while model/WASM and permission remain absent;
- dispatch `pointerdown` without `click` on `Diagnóstico de rastreamento`, then assert versioned model/WASM appear and permission remains absent;
- open `/dashboard` and assert the Dashboard/Recharts chunk is then requested;
- fetch HTML, hashed asset, and versioned model URLs and assert their exact cache headers;
- print `smokeResultMarker({ suite: 'loading', ... })` and exit non-zero on any failed assertion.

Use request pathname suffix matching so the same script works at the `/gaze` basename. Read the MediaPipe dynamic chunk from the manifest record whose `src` contains `node_modules/@mediapipe/tasks-vision/vision_bundle.mjs`; fail clearly if it is not present.

- [ ] **Step 2: Write and run the red smoke-integration test**

Append this test to `scripts/smoke-runtime.test.mjs` before editing `smoke-built.mjs`:

```js
import { readFile } from 'node:fs/promises';

test('isolated built smoke includes loading behavior', async () => {
  const source = await readFile(new URL('./smoke-built.mjs', import.meta.url), 'utf8');
  assert.match(source, /run\(['"]scripts\/smoke-loading\.mjs['"]\)/);
});
```

Run: `node --test scripts/smoke-runtime.test.mjs`

Expected: FAIL because `smoke-built.mjs` does not yet run `scripts/smoke-loading.mjs`.

- [ ] **Step 3: Add the smoke and budget to standard gates**

Append `await run('scripts/smoke-loading.mjs')` to the `results` array in `smoke-built.mjs`.

Change the production build script to:

```json
"build": "vite build && node scripts/bundle-budget.mjs dist 180000 && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs"
```

Do not suppress Vite chunk warnings and do not raise the 180,000-byte budget.

- [ ] **Step 4: Run the complete local gate**

Run: `npm test && npx tsc --noEmit && APP_BASE_PATH=/gaze npm run build && npm run smoke && git diff --check`

Expected: complete unit suite PASS; TypeScript PASS; bundle gate reports `actual <= 180000`; layout, validity, and loading smokes PASS with structured totals; whitespace gate clean.

- [ ] **Step 5: Commit the final automated gate**

```bash
git add package.json scripts/smoke-built.mjs scripts/smoke-loading.mjs scripts/smoke-runtime.test.mjs
git commit -m "test: gate adaptive loading behavior"
```

- [ ] **Step 6: Deploy and verify public behavior**

Run the production build with `APP_BASE_PATH=/gaze`, restart `linhafixa.service`, and wait for port 3060 ownership before probing. Verify:

- `systemctl is-active linhafixa.service` → `active`;
- local and public `/gaze/` → 200;
- direct public `/gaze/dashboard` and `/gaze/eye-tracking-test` → 200;
- public JS response has gzip when requested with `Accept-Encoding: gzip`;
- HTML is revalidated and hashed/versioned assets are immutable;
- public loading smoke passes without external MediaPipe requests.

Run `apache2ctl configtest` even if no vhost directive changed; expected: `Syntax OK`.

- [ ] **Step 7: Record operational truth without closing the PACK**

Update `/etc/apache2/APACHE.md` with the verified `/gaze` cache classes and versioned MediaPipe path. Update `BACKLOG.md` with commits, measured initial bytes, test totals, smoke totals, public asset names, and status `pronto para revisão do Anders`; do not mark the PACK concluded.

- [ ] **Step 8: Commit the repo-local completion record**

```bash
git add BACKLOG.md
git commit -m "docs: record adaptive loading validation"
```

- [ ] **Step 9: Request Anders' review gate**

Report the before/after initial gzip bytes, confirm that no clinical code path changed, and ask: `PACK Performance Adaptativa está pronto para revisão?`

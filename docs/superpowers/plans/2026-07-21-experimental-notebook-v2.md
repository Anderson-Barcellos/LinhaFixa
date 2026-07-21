# Caderno Experimental V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: Use `superpowers:executing-plans` to implement this plan task-by-task and `build-web-apps:frontend-app-builder` for Tasks 5-9 fidelity/QA. Anders selected inline, single-agent execution; do not dispatch subagents.

**Goal:** Rebuild the Linha Fixa frontend as a responsive, backend-first experimental notebook while preserving every existing clinical and experimental capability and tightening the scientific comparison contract.

**Approved design:** `docs/superpowers/specs/2026-07-21-experimental-notebook-v2-design.md`, with native references in `docs/superpowers/assets/experimental-notebook-v2/` for mobile, tablet and desktop.

**Architecture:** Keep IndexedDB v3, the Express/OpenAI endpoints, ocular engines and existing capture/recall/training services as authorities. Add small pure adapters for device class, notebook projection and session transitions; then make the React surfaces consume those contracts without duplicating thresholds or persistence rules. Replace the shell by responsive composition, not by backend or algorithm rewrites.

**Tech Stack:** React 19, TypeScript 5.8, React Router 7, Tailwind CSS 4, Zustand 5, IndexedDB/idb 8, Node test runner via tsx, Playwright smoke tests, Vite 6, Express 4.

## Global Constraints

- With or without full clinical validation, every existing feature remains reachable and functional.
- `/assessment`, `/library`, `/player`, `/history`, `/dashboard`, `/statistics`, `/settings` and `/eye-tracking-test` retain their current route contracts.
- `/api/generateReadingContent`, `/api/generateRecallText`, `/api/generateRecallQuestions`, `/api/generatePlan` and `/api/generateInsight` remain wired to their real consumers.
- IndexedDB stays at version 3; all persisted additions are optional/read-compatible and require no destructive migration.
- New captures freeze `deviceClass: 'phone' | 'tablet' | 'desktop'` and `deviceClassSource: 'confirmed' | 'suggested' | 'legacy-inferred'` at start.
- A longitudinal key is exactly `deviceClass|orientation|temporalTier|signalSource`; only confirmed-device, v1-comparable captures enter trends.
- Suggested device class produces an exploratory capture; legacy inference is presentation/audit only and never promotes a historical record.
- The measurement surface must not reflow during capture. Geometry, orientation, page visibility or camera interruption ends that run; samples are never concatenated across the interruption.
- The app supports 320x568, 390x844, 834x1194, 1024x768, 1366x768 and 1440x1024, rotation, safe areas, reduced motion and 200%-400% zoom.
- Existing semantic theme tokens and dark mode remain. Literal clinical signal colors in canvas/calibration surfaces do not change meaning.
- No new runtime dependency is required. The initial gzip bundle must remain at or below 180000 bytes.
- Execution is inline and TDD: observe RED, implement minimum GREEN, refactor only inside the active task, run the task gate, commit.
- Do not modify or stage `.codex_reports/` or `AUDITORIA_CIENTIFICA_BACKEND_FRONTEND_2026-07-20.md`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/services/deviceClass.ts` | Create | Suggest, confirm, resolve and conservatively infer device class |
| `src/services/deviceClass.test.ts` | Create | Device-class boundaries, confirmation and legacy inference |
| `src/services/experimentNotebookProjection.ts` | Create | Join sessions, captures and recalls into comparable/baseline/audit/activity buckets |
| `src/services/experimentNotebookProjection.test.ts` | Create | Projection ordering, association and fail-closed semantics |
| `src/services/assessmentSessionController.ts` | Create | Pure explicit transition reducer and presentation status |
| `src/services/assessmentSessionController.test.ts` | Create | Legal flow, exploratory branch, interruption, save retry and illegal events |
| `src/services/apiFailure.ts` | Create | Typed backend failure classification and user-facing recovery copy |
| `src/services/apiFailure.test.ts` | Create | Offline, 429, configuration, invalid payload and generic server branches |
| `src/services/planner.test.ts` | Create | AI, deterministic fallback, safety-block and payload provenance |
| `src/exercises/implementations.test.ts` | Create | Registry preservation for all four exercises |
| `src/services/sessionGeometry.ts` | Create | Frozen measurement-rect comparison and interruption reason |
| `src/services/sessionGeometry.test.ts` | Create | Subpixel tolerance, orientation and geometry interruption tests |
| `src/components/notebook/ExperimentNotebookScreen.tsx` | Create | Pure responsive notebook view |
| `src/components/notebook/NotebookRecordRow.tsx` | Create | Accessible record row for comparable, baseline, audit and activity entries |
| `scripts/smoke-notebook-v2.mjs` | Create | Responsive notebook and preserved-capability smoke |
| `src/types.ts` | Modify | Device metadata, plan provenance and additive record contracts |
| `src/services/captureValidity.ts` | Modify | Unconfirmed device class becomes an explicit exploratory reason |
| `src/hooks/useCaptureLifecycle.ts` | Modify | Persist frozen device metadata and geometry interruption evidence |
| `src/services/statisticsSummary.ts` | Modify | Four-dimensional comparison key and device-aware labels/payloads |
| `src/screens/EyeTrackingTestScreen.tsx` | Modify | Resolve device metadata, use session controller and freeze/interrupt geometry |
| `src/screens/AssessmentWorkspaceScreen.tsx` | Modify | Load all three stores and render the notebook projection/launcher |
| `src/components/assessment/AssessmentSetupPanel.tsx` | Modify | Backend-first preflight with explicit exploratory path |
| `src/components/assessment/AssessmentSessionSurface.tsx` | Modify | Controller titles and stable measurement viewport |
| `src/services/appSections.ts` | Modify | Four primary destinations without deleting secondary routes |
| `src/components/app/AppSidebar.tsx` | Modify | Mobile bottom bar, tablet rail and desktop sidebar |
| `src/components/app/AppShell.tsx` | Modify | Responsive shell and optional page header |
| `src/screens/HistoryScreen.tsx` | Modify | Sessions + captures + recalls from the shared projection |
| `src/screens/DashboardScreen.tsx` | Modify | Device-aware trend labels and Progresso presentation |
| `src/screens/SettingsScreen.tsx` | Modify | Explicit device-class confirmation/override |
| `src/services/planner.ts` | Modify | Visible AI/fallback/safety provenance |
| `src/services/insightResponse.ts` | Modify | Typed insight request, exact payload and response validation |
| `src/services/insightResponse.test.ts` | Modify | Insight endpoint payload, response and failure contract |
| `src/hooks/useRecallFlow.ts` | Modify | Honest recall persistence state and retry |
| `src/components/assessment/AssessmentResultPanel.tsx` | Modify | Visible capture/recall persistence outcomes and retry action |
| `src/screens/ExercisePlayerScreen.tsx` | Modify | Plan provenance and responsive focused flow |
| `src/screens/ExerciseLibraryScreen.tsx` | Modify | Preserve and expose all four registered exercises |
| `src/services/assessmentAdapter.ts` | Modify | Consume controller status instead of reconstructing competing stage rules |
| `src/App.tsx` | Modify | Default profile compatibility only; routes remain unchanged |
| `scripts/smoke-built.mjs` | Modify | Add notebook V2 smoke to the built gate |
| `scripts/smoke-assessment-workflow.mjs` | Modify | New notebook headings and launcher path |
| `scripts/smoke-layout.mjs` | Modify | Six viewports and stable measurement checks |
| `scripts/smoke-loading.mjs` | Modify | Updated route sentinels while preserving lazy-loading assertions |

---

### Task 1: Device-class contract and scientific validity gate

**Files:**
- Create: `src/services/deviceClass.ts`
- Create: `src/services/deviceClass.test.ts`
- Modify: `src/types.ts`
- Modify: `src/services/captureValidity.ts`
- Modify: `src/services/captureValidity.test.ts`
- Modify: `src/services/signalQuality.test.ts`

**Interfaces:**
- Produces: `DeviceClass`, `DeviceClassSource`, `DeviceClassDecision`, `resolveDeviceClass()`, `confirmDeviceClass()`, `inferLegacyDeviceClass()`.
- Produces: `CaptureValidityInput.deviceClassConfirmed` and reason `capture-device-class-unconfirmed`.
- Consumes: current `UserProfile`, `CaptureEnvironment` and validity-v1 thresholds without retuning them.

- [ ] **Step 1: Write the failing device-class tests**

Create `src/services/deviceClass.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  confirmDeviceClass,
  inferLegacyDeviceClass,
  resolveDeviceClass,
  suggestDeviceClass,
} from './deviceClass';

test('suggestion uses capabilities and shortest side, never orientation alone', () => {
  assert.equal(suggestDeviceClass({ width: 390, height: 844, maxTouchPoints: 5, coarsePointer: true }), 'phone');
  assert.equal(suggestDeviceClass({ width: 844, height: 390, maxTouchPoints: 5, coarsePointer: true }), 'phone');
  assert.equal(suggestDeviceClass({ width: 834, height: 1194, maxTouchPoints: 5, coarsePointer: true }), 'tablet');
  assert.equal(suggestDeviceClass({ width: 1024, height: 768, maxTouchPoints: 0, coarsePointer: false }), 'desktop');
});

test('a confirmed profile value wins over every heuristic', () => {
  assert.deepEqual(
    resolveDeviceClass(
      { deviceClass: 'desktop', deviceClassSource: 'confirmed' },
      { width: 390, height: 844, maxTouchPoints: 5, coarsePointer: true },
    ),
    { deviceClass: 'desktop', deviceClassSource: 'confirmed', trendEligible: true },
  );
});

test('an unconfirmed suggestion is explicit and cannot enter trends', () => {
  assert.deepEqual(
    resolveDeviceClass({}, { width: 834, height: 1194, maxTouchPoints: 5, coarsePointer: true }),
    { deviceClass: 'tablet', deviceClassSource: 'suggested', trendEligible: false },
  );
  assert.deepEqual(confirmDeviceClass('phone'), {
    deviceClass: 'phone',
    deviceClassSource: 'confirmed',
  });
});

test('legacy inference is conservative and never claims confirmation', () => {
  assert.deepEqual(inferLegacyDeviceClass({
    layoutMode: 'compact',
    viewport: { width: 390, height: 844 },
  }), { deviceClass: 'phone', deviceClassSource: 'legacy-inferred' });
  assert.deepEqual(inferLegacyDeviceClass({
    layoutMode: 'compact',
    viewport: { width: 834, height: 1194 },
  }), { deviceClass: 'tablet', deviceClassSource: 'legacy-inferred' });
  assert.deepEqual(inferLegacyDeviceClass({
    layoutMode: 'desktop',
    viewport: { width: 1440, height: 1024 },
  }), { deviceClass: 'desktop', deviceClassSource: 'legacy-inferred' });
  assert.equal(inferLegacyDeviceClass({
    layoutMode: 'compact',
    viewport: { width: 700, height: 700 },
  }), null);
});
```

- [ ] **Step 2: Extend validity tests with the unconfirmed-device branch**

In `src/services/captureValidity.test.ts`, add `deviceClassConfirmed: true` to `validInput()` and append:

```ts
test('unconfirmed device class keeps usable evidence exploratory', () => {
  const snapshot = assessCaptureValidity(validInput({ deviceClassConfirmed: false }));
  assert.equal(snapshot.grade, 'exploratory');
  assert.deepEqual(snapshot.reasonCodes, ['capture-device-class-unconfirmed']);
  assert.deepEqual(describeCaptureValidity(snapshot).reasons, [
    'Classe de dispositivo ainda não confirmada',
  ]);
});
```

Add `deviceClassConfirmed: true` to the shared `validityInput()` helper in
`src/services/signalQuality.test.ts` so those tests continue to describe a fully
specified capture rather than accidentally exercising the new fail-closed branch.

- [ ] **Step 3: Run the focused tests and observe RED**

Run:

```bash
npx tsx --test src/services/deviceClass.test.ts src/services/captureValidity.test.ts src/services/signalQuality.test.ts
```

Expected: FAIL because `deviceClass.ts`, the new types and `deviceClassConfirmed` do not exist.

- [ ] **Step 4: Add the additive persisted types**

In `src/types.ts`, before `UserProfile`, add:

```ts
export type DeviceClass = 'phone' | 'tablet' | 'desktop';
export type DeviceClassSource = 'confirmed' | 'suggested' | 'legacy-inferred';
```

Add to `UserProfile`:

```ts
  // Optional only for profiles saved before Caderno V2.
  deviceClass?: DeviceClass;
  deviceClassSource?: Extract<DeviceClassSource, 'confirmed' | 'suggested'>;
```

Add to `CaptureEnvironment`, before `layoutMode`:

```ts
  // Optional only when reading captures persisted before Caderno V2.
  deviceClass?: DeviceClass;
  deviceClassSource?: DeviceClassSource;
```

- [ ] **Step 5: Implement the pure resolver**

Create `src/services/deviceClass.ts`:

```ts
import type { DeviceClass, DeviceClassSource, UserProfile } from '@/types';

export interface DeviceCapabilities {
  width: number;
  height: number;
  maxTouchPoints: number;
  coarsePointer: boolean;
}

export interface DeviceClassDecision {
  deviceClass: DeviceClass;
  deviceClassSource: Extract<DeviceClassSource, 'confirmed' | 'suggested'>;
  trendEligible: boolean;
}

export function suggestDeviceClass(input: DeviceCapabilities): DeviceClass {
  const shortestSide = Math.min(input.width, input.height);
  const touchLike = input.maxTouchPoints > 0 || input.coarsePointer;
  if (!touchLike) return 'desktop';
  if (shortestSide <= 480) return 'phone';
  if (shortestSide >= 768) return 'tablet';
  return 'tablet';
}

export function resolveDeviceClass(
  profile: Pick<UserProfile, 'deviceClass' | 'deviceClassSource'> | null | undefined,
  capabilities: DeviceCapabilities,
): DeviceClassDecision {
  if (profile?.deviceClass && profile.deviceClassSource === 'confirmed') {
    return {
      deviceClass: profile.deviceClass,
      deviceClassSource: 'confirmed',
      trendEligible: true,
    };
  }
  return {
    deviceClass: suggestDeviceClass(capabilities),
    deviceClassSource: 'suggested',
    trendEligible: false,
  };
}

export function confirmDeviceClass(deviceClass: DeviceClass): {
  deviceClass: DeviceClass;
  deviceClassSource: 'confirmed';
} {
  return { deviceClass, deviceClassSource: 'confirmed' };
}

export function inferLegacyDeviceClass(input: {
  layoutMode: unknown;
  viewport?: { width?: unknown; height?: unknown };
}): { deviceClass: DeviceClass; deviceClassSource: 'legacy-inferred' } | null {
  const width = input.viewport?.width;
  const height = input.viewport?.height;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  const shortestSide = Math.min(width, height);
  if (input.layoutMode === 'desktop' && Math.max(width, height) >= 1024) {
    return { deviceClass: 'desktop', deviceClassSource: 'legacy-inferred' };
  }
  if (input.layoutMode !== 'compact') return null;
  if (shortestSide <= 480) return { deviceClass: 'phone', deviceClassSource: 'legacy-inferred' };
  if (shortestSide >= 768) return { deviceClass: 'tablet', deviceClassSource: 'legacy-inferred' };
  return null;
}
```

- [ ] **Step 6: Add the scientific reason without changing existing thresholds**

In `src/services/captureValidity.ts`:

```ts
// In CaptureValidityReasonCode
  | 'capture-device-class-unconfirmed'

// In CaptureValidityInput
  // Optional only during legacy/caller transition; absence fails closed.
  deviceClassConfirmed?: boolean;

// In assessCaptureValidity(), after calibration checks
  if (input.deviceClassConfirmed !== true) {
    reasonCodes.push('capture-device-class-unconfirmed');
  }

// In REASON_TEXT
  'capture-device-class-unconfirmed': 'Classe de dispositivo ainda não confirmada',
```

Add the same reason/text pair to the canonical-reason map in `captureValidity.test.ts`.

- [ ] **Step 7: Run GREEN and the type gate**

Run:

```bash
npx tsx --test src/services/deviceClass.test.ts src/services/captureValidity.test.ts src/services/signalQuality.test.ts && npm run lint
```

Expected: both focused suites PASS and TypeScript clean. New captures must always
write both fields; optionality exists only so IndexedDB v3 can still read legacy
captures without a migration or unsafe cast.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/types.ts src/services/deviceClass.ts src/services/deviceClass.test.ts src/services/captureValidity.ts src/services/captureValidity.test.ts src/services/signalQuality.test.ts
git commit -m "feat: add confirmed device class contract"
```

---

### Task 2: Freeze device provenance and extend the longitudinal key

**Files:**
- Modify: `src/screens/EyeTrackingTestScreen.tsx`
- Modify: `src/screens/ExercisePlayerScreen.tsx`
- Modify: `src/hooks/useCaptureLifecycle.ts`
- Modify: `src/hooks/useCaptureLifecycle.test.ts`
- Modify: `src/services/statisticsSummary.ts`
- Modify: `src/services/statisticsSummary.test.ts`

**Interfaces:**
- Consumes: `resolveDeviceClass()` from Task 1.
- Produces: `OcularReadingPoint.deviceClass`, `deviceClassSource` and the exact four-part `comparisonKey`.
- Produces: `DiagnosticInsightRecord.deviceClass` so the backend receives comparable context.

- [ ] **Step 1: Write RED tests for frozen provenance and grouping**

In `src/services/statisticsSummary.test.ts`, import `DeviceClassSource` and extend `diagnosticCapture()` with
`deviceClassSource: DeviceClassSource | null = 'confirmed'`. Its returned object
gets this environment only when both the source and orientation are known:

```ts
environment: deviceClassSource && orientation
  ? {
      deviceClass: 'phone',
      deviceClassSource,
      layoutMode: 'compact',
      viewport: { width: 390, height: 844, devicePixelRatio: 3, orientation },
      surfaceRect: { left: 0, top: 0, width: 390, height: 700 },
      video: { width: 1280, height: 720 },
      camera: { frameRate: 60 },
      rates: { ocularSampleRateHz: 60 },
    }
  : undefined,
```

Then add:

```ts
test('comparison key includes confirmed device class as its first dimension', () => {
  const phone = diagnosticCapture('phone', 100, validity('comparable'));
  phone.environment = {
    deviceClass: 'phone',
    deviceClassSource: 'confirmed',
    layoutMode: 'compact',
    viewport: { width: 390, height: 844, devicePixelRatio: 3, orientation: 'portrait' },
    surfaceRect: { left: 0, top: 0, width: 390, height: 700 },
    video: { width: 1280, height: 720 },
    camera: { frameRate: 60 },
    rates: { ocularSampleRateHz: 60 },
  };
  const point = buildOcularReadingSeries([], [phone])[0];
  assert.equal(point.comparisonKey, 'phone|portrait|high-temporal|calibrated-mediapipe');
  assert.equal(point.deviceClass, 'phone');
  assert.equal(point.deviceClassSource, 'confirmed');
});

test('same signal on phone and tablet never shares a trend group', () => {
  const phone = diagnosticCapture('phone', 100, validity('comparable'));
  const tablet = diagnosticCapture('tablet', 200, validity('comparable'));
  phone.environment = { ...phone.environment!, deviceClass: 'phone', deviceClassSource: 'confirmed' };
  tablet.environment = { ...tablet.environment!, deviceClass: 'tablet', deviceClassSource: 'confirmed' };
  const partition = partitionOcularReadingSeries(buildOcularReadingSeries([], [phone, tablet]));
  assert.equal(partition.comparableGroups.length, 2);
  assert.match(partition.comparableGroups[0].label, /Celular/);
  assert.match(partition.comparableGroups[1].label, /Tablet/);
});

test('suggested and legacy-inferred classes stay outside trends', () => {
  for (const source of ['suggested', 'legacy-inferred'] as const) {
    const capture = diagnosticCapture(source, 100, validity('comparable'));
    capture.environment = { ...capture.environment!, deviceClass: 'phone', deviceClassSource: source };
    const point = buildOcularReadingSeries([], [capture])[0];
    assert.equal(point.comparisonKey, null, source);
    assert.equal(point.comparisonExclusionReason, 'missing-comparison-context', source);
  }
});
```

Add `deviceClass: 'phone'` and `deviceClassSource: 'confirmed'` to existing
assisted-reading `extraData` fixtures that are intended to be comparable. Add one
assertion that changing the source to `suggested` yields `comparisonKey: null`;
this locks the Player/session path as well as diagnostic captures.

In `src/hooks/useCaptureLifecycle.test.ts`, add a pure assertion by exporting a small helper in the implementation step:

```ts
import { captureDeviceClassConfirmed } from './useCaptureLifecycle';

test('only an explicitly confirmed frozen environment is validity-eligible', () => {
  assert.equal(captureDeviceClassConfirmed({ deviceClassSource: 'confirmed' }), true);
  assert.equal(captureDeviceClassConfirmed({ deviceClassSource: 'suggested' }), false);
  assert.equal(captureDeviceClassConfirmed({ deviceClassSource: 'legacy-inferred' }), false);
});
```

- [ ] **Step 2: Run focused RED**

Run:

```bash
npx tsx --test src/services/statisticsSummary.test.ts src/hooks/useCaptureLifecycle.test.ts
```

Expected: FAIL because the point metadata, key dimension and helper do not exist.

- [ ] **Step 3: Freeze the resolved class in the capture start snapshot**

In `EyeTrackingTestScreen.tsx`, import `resolveDeviceClass` and add inside `buildCaptureStartSnapshot()` before `environment`:

```ts
    const device = resolveDeviceClass(profile, {
      width,
      height,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    });
```

Then add to `environment`:

```ts
      deviceClass: device.deviceClass,
      deviceClassSource: device.deviceClassSource,
```

In `useCaptureLifecycle.ts`, export and use:

```ts
export function captureDeviceClassConfirmed(
  environment: Pick<CaptureEnvironment, 'deviceClassSource'>,
): boolean {
  return environment.deviceClassSource === 'confirmed';
}
```

Add to the `assessCaptureValidity()` input:

```ts
      deviceClassConfirmed: captureDeviceClassConfirmed(environment),
```

In `ExercisePlayerScreen.tsx`, create
`const sessionDeviceRef = useRef<DeviceClassDecision | null>(null)`. At the start
of `handlePreContextSubmit()`, freeze `resolveDeviceClass(profile, current
capabilities)` into that ref. In `handleExerciseFinish()`, persist it with every
exercise result:

```ts
const device = sessionDeviceRef.current;
const persistedExtraData = {
  ...extraData,
  ...(device ? {
    deviceClass: device.deviceClass,
    deviceClassSource: device.deviceClassSource,
  } : {}),
};
```

Use `persistedExtraData` for `exerciseCompleted`, `newResult.extraData` and the
assisted-reading branch. The session therefore keeps the same class even if the
window is rotated later; suggested classes remain in audit because their source
is not confirmed.

- [ ] **Step 4: Extend the point and insight contracts**

In `statisticsSummary.ts`:

```ts
// OcularReadingPoint fields
  deviceClass: DeviceClass | null;
  deviceClassSource: DeviceClassSource | null;

// DiagnosticInsightRecord field
  deviceClass: DeviceClass | null;
```

Import `DeviceClass` and `DeviceClassSource`. For capture points, normalize from
`capture.environment`; for reading-session points, normalize from
`exercise.extraData?.deviceClass` and `deviceClassSource` without inventing values.
Call eligibility as:

```ts
const eligibility = trendEligibility(
  runtimeValidity,
  orientation,
  deviceClass,
  deviceClassSource,
);
```

Replace `trendEligibility()` with:

```ts
function trendEligibility(
  validity: CaptureValiditySnapshot,
  orientation: OcularReadingPoint['orientation'],
  deviceClass: DeviceClass | null,
  deviceClassSource: DeviceClassSource | null,
): { key: string | null; reason: TrendExclusionReason | null } {
  const validation = validatePersistedCaptureValidityForTrend(validity);
  if (!validation.eligible) return { key: null, reason: validation.reason };
  if (!isOrientation(orientation) || !deviceClass || deviceClassSource !== 'confirmed') {
    return { key: null, reason: 'missing-comparison-context' };
  }
  return {
    key: `${deviceClass}|${orientation}|${validity.temporalTier}|${validity.signalSource}`,
    reason: null,
  };
}
```

Add safe normalizers:

```ts
function normalizeDeviceClass(value: unknown): DeviceClass | null {
  return value === 'phone' || value === 'tablet' || value === 'desktop' ? value : null;
}

function normalizeDeviceClassSource(value: unknown): DeviceClassSource | null {
  return value === 'confirmed' || value === 'suggested' || value === 'legacy-inferred'
    ? value
    : null;
}
```

Prefix `comparisonLabel()` with `Celular`, `Tablet` or `Desktop`, and include
`deviceClass: point.deviceClass` in `diagnosticInsightRecord()`.

- [ ] **Step 5: Update existing fixtures and exact-key assertions**

Every comparable fixture in `statisticsSummary.test.ts` must include a confirmed
device environment through the helper default. Tests for missing/unknown/null
orientation pass `null` as the helper's final device-source argument so the
environment cannot accidentally restore orientation through its viewport.
Legacy tests that specifically prove absent provenance also pass `null`.
Replace the old exact assertion:

```ts
assert.equal(point.comparisonKey, 'portrait|high-temporal|calibrated-mediapipe');
```

with:

```ts
assert.equal(point.comparisonKey, 'phone|portrait|high-temporal|calibrated-mediapipe');
```

Legacy fixtures intentionally omit device metadata and must assert audit, not be
cast into a confirmed class.

- [ ] **Step 6: Run GREEN and the full unit gate**

Run:

```bash
npx tsx --test src/services/statisticsSummary.test.ts src/hooks/useCaptureLifecycle.test.ts src/services/captureValidity.test.ts && npm test && npm run lint
```

Expected: focused tests and complete unit suite PASS; TypeScript clean.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/screens/EyeTrackingTestScreen.tsx src/screens/ExercisePlayerScreen.tsx src/hooks/useCaptureLifecycle.ts src/hooks/useCaptureLifecycle.test.ts src/services/statisticsSummary.ts src/services/statisticsSummary.test.ts
git commit -m "feat: partition ocular trends by device class"
```

---

### Task 3: Project real storage into the experimental notebook

**Files:**
- Create: `src/services/experimentNotebookProjection.ts`
- Create: `src/services/experimentNotebookProjection.test.ts`

**Interfaces:**
- Consumes: `buildOcularReadingSeries()` and `partitionOcularReadingSeries()` from Task 2.
- Produces: `ExperimentNotebookProjection`, `NotebookRecord` and `buildExperimentNotebookProjection()` for Today and Sessions.
- Does not read or write IndexedDB; callers inject arrays from the three existing stores.

- [ ] **Step 1: Write RED projection tests**

Create `src/services/experimentNotebookProjection.test.ts` with fixtures for one
confirmed comparable capture, one exploratory capture, one invalid capture, one
recall linked to the comparable capture, one unlinked recall and one training
session. Assert:

```ts
const projection = buildExperimentNotebookProjection({ sessions, captures, recalls });

assert.equal(projection.series.title, 'Leitura — série atual');
assert.deepEqual(projection.comparable.map(item => item.sourceId), ['cap-valid']);
assert.deepEqual(projection.baselines.map(item => item.sourceId), ['cap-baseline']);
assert.deepEqual(projection.audit.map(item => item.sourceId), ['cap-invalid']);
assert.equal(projection.comparable[0].recall?.scoreLabel, '5/6');
assert.equal(projection.recent[0].timestamp >= projection.recent[1].timestamp, true);
assert.equal(projection.activities.some(item => item.kind === 'training'), true);
assert.equal(projection.activities.some(item => item.kind === 'recall'), true);
assert.equal(projection.counts.total, projection.all.length);
```

Add a second test proving a v1-comparable legacy capture without confirmed device
metadata goes to `audit`; a consistent compact 390x844 environment is displayed
as `{ deviceClass: 'phone', deviceClassSource: 'legacy-inferred' }`, while an
ambiguous 700x700 environment stays null. Add a third test proving inputs are not
sorted or mutated in place.

- [ ] **Step 2: Run RED**

Run:

```bash
npx tsx --test src/services/experimentNotebookProjection.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the projection contract**

Create `src/services/experimentNotebookProjection.ts` with these public types:

```ts
import type {
  DeviceClass,
  DeviceClassSource,
  RecallTestResult,
  SessionResult,
  ValidationCapture,
} from '@/types';
import { inferLegacyDeviceClass } from './deviceClass';
import {
  buildOcularReadingSeries,
  partitionOcularReadingSeries,
  type OcularReadingPoint,
} from './statisticsSummary';

export type NotebookBucket = 'comparable' | 'baseline' | 'audit' | 'activity';
export type NotebookRecordKind = 'capture' | 'recall' | 'training';

export interface NotebookRecord {
  id: string;
  sourceId: string;
  kind: NotebookRecordKind;
  bucket: NotebookBucket;
  timestamp: number;
  title: string;
  statusLabel: string;
  deviceClass: DeviceClass | null;
  deviceClassSource: DeviceClassSource | null;
  deviceLabel: string;
  sampleRateLabel: string | null;
  detail: string;
  recall: { scoreLabel: string; topic: string } | null;
}

export interface ExperimentNotebookProjection {
  series: { title: 'Leitura — série atual'; comparisonKey: string | null; comparisonLabel: string | null };
  all: NotebookRecord[];
  recent: NotebookRecord[];
  comparable: NotebookRecord[];
  baselines: NotebookRecord[];
  audit: NotebookRecord[];
  activities: NotebookRecord[];
  counts: { total: number; comparable: number; baselines: number; audit: number; activities: number };
}

export function buildExperimentNotebookProjection(input: {
  sessions: SessionResult[];
  captures: ValidationCapture[];
  recalls: RecallTestResult[];
}): ExperimentNotebookProjection {
  const points = buildOcularReadingSeries([], input.captures);
  const partition = partitionOcularReadingSeries(points);
  const comparableIds = new Set(partition.comparableGroups.flatMap(group => group.points.map(point => point.id)));
  const pointById = new Map(points.map(point => [point.id, point]));
  const recallByCapture = new Map(
    input.recalls.filter(recall => recall.captureId).map(recall => [recall.captureId!, recall]),
  );

  const captureRecords = input.captures.map(capture => {
    const point = pointById.get(capture.id)!;
    const linkedRecall = recallByCapture.get(capture.id) ?? null;
    const bucket: NotebookBucket = comparableIds.has(capture.id)
      ? 'comparable'
      : point.validity.grade === 'exploratory'
        ? 'baseline'
        : 'audit';
    return captureRecord(capture, point, linkedRecall, bucket);
  });

  const linkedRecallIds = new Set(recallByCapture.values());
  const recallActivities = input.recalls
    .filter(recall => !linkedRecallIds.has(recall))
    .map(recallActivityRecord);
  const trainingActivities = input.sessions.map(trainingActivityRecord);
  const activities = [...recallActivities, ...trainingActivities];
  const all = [...captureRecords, ...activities].sort((a, b) => b.timestamp - a.timestamp);
  const recent = all.slice(0, 8);
  const newestGroup = [...partition.comparableGroups]
    .sort((a, b) => (b.points.at(-1)?.timestamp ?? 0) - (a.points.at(-1)?.timestamp ?? 0))[0] ?? null;

  const comparable = captureRecords.filter(record => record.bucket === 'comparable');
  const baselines = captureRecords.filter(record => record.bucket === 'baseline');
  const audit = captureRecords.filter(record => record.bucket === 'audit');
  return {
    series: {
      title: 'Leitura — série atual',
      comparisonKey: newestGroup?.key ?? null,
      comparisonLabel: newestGroup?.label ?? null,
    },
    all,
    recent,
    comparable,
    baselines,
    audit,
    activities,
    counts: {
      total: all.length,
      comparable: comparable.length,
      baselines: baselines.length,
      audit: audit.length,
      activities: activities.length,
    },
  };
}
```

In the same file, add the exact private helpers below. They merge linked recall
into its capture, never duplicate it as an activity, and never describe training
as ocular-comparable:

```ts
const DEVICE_LABEL: Record<DeviceClass, string> = {
  phone: 'Celular',
  tablet: 'Tablet',
  desktop: 'Desktop',
};

function deviceLabel(deviceClass: DeviceClass | null): string {
  return deviceClass ? DEVICE_LABEL[deviceClass] : 'Classe não confirmada';
}

function finiteSampleRateLabel(value: number | null): string | null {
  return value !== null && Number.isFinite(value) ? `${Math.round(value)} Hz` : null;
}

function captureRecord(
  capture: ValidationCapture,
  point: OcularReadingPoint,
  recall: RecallTestResult | null,
  bucket: Exclude<NotebookBucket, 'activity'>,
): NotebookRecord {
  const legacyDevice = point.deviceClass
    ? null
    : inferLegacyDeviceClass({
        layoutMode: capture.environment?.layoutMode,
        viewport: capture.environment?.viewport,
      });
  const deviceClass = point.deviceClass ?? legacyDevice?.deviceClass ?? null;
  const deviceClassSource = point.deviceClassSource ?? legacyDevice?.deviceClassSource ?? null;
  const statusLabel = bucket === 'comparable'
    ? 'Sessão válida'
    : bucket === 'baseline'
      ? 'Baseline exploratório'
      : point.validity.grade === 'invalid'
        ? 'Tentativa não utilizável'
        : 'Contexto insuficiente';
  return {
    id: `capture:${capture.id}`,
    sourceId: capture.id,
    kind: 'capture',
    bucket,
    timestamp: capture.timestamp,
    title: recall ? `Leitura — ${recall.topic}` : 'Leitura ocular',
    statusLabel,
    deviceClass,
    deviceClassSource,
    deviceLabel: deviceLabel(deviceClass),
    sampleRateLabel: finiteSampleRateLabel(point.sampleRateHz),
    detail: point.validity.reasonCodes.length
      ? point.validity.reasonCodes.join(', ')
      : `${point.saccades} sacadas · ${point.regressions} regressões`,
    recall: recall
      ? { scoreLabel: `${recall.score}/${recall.questions.length}`, topic: recall.topic }
      : null,
  };
}

function recallActivityRecord(recall: RecallTestResult): NotebookRecord {
  return {
    id: `recall:${recall.id}`,
    sourceId: recall.id,
    kind: 'recall',
    bucket: 'activity',
    timestamp: recall.timestamp,
    title: `Recall — ${recall.topic}`,
    statusLabel: 'Recall registrado',
    deviceClass: null,
    deviceClassSource: null,
    deviceLabel: 'Classe não confirmada',
    sampleRateLabel: null,
    detail: `${recall.score}/${recall.questions.length} respostas corretas`,
    recall: { scoreLabel: `${recall.score}/${recall.questions.length}`, topic: recall.topic },
  };
}

function trainingActivityRecord(session: SessionResult): NotebookRecord {
  const exerciseCount = session.exercises.length;
  return {
    id: `training:${session.id}`,
    sourceId: session.id,
    kind: 'training',
    bucket: 'activity',
    timestamp: session.timestamp,
    title: session.clinicianSummaryPtBR || 'Plano de treino',
    statusLabel: 'Treino registrado',
    deviceClass: null,
    deviceClassSource: null,
    deviceLabel: 'Classe não confirmada',
    sampleRateLabel: null,
    detail: `${Math.round(session.durationSec / 60)} min · ${exerciseCount} ${exerciseCount === 1 ? 'exercício' : 'exercícios'}`,
    recall: null,
  };
}
```

- [ ] **Step 4: Run GREEN and verify immutability**

Run:

```bash
npx tsx --test src/services/experimentNotebookProjection.test.ts && npm run lint
```

Expected: PASS; TypeScript clean.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/services/experimentNotebookProjection.ts src/services/experimentNotebookProjection.test.ts
git commit -m "feat: project real records into experiment notebook"
```

---

### Task 4: Make session transitions explicit and testable

**Files:**
- Create: `src/services/assessmentSessionController.ts`
- Create: `src/services/assessmentSessionController.test.ts`
- Modify: `src/services/assessmentFlow.ts`
- Modify: `src/services/assessmentFlow.test.ts`
- Modify: `src/services/assessmentAdapter.ts`
- Modify: `src/services/assessmentAdapter.test.ts`

**Interfaces:**
- Produces: `AssessmentSessionState`, `AssessmentSessionEvent`, `transitionAssessmentSession()` and `assessmentSessionStatus()`.
- Consumes: `AssessmentMode`; owns orchestration status only, never camera, calibration, capture or recall algorithms.
- Replaces: competing stage reconstruction in `deriveAssessmentStage()` after downstream integration in Task 8.

- [ ] **Step 1: Write the failing transition tests**

Create `src/services/assessmentSessionController.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessmentSessionStatus,
  initialAssessmentSessionState,
  transitionAssessmentSession,
} from './assessmentSessionController';

test('runs the comparable recall path through explicit states', () => {
  let state = initialAssessmentSessionState('recall');
  state = transitionAssessmentSession(state, { type: 'BEGIN' });
  assert.equal(assessmentSessionStatus(state), 'checking-readiness');
  state = transitionAssessmentSession(state, { type: 'READINESS_PASSED', needsCalibration: true });
  assert.equal(assessmentSessionStatus(state), 'calibrating');
  state = transitionAssessmentSession(state, { type: 'CALIBRATION_ACCEPTED' });
  state = transitionAssessmentSession(state, { type: 'VALIDATION_PASSED' });
  assert.equal(assessmentSessionStatus(state), 'ready');
  state = transitionAssessmentSession(state, { type: 'CAPTURE_STARTED' });
  assert.equal(assessmentSessionStatus(state), 'capturing');
  state = transitionAssessmentSession(state, { type: 'CAPTURE_FINISHED', withRecall: true });
  assert.equal(assessmentSessionStatus(state), 'generating-recall');
  assert.equal(state.persistence, 'saving');
  state = transitionAssessmentSession(state, { type: 'SAVE_SUCCEEDED' });
  state = transitionAssessmentSession(state, { type: 'RECALL_READY' });
  state = transitionAssessmentSession(state, { type: 'QUIZ_FINISHED' });
  assert.equal(assessmentSessionStatus(state), 'result');
  assert.equal(state.persistence, 'saved');
});

test('readiness failure can continue only through explicit exploratory consent', () => {
  let state = transitionAssessmentSession(initialAssessmentSessionState('capture'), { type: 'BEGIN' });
  state = transitionAssessmentSession(state, {
    type: 'READINESS_FAILED',
    reason: 'Classe de dispositivo não confirmada',
    canRunExploratory: true,
  });
  assert.equal(state.phase, 'setup');
  assert.equal(state.blockReason, 'Classe de dispositivo não confirmada');
  state = transitionAssessmentSession(state, { type: 'RUN_EXPLORATORY' });
  assert.equal(assessmentSessionStatus(state), 'ready');
  assert.equal(state.exploratory, true);
});

test('interruption ends the run and reset is required before another capture', () => {
  const capturing = {
    ...initialAssessmentSessionState('capture'),
    phase: 'capturing' as const,
  };
  const interrupted = transitionAssessmentSession(capturing, {
    type: 'INTERRUPTED',
    reason: 'orientation-changed-during-capture',
  });
  assert.equal(assessmentSessionStatus(interrupted), 'interrupted');
  assert.equal(interrupted.interruptionReason, 'orientation-changed-during-capture');
  assert.equal(
    assessmentSessionStatus(transitionAssessmentSession(interrupted, { type: 'CAPTURE_STARTED' })),
    'interrupted',
  );
  assert.match(interrupted.transitionError ?? '', /CAPTURE_STARTED/);
  assert.equal(
    assessmentSessionStatus(transitionAssessmentSession(interrupted, { type: 'RESET' })),
    'setup',
  );
});

test('save failure is visible and retry returns to saving', () => {
  let state = {
    ...initialAssessmentSessionState('capture'),
    phase: 'result' as const,
    persistence: 'saving' as const,
  };
  state = transitionAssessmentSession(state, { type: 'SAVE_FAILED' });
  assert.equal(assessmentSessionStatus(state), 'save-failed');
  state = transitionAssessmentSession(state, { type: 'RETRY_SAVE' });
  assert.equal(assessmentSessionStatus(state), 'saving');
});

test('recall generation retry reuses the completed ocular run', () => {
  let state = {
    ...initialAssessmentSessionState('recall'),
    phase: 'generating-recall' as const,
    persistence: 'saved' as const,
  };
  state = transitionAssessmentSession(state, { type: 'RECALL_FAILED', reason: 'Backend offline' });
  assert.equal(assessmentSessionStatus(state), 'result');
  state = transitionAssessmentSession(state, { type: 'RETRY_RECALL' });
  assert.equal(assessmentSessionStatus(state), 'generating-recall');
  assert.equal(state.persistence, 'saved');
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npx tsx --test src/services/assessmentSessionController.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the pure controller**

Create `src/services/assessmentSessionController.ts`:

```ts
import type { AssessmentMode } from '@/types';
import type { CaptureInterruptionReason } from './captureValidity';

export type AssessmentSessionPhase =
  | 'setup'
  | 'checking-readiness'
  | 'calibrating'
  | 'validating'
  | 'ready'
  | 'capturing'
  | 'generating-recall'
  | 'quiz'
  | 'result'
  | 'interrupted';

export type AssessmentSessionStatus = AssessmentSessionPhase | 'saving' | 'save-failed';
export type AssessmentPersistence = 'idle' | 'saving' | 'saved' | 'failed';

export interface AssessmentSessionState {
  mode: AssessmentMode;
  phase: AssessmentSessionPhase;
  persistence: AssessmentPersistence;
  exploratory: boolean;
  canRunExploratory: boolean;
  blockReason: string | null;
  interruptionReason: CaptureInterruptionReason | null;
  transitionError: string | null;
}

export type AssessmentSessionEvent =
  | { type: 'BEGIN' }
  | { type: 'READINESS_PASSED'; needsCalibration: boolean }
  | { type: 'READINESS_FAILED'; reason: string; canRunExploratory: boolean }
  | { type: 'RUN_EXPLORATORY' }
  | { type: 'CALIBRATION_ACCEPTED' }
  | { type: 'CALIBRATION_SKIPPED' }
  | { type: 'VALIDATION_PASSED' }
  | { type: 'VALIDATION_FAILED'; reason: string; canRunExploratory: boolean }
  | { type: 'CAPTURE_STARTED' }
  | { type: 'CAPTURE_FINISHED'; withRecall: boolean }
  | { type: 'RECALL_READY' }
  | { type: 'RECALL_FAILED'; reason: string }
  | { type: 'RETRY_RECALL' }
  | { type: 'QUIZ_FINISHED' }
  | { type: 'SAVE_SUCCEEDED' }
  | { type: 'SAVE_FAILED' }
  | { type: 'RETRY_SAVE' }
  | { type: 'INTERRUPTED'; reason: CaptureInterruptionReason }
  | { type: 'RESET' };

export function initialAssessmentSessionState(mode: AssessmentMode): AssessmentSessionState {
  return {
    mode,
    phase: 'setup',
    persistence: 'idle',
    exploratory: false,
    canRunExploratory: false,
    blockReason: null,
    interruptionReason: null,
    transitionError: null,
  };
}

export function assessmentSessionStatus(state: AssessmentSessionState): AssessmentSessionStatus {
  if (state.phase === 'result' && state.persistence === 'saving') return 'saving';
  if (state.phase === 'result' && state.persistence === 'failed') return 'save-failed';
  return state.phase;
}

function reject(state: AssessmentSessionState, event: AssessmentSessionEvent): AssessmentSessionState {
  return { ...state, transitionError: `${state.phase}:${event.type}` };
}

export function transitionAssessmentSession(
  state: AssessmentSessionState,
  event: AssessmentSessionEvent,
): AssessmentSessionState {
  if (event.type === 'RESET') return initialAssessmentSessionState(state.mode);
  if (event.type === 'INTERRUPTED' && state.phase !== 'setup' && state.phase !== 'result') {
    return { ...state, phase: 'interrupted', interruptionReason: event.reason, transitionError: null };
  }
  if (event.type === 'SAVE_SUCCEEDED' && state.persistence === 'saving') {
    return { ...state, persistence: 'saved', transitionError: null };
  }
  if (event.type === 'SAVE_FAILED' && state.persistence === 'saving') {
    return { ...state, persistence: 'failed', transitionError: null };
  }
  if (event.type === 'RETRY_SAVE' && state.persistence === 'failed') {
    return { ...state, persistence: 'saving', transitionError: null };
  }

  switch (state.phase) {
    case 'setup':
      if (event.type === 'BEGIN') return { ...state, phase: 'checking-readiness', blockReason: null, transitionError: null };
      if (event.type === 'RUN_EXPLORATORY' && state.canRunExploratory) {
        return { ...state, phase: 'ready', exploratory: true, blockReason: null, transitionError: null };
      }
      return reject(state, event);
    case 'checking-readiness':
      if (event.type === 'READINESS_PASSED') {
        return { ...state, phase: event.needsCalibration ? 'calibrating' : 'validating', transitionError: null };
      }
      if (event.type === 'READINESS_FAILED') {
        return { ...state, phase: 'setup', blockReason: event.reason, canRunExploratory: event.canRunExploratory, transitionError: null };
      }
      return reject(state, event);
    case 'calibrating':
      if (event.type === 'CALIBRATION_ACCEPTED') return { ...state, phase: 'validating', transitionError: null };
      if (event.type === 'CALIBRATION_SKIPPED') return { ...state, phase: 'ready', exploratory: true, transitionError: null };
      return reject(state, event);
    case 'validating':
      if (event.type === 'VALIDATION_PASSED') return { ...state, phase: 'ready', transitionError: null };
      if (event.type === 'VALIDATION_FAILED') {
        return { ...state, phase: 'setup', blockReason: event.reason, canRunExploratory: event.canRunExploratory, transitionError: null };
      }
      return reject(state, event);
    case 'ready':
      return event.type === 'CAPTURE_STARTED'
        ? { ...state, phase: 'capturing', transitionError: null }
        : reject(state, event);
    case 'capturing':
      return event.type === 'CAPTURE_FINISHED'
        ? {
            ...state,
            phase: event.withRecall ? 'generating-recall' : 'result',
            persistence: 'saving',
            transitionError: null,
          }
        : reject(state, event);
    case 'generating-recall':
      if (event.type === 'RECALL_READY') return { ...state, phase: 'quiz', transitionError: null };
      if (event.type === 'RECALL_FAILED') return { ...state, phase: 'result', blockReason: event.reason, transitionError: null };
      return reject(state, event);
    case 'quiz':
      return event.type === 'QUIZ_FINISHED'
        ? { ...state, phase: 'result', transitionError: null }
        : reject(state, event);
    case 'result':
      if (event.type === 'RETRY_RECALL' && state.mode === 'recall' && state.blockReason) {
        return { ...state, phase: 'generating-recall', blockReason: null, transitionError: null };
      }
      return reject(state, event);
    case 'interrupted':
      return reject(state, event);
  }
}
```

- [ ] **Step 4: Make existing adapters accept the controller status**

Change `AssessmentWorkspaceSnapshot.stage` and `AssessmentSessionSurface` later in
Task 8; for now add an optional `controllerStatus` to
`BuildAssessmentWorkspaceSnapshotInput` that is restricted to currently compatible
stages, then prefer it when present:

```ts
controllerStatus?: Extract<AssessmentSessionStatus, AssessmentStage>;

const stage = input.controllerStatus ?? deriveAssessmentStage(stageInput);
```

Update `assessmentFlow`/`assessmentAdapter` tests with one case proving
`controllerStatus: 'capturing'` wins over stale passive booleans. Keep the legacy
derivation until Task 8 has integrated all events.

- [ ] **Step 5: Run GREEN and adapter regression tests**

Run:

```bash
npx tsx --test src/services/assessmentSessionController.test.ts src/services/assessmentFlow.test.ts src/services/assessmentAdapter.test.ts && npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/services/assessmentSessionController.ts src/services/assessmentSessionController.test.ts src/services/assessmentFlow.ts src/services/assessmentFlow.test.ts src/services/assessmentAdapter.ts src/services/assessmentAdapter.test.ts
git commit -m "feat: add explicit assessment session controller"
```

---

### Task 5: Build the responsive notebook and four-destination shell

**Files:**
- Create: `src/components/notebook/NotebookRecordRow.tsx`
- Create: `src/components/notebook/ExperimentNotebookScreen.tsx`
- Modify: `src/services/appSections.ts`
- Modify: `src/services/appSections.test.ts`
- Modify: `src/services/assessmentShell.test.ts`
- Modify: `src/components/app/AppSidebar.tsx`
- Modify: `src/components/app/AppShell.tsx`
- Modify: `src/screens/AssessmentWorkspaceScreen.tsx`
- Modify: `src/components/assessment/AssessmentSetupPanel.tsx`

**Interfaces:**
- Consumes: `ExperimentNotebookProjection` from Task 3.
- Produces: pure `ExperimentNotebookScreen` with `onNewSession`, `onOpenRecord`, `onOpenLibrary`, `onOpenTraining` callbacks.
- Preserves: `/library` and `/player` as secondary tools even though the primary nav has four destinations.

- [ ] **Step 1: Lock the primary navigation contract in RED tests**

Replace the shell expectations in `appSections.test.ts` and
`assessmentShell.test.ts` with:

```ts
assert.deepEqual(APP_SECTIONS, [
  { id: 'today', label: 'Hoje', href: '/assessment', available: true },
  { id: 'sessions', label: 'Sessões', href: '/history', available: true },
  { id: 'progress', label: 'Progresso', href: '/dashboard', available: true },
  { id: 'settings', label: 'Ajustes', href: '/settings', available: true },
]);
assert.equal(APP_SECTIONS.some(section => section.href === '/library'), false);
assert.equal(APP_SECTIONS.some(section => section.href === '/player'), false);
```

The second pair proves Library/Player are tools, not deleted routes or duplicate
primary tabs.

- [ ] **Step 2: Run RED**

Run:

```bash
npx tsx --test src/services/appSections.test.ts src/services/assessmentShell.test.ts
```

Expected: FAIL against the current five-section shell.

- [ ] **Step 3: Implement the record row**

Create `src/components/notebook/NotebookRecordRow.tsx`:

```tsx
import { Activity, ChevronRight, CircleCheck, FlaskConical, TriangleAlert } from 'lucide-react';
import type { NotebookRecord } from '@/services/experimentNotebookProjection';

const bucketStyle = {
  comparable: { icon: CircleCheck, iconClass: 'bg-emerald-100 text-emerald-700', label: 'text-emerald-700' },
  baseline: { icon: FlaskConical, iconClass: 'border border-dashed border-accent text-accent', label: 'text-accent-strong' },
  audit: { icon: TriangleAlert, iconClass: 'bg-rose-100 text-rose-700', label: 'text-rose-700' },
  activity: { icon: Activity, iconClass: 'bg-app-inset text-mild', label: 'text-mild' },
} as const;

export function NotebookRecordRow({
  record,
  onOpen,
}: {
  record: NotebookRecord;
  onOpen: (record: NotebookRecord) => void;
}) {
  const style = bucketStyle[record.bucket];
  const Icon = style.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(record)}
      className="grid min-h-20 w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-line-strong py-4 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className={`grid h-12 w-12 place-items-center rounded-full ${style.iconClass}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-bold ${style.label}`}>{record.statusLabel}</span>
        <span className="mt-1 block truncate text-sm font-medium text-mild">
          {record.deviceLabel}{record.sampleRateLabel ? ` · ${record.sampleRateLabel}` : ''}
        </span>
        <span className="mt-1 block text-xs text-faint">
          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(record.timestamp)}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 text-faint" aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 4: Implement the pure notebook screen**

Create `src/components/notebook/ExperimentNotebookScreen.tsx` as a pure component
with this structure and exact test ids:

```tsx
import { BookOpen, CalendarDays, Crosshair, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ExperimentNotebookProjection, NotebookRecord } from '@/services/experimentNotebookProjection';
import { NotebookRecordRow } from './NotebookRecordRow';

export function ExperimentNotebookScreen({
  projection,
  loading,
  todayTimestamp,
  onNewSession,
  onOpenRecord,
  onOpenLibrary,
  onOpenTraining,
}: {
  projection: ExperimentNotebookProjection;
  loading: boolean;
  todayTimestamp: number;
  onNewSession: () => void;
  onOpenRecord: (record: NotebookRecord) => void;
  onOpenLibrary: () => void;
  onOpenTraining: () => void;
}) {
  return (
    <div data-testid="experiment-notebook" className="mx-auto w-full max-w-[1440px]">
      <header className="mb-5 flex items-start justify-between gap-4 px-1 md:mb-8">
        <div>
          <p className="text-2xl font-bold tracking-tight text-strong md:text-3xl">Linha Fixa</p>
          <p className="mt-1 text-sm font-semibold text-mild">Caderno Experimental</p>
        </div>
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-mild">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(todayTimestamp)}
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] xl:items-stretch">
        <section data-testid="current-series-card" className="flex min-h-[26rem] flex-col rounded-[2rem] bg-gradient-to-br from-indigo-600 via-indigo-800 to-slate-950 p-6 text-white shadow-xl md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-200">Série atual</p>
          <h1 className="mt-5 text-3xl font-bold tracking-tight md:text-5xl">{projection.series.title}</h1>
          <p className="mt-4 max-w-xl text-base font-medium leading-7 text-indigo-100">
            Acompanhe suas sessões e registre novas execuções da série.
          </p>
          {projection.series.comparisonLabel ? (
            <p className="mt-4 text-sm font-semibold text-indigo-200">{projection.series.comparisonLabel}</p>
          ) : null}
          <button
            type="button"
            onClick={onNewSession}
            className="mt-auto inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-4 text-lg font-bold text-indigo-700 shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300"
          >
            <Crosshair className="h-6 w-6" aria-hidden="true" /> Nova sessão
          </button>
        </section>

        <section data-testid="recent-sessions-card" className="rounded-[2rem] border border-line-strong bg-surface p-5 shadow-sm md:p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-strong">Sessões recentes</h2>
            <Link to="/history" className="text-sm font-bold text-accent">Mais antigas</Link>
          </div>
          {loading ? (
            <p role="status" className="mt-8 text-sm font-medium text-mild">Carregando registros locais…</p>
          ) : projection.recent.length ? (
            <div className="mt-5">{projection.recent.map(record => <NotebookRecordRow key={record.id} record={record} onOpen={onOpenRecord} />)}</div>
          ) : (
            <p className="mt-8 rounded-2xl border border-dashed border-line-strong p-5 text-sm font-medium text-mild">Nenhuma sessão registrada ainda.</p>
          )}
          <p className="mt-5 text-sm font-medium text-mild">Comparações somente dentro da mesma classe de dispositivo e chave metodológica.</p>
        </section>
      </div>

      <section data-testid="preserved-tools" className="mt-6 grid gap-4 md:grid-cols-2">
        <button type="button" onClick={onOpenTraining} className="flex min-h-24 items-center gap-4 rounded-3xl border border-line-strong bg-surface p-5 text-left">
          <Play className="h-6 w-6 text-accent" aria-hidden="true" />
          <span><strong className="block text-strong">Plano de treino</strong><span className="mt-1 block text-sm text-mild">Contexto, safety gate e protocolo adaptativo.</span></span>
        </button>
        <button type="button" onClick={onOpenLibrary} className="flex min-h-24 items-center gap-4 rounded-3xl border border-line-strong bg-surface p-5 text-left">
          <BookOpen className="h-6 w-6 text-accent" aria-hidden="true" />
          <span><strong className="block text-strong">Biblioteca</strong><span className="mt-1 block text-sm text-mild">Fixação, Sacadas, Perseguição suave e Leitura assistida.</span></span>
        </button>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Replace the primary section list and responsive chrome**

Set `APP_SECTIONS` to:

```ts
export const APP_SECTIONS = [
  { id: 'today', label: 'Hoje', href: '/assessment', available: true },
  { id: 'sessions', label: 'Sessões', href: '/history', available: true },
  { id: 'progress', label: 'Progresso', href: '/dashboard', available: true },
  { id: 'settings', label: 'Ajustes', href: '/settings', available: true },
] as const;
```

In `AppSidebar.tsx`, replace the icon map and outer chrome with:

```tsx
const SECTION_ICONS = {
  today: Home,
  sessions: BookOpenText,
  progress: ChartNoAxesCombined,
  settings: Settings,
} satisfies Record<(typeof APP_SECTIONS)[number]['id'], typeof Home>;

return (
  <aside className="fixed inset-x-0 bottom-0 z-50 border-t border-line-strong bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur md:sticky md:top-0 md:h-[100svh] md:w-[9.25rem] md:self-start md:border-r md:border-t-0 md:p-3 md:shadow-none xl:w-[17.5rem] xl:p-6">
    <div className="hidden items-center gap-3 rounded-3xl bg-surface-sunken p-3 md:flex md:flex-col xl:flex-row">
      <Activity className="h-8 w-8 text-accent" aria-hidden="true" />
      <span className="hidden font-bold text-strong xl:inline">Linha Fixa</span>
    </div>
    <nav aria-label="Navegação principal" className="grid grid-cols-4 md:mt-6 md:grid-cols-1 md:gap-2">
      {APP_SECTIONS.map(section => {
        const Icon = SECTION_ICONS[section.id];
        const active = isSectionActive(currentPath, section.href);
        return (
          <Link
            key={section.id}
            to={section.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 px-2 text-xs font-bold md:rounded-2xl md:py-3 xl:min-h-14 xl:flex-row xl:justify-start xl:gap-3 xl:px-4 xl:text-sm ${active ? 'bg-ink text-ink-foreground' : 'text-mild hover:bg-app-inset hover:text-strong'}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{section.label}</span>
          </Link>
        );
      })}
    </nav>
  </aside>
);
```

This composes:

- mobile `<768`: fixed bottom nav, `grid-cols-4`, `pb-[env(safe-area-inset-bottom)]`;
- tablet `768-1279`: sticky rail `w-[9.25rem]`, icon over short label;
- desktop `>=1280`: sticky sidebar `w-[17.5rem]`, brand and horizontal icon/label;
- active item uses icon, text and filled surface, never color alone.

In `AppShell.tsx`, add `hideHeader?: boolean`, use
`min-h-[100svh] pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:grid md:grid-cols-[9.25rem_minmax(0,1fr)] md:pb-0 xl:grid-cols-[17.5rem_minmax(0,1fr)]`, and render the generic header only when
`hideHeader !== true`.

- [ ] **Step 6: Make `/assessment` load and render real projection data**

In `AssessmentWorkspaceScreen.tsx`:

```ts
const [sessions, setSessions] = useState<SessionResult[]>([]);
const [launcherOpen, setLauncherOpen] = useState(false);

Promise.all([getSessions(), getValidationCaptures(), getRecallTests()])
  .then(([sessionRows, captureRows, recallRows]) => {
    if (cancelled) return;
    setSessions(sessionRows);
    setCaptures(captureRows);
    setRecalls(recallRows);
  })
```

Build `projection` with `buildExperimentNotebookProjection()`. In the non-live
branch render:

```tsx
<AppShell currentPath={location.pathname} title="Hoje" subtitle="" hideHeader>
  <ExperimentNotebookScreen
    projection={projection}
    loading={loading}
    todayTimestamp={todayTimestamp}
    onNewSession={() => setLauncherOpen(true)}
    onOpenRecord={() => navigate('/history')}
    onOpenTraining={() => navigate('/player')}
    onOpenLibrary={() => navigate('/library')}
  />
  {launcherOpen ? (
    <AssessmentSetupPanel
      latestSessionLabel={latestSessionLabel}
      onStartCapture={() => openSession('capture')}
      onStartRecall={() => openSession('recall')}
      onWarmSession={signalCameraIntent}
      onClose={() => setLauncherOpen(false)}
    />
  ) : null}
</AppShell>
```

Initialize `todayTimestamp` once with `useState(() => Date.now())`; the pure view
must not call the clock itself.

Convert `AssessmentSetupPanel` into an accessible dialog/sheet with `role="dialog"`,
`aria-modal="true"`, heading `Preparar nova sessão`, the two real modes, and a
close button. Use the existing `useModalDialog({ open: true, onEscape: onClose })`
ref so focus enters the first action, Tab remains trapped, Escape closes and focus
returns to `Nova sessão`. Add `motion-reduce:transition-none` to animated chrome.
Do not start camera or request permission until the chosen mode's user gesture.

- [ ] **Step 7: Run unit/type gate**

Run:

```bash
npx tsx --test src/services/appSections.test.ts src/services/assessmentShell.test.ts src/services/experimentNotebookProjection.test.ts && npm run lint && APP_BASE_PATH=/gaze npm run build
```

Expected: tests PASS, TypeScript clean, build under 180000 gzip.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/components/notebook src/services/appSections.ts src/services/appSections.test.ts src/services/assessmentShell.test.ts src/components/app/AppSidebar.tsx src/components/app/AppShell.tsx src/screens/AssessmentWorkspaceScreen.tsx src/components/assessment/AssessmentSetupPanel.tsx
git commit -m "feat: build responsive experimental notebook shell"
```

---

### Task 6: Feed Sessions, Progress and Settings from the new contracts

**Files:**
- Modify: `src/screens/HistoryScreen.tsx`
- Modify: `src/screens/DashboardScreen.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/services/dashboardPresentation.test.ts`
- Modify: `src/services/statisticsSummary.test.ts`

**Interfaces:**
- Consumes: notebook projection, device class resolver and device-aware comparable groups.
- Produces: explicit device-class confirmation in `UserProfile` and complete all-record Sessions view.
- Preserves: local profile compatibility and all existing Dashboard analytics/export behavior.

- [ ] **Step 1: Add RED assertions for the device-aware presentation**

In `statisticsSummary.test.ts`, assert the comparable group label contains the
device label before orientation. In `dashboardPresentation.test.ts`, add an
assertion that the displayed selected-group label is preserved verbatim rather
than reconstructed without device class.

Run:

```bash
npx tsx --test src/services/statisticsSummary.test.ts src/services/dashboardPresentation.test.ts
```

Expected: RED until the presentation consumers use the new label.

- [ ] **Step 2: Add explicit confirmation to Settings**

Initialize Settings form data with:

```ts
const suggestedDevice = resolveDeviceClass(profile, {
  width: window.innerWidth,
  height: window.innerHeight,
  maxTouchPoints: navigator.maxTouchPoints ?? 0,
  coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
});

deviceClass: profile?.deviceClass ?? suggestedDevice.deviceClass,
```

Render a fieldset labelled `Classe deste dispositivo` with three radio buttons:

```tsx
{(['phone', 'tablet', 'desktop'] as const).map(value => (
  <label key={value} className="flex min-h-12 items-center gap-3 rounded-2xl border border-line-strong p-4">
    <input
      type="radio"
      name="deviceClass"
      value={value}
      checked={formData.deviceClass === value}
      onChange={() => setFormData(previous => ({ ...previous, deviceClass: value }))}
    />
    <span>{value === 'phone' ? 'Celular' : value === 'tablet' ? 'Tablet' : 'Desktop'}</span>
  </label>
))}
```

On save, persist:

```ts
const updated: UserProfile = {
  ...formData,
  ...confirmDeviceClass(formData.deviceClass),
  fontSizePreference: formData.fontSizePreference,
  contrastPreference: formData.contrastPreference,
  viewingDistanceCm: clampViewingDistanceCm(formData.viewingDistanceCm),
};
```

Remove the current `as any` assertions while touching this form. In `App.tsx`,
keep the default profile compatible by leaving device metadata absent until Anders
confirms it; do not silently save a suggestion as confirmed.

- [ ] **Step 3: Make Sessions use all three stores and the shared projection**

In `HistoryScreen.tsx`, load `getSessions()` together with captures/recalls, build
`buildExperimentNotebookProjection({ sessions, captures, recalls })`, and render
`projection.all`. Use `NotebookRecordRow` so History and Today cannot disagree on
bucket, device or timestamp. Keep the existing summary counts but add training
count; title/subtitle become:

```tsx
title="Sessões"
subtitle="Capturas, recalls e treinos persistidos neste dispositivo."
```

Pass `projection.all` directly to `NotebookRecordRow`; `onOpen` selects the
record and renders `record.detail` plus `record.recall?.scoreLabel` in the
existing History detail card. Do not derive another status or bucket in the
screen.

- [ ] **Step 4: Make Progresso expose device-aware groups without losing analytics**

In `DashboardScreen.tsx`:

- change the AppShell title to `Progresso`;
- retain all five summary sections, Recharts views, generated insight and JSON export;
- show the full `group.label` including device class in group selectors;
- keep audit records below the trend and never merge them into chart points;
- keep recalls in export by continuing to call `getRecallTests()` at export time.

Do not move Recharts into the initial bundle.

- [ ] **Step 5: Run GREEN and the storage consumer gate**

Run:

```bash
npx tsx --test src/services/statisticsSummary.test.ts src/services/dashboardPresentation.test.ts src/services/deviceClass.test.ts src/services/experimentNotebookProjection.test.ts && npm run lint && APP_BASE_PATH=/gaze npm run build
```

Expected: PASS; build remains under 180000 gzip.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/screens/HistoryScreen.tsx src/screens/DashboardScreen.tsx src/screens/SettingsScreen.tsx src/App.tsx src/services/dashboardPresentation.test.ts src/services/statisticsSummary.test.ts
git commit -m "feat: connect notebook consumers to real backend data"
```

---

### Task 7: Preserve backend capabilities and expose fallbacks honestly

**Files:**
- Create: `src/services/apiFailure.ts`
- Create: `src/services/apiFailure.test.ts`
- Create: `src/services/planner.test.ts`
- Create: `src/exercises/implementations.test.ts`
- Modify: `src/types.ts`
- Modify: `src/services/contentGenerator.ts`
- Modify: `src/services/contentGenerator.test.ts`
- Modify: `src/services/recallService.ts`
- Modify: `src/services/recallService.test.ts`
- Modify: `src/services/planner.ts`
- Modify: `src/services/insightResponse.ts`
- Modify: `src/services/insightResponse.test.ts`
- Modify: `src/services/assessmentSessionController.ts`
- Modify: `src/services/assessmentSessionController.test.ts`
- Modify: `src/hooks/useRecallFlow.ts`
- Modify: `src/hooks/useRecallFlow.test.ts`
- Modify: `src/components/assessment/AssessmentResultPanel.tsx`
- Modify: `src/screens/EyeTrackingTestScreen.tsx`
- Modify: `src/screens/ExercisePlayerScreen.tsx`
- Modify: `src/screens/ExerciseLibraryScreen.tsx`
- Modify: `src/screens/DashboardScreen.tsx`

**Interfaces:**
- Produces: `BackendRequestError`, `backendFailureFromResponse()`, `backendFailureMessage()` and `PlanOrigin`.
- Consumes: the five existing endpoints; request URLs and backend schemas do not change.
- Preserves: all four registry exercises, deterministic safety gate, local fallback plan, ocular capture when recall fails.

- [ ] **Step 1: Write typed backend-failure tests**

Create `src/services/apiFailure.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BackendRequestError,
  backendFailureFromResponse,
  backendFailureMessage,
  networkBackendFailure,
} from './apiFailure';

test('classifies 429 and preserves Retry-After', async () => {
  const error = await backendFailureFromResponse(new Response(
    JSON.stringify({ error: 'RATE_LIMITED' }),
    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '120' } },
  ));
  assert.equal(error.kind, 'rate-limited');
  assert.equal(error.retryAfterSec, 120);
  assert.match(backendFailureMessage(error), /2 min/);
});

test('distinguishes missing backend configuration from generic unavailability', async () => {
  const missing = await backendFailureFromResponse(new Response(
    JSON.stringify({ error: 'OPENAI_API_KEY_MISSING' }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  ));
  assert.equal(missing.kind, 'configuration');
  assert.equal((await backendFailureFromResponse(new Response('', { status: 500 }))).kind, 'unavailable');
});

test('network failures and invalid payloads retain distinct recovery copy', () => {
  assert.equal(networkBackendFailure(new TypeError('fetch failed')).kind, 'offline');
  assert.match(backendFailureMessage(new BackendRequestError('invalid-payload')), /resposta inválida/i);
});
```

Create `src/exercises/implementations.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { registry } from './implementations';

test('backend-first redesign preserves every registered exercise', () => {
  assert.deepEqual(Object.keys(registry).sort(), [
    'assistedReading', 'fixation', 'saccades', 'smooth_pursuit',
  ]);
});
```

- [ ] **Step 2: Add RED tests for request payloads and plan provenance**

Extend `contentGenerator.test.ts` and `recallService.test.ts` so fake `fetch`
captures URL and `RequestInit`, then assert:

```ts
assert.deepEqual(JSON.parse(String(init?.body)), { complexity: 'dificil', targetDurationSec: 37 });
assert.deepEqual(JSON.parse(String(recallTextInit?.body)), {});
assert.deepEqual(JSON.parse(String(questionInit?.body)), { text: 'Texto realmente lido.' });
```

Create `src/services/planner.test.ts` with three cases:

```ts
assert.equal((await generateTreatmentPlan(profile, safeContext, history)).origin, 'ai');
assert.equal((await generateTreatmentPlan(profile, safeContext, history)).origin, 'local-fallback');
assert.equal((await generateTreatmentPlan(profile, unsafeContext, history)).origin, 'safety-block');
```

The AI case must also assert the POST body contains the exact `profile`, `context`
and `history` supplied by the caller. The local fallback cases assert
`fallbackFailure === 'rate-limited'` for 429 including the Retry-After message,
and `fallbackFailure === 'offline'` for a rejected fetch.

Replace the generic-only cases in `insightResponse.test.ts` with request-level
coverage. Import `requestGeneratedInsight`, capture the request and assert:

```ts
const summary = { overview: { sessionCount: 2 }, comparableDiagnosticCaptures: [] };
const text = await requestGeneratedInsight(summary);
assert.equal(text, 'Sua evolução está estável.');
assert.equal(new URL(capturedUrl, 'https://gaze.local').pathname.endsWith('/api/generateInsight'), true);
assert.deepEqual(JSON.parse(String(capturedInit?.body)), { sessionSummary: summary });
```

Also assert a 429 response rejects with `BackendRequestError.kind ===
'rate-limited'` and a 200 response without non-empty `text` rejects as
`invalid-payload`.

Run:

```bash
npx tsx --test src/services/apiFailure.test.ts src/services/contentGenerator.test.ts src/services/recallService.test.ts src/services/planner.test.ts src/services/insightResponse.test.ts src/exercises/implementations.test.ts
```

Expected: RED because typed failures/origins do not exist.

- [ ] **Step 3: Implement typed failure classification**

Create `src/services/apiFailure.ts`:

```ts
export type BackendFailureKind =
  | 'offline'
  | 'rate-limited'
  | 'configuration'
  | 'invalid-payload'
  | 'unavailable';

export class BackendRequestError extends Error {
  constructor(
    public readonly kind: BackendFailureKind,
    public readonly status: number | null = null,
    public readonly retryAfterSec: number | null = null,
  ) {
    super(kind);
    this.name = 'BackendRequestError';
  }
}

export async function backendFailureFromResponse(response: Response): Promise<BackendRequestError> {
  const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
  const retryHeader = response.headers.get('retry-after');
  const retryAfterSec = retryHeader && Number.isFinite(Number(retryHeader)) ? Number(retryHeader) : null;
  if (response.status === 429) return new BackendRequestError('rate-limited', 429, retryAfterSec);
  if (body?.error === 'OPENAI_API_KEY_MISSING') {
    return new BackendRequestError('configuration', response.status, null);
  }
  return new BackendRequestError('unavailable', response.status, null);
}

export function networkBackendFailure(error: unknown): BackendRequestError {
  if (error instanceof BackendRequestError) return error;
  return new BackendRequestError(error instanceof TypeError ? 'offline' : 'unavailable');
}

export function backendFailureMessage(error: BackendRequestError): string {
  if (error.kind === 'rate-limited') {
    const minutes = error.retryAfterSec ? Math.max(1, Math.ceil(error.retryAfterSec / 60)) : null;
    return minutes
      ? `Limite temporário atingido — tente novamente em ${minutes} min.`
      : 'Limite temporário atingido — aguarde e tente novamente.';
  }
  if (error.kind === 'configuration') return 'Serviço de IA não configurado no backend.';
  if (error.kind === 'invalid-payload') return 'O backend devolveu uma resposta inválida. Tente novamente.';
  if (error.kind === 'offline') return 'Sem conexão com o backend. Verifique a rede e tente novamente.';
  return 'O backend está indisponível no momento. Tente novamente.';
}
```

- [ ] **Step 4: Apply the classifier to reading and recall without fake content**

In `contentGenerator.ts` and `recallService.ts`:

- throw `await backendFailureFromResponse(response)` for non-2xx;
- throw `new BackendRequestError('invalid-payload', response.status)` for a 2xx
  body that fails shape checks;
- catch network errors only to rethrow `networkBackendFailure(error)`;
- keep the exact request bodies already asserted by tests;
- never synthesize reading/recall content.

In `EyeTrackingTestScreen` and `useRecallFlow`, store
`backendFailureMessage(networkBackendFailure(error))` and render it with a retry
button. A reading-content failure must remain before capture start.

Make retry ownership explicit:

```ts
// EyeTrackingTestScreen
const loadShortReadingContent = () => {
  setReadingTextState('loading');
  setReadingFailure(null);
  void getReadingContent('facil', READING_TARGET_DURATION_SEC)
    .then(text => registerShortText(text.trim()))
    .catch(error => {
      setReadingTextState('error');
      setReadingFailure(backendFailureMessage(networkBackendFailure(error)));
    });
};
```

Call it from the mount effect and from `Tentar gerar texto novamente`; disable
capture start unless `readingTextState === 'ready'`.

Extend `RecallFlowHandle` with `recallFailure: string | null`,
`retryRecallText()` and `retryRecallQuestions()`. Keep the exact passage used for
the completed capture in `lastRecallQuestionTextRef`. Extract the existing
questions request to `loadRecallQuestions(text)`, and make retry call that helper
with the ref value. It must not call `startCaptureLifecycle()` or create another
capture. Task 8 maps the retry and resulting hook state to controller events.

Replace the screen-owned insight request with this service in
`insightResponse.ts`:

```ts
import { apiUrl } from './apiBase';
import {
  BackendRequestError,
  backendFailureFromResponse,
  networkBackendFailure,
} from './apiFailure';

export async function requestGeneratedInsight(sessionSummary: unknown): Promise<string> {
  try {
    const response = await fetch(apiUrl('/api/generateInsight'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionSummary }),
    });
    if (!response.ok) throw await backendFailureFromResponse(response);
    const body = await response.json().catch(() => null) as { text?: unknown } | null;
    if (typeof body?.text !== 'string' || !body.text.trim()) {
      throw new BackendRequestError('invalid-payload', response.status);
    }
    return body.text.trim();
  } catch (error) {
    throw networkBackendFailure(error);
  }
}
```

`DashboardScreen.generateInsight()` builds the same `sessionSummary` object,
passes it to `requestGeneratedInsight()`, and displays
`backendFailureMessage(networkBackendFailure(error))` on failure. The object
still includes overview, five sections, sessions, comparable diagnostic captures
and audit diagnostic captures.

- [ ] **Step 5: Add plan origin without changing the server schema**

In `src/types.ts`:

```ts
export type PlanOrigin = 'ai' | 'local-fallback' | 'safety-block' | 'library';
```

In `planner.ts`, keep transport and client provenance separate:

```ts
export type GeneratedTreatmentPlan = TreatmentPlanResponse & {
  origin: PlanOrigin;
  fallbackFailure: BackendFailureKind | null;
  fallbackMessage: string | null;
};
```

Change `buildFallbackPlan()`, `blockedPlan()` and `generateTreatmentPlan()` to
return `GeneratedTreatmentPlan`; the server payload continues to validate only
as `TreatmentPlanResponse`. Return the valid AI plan as:

```ts
return {
  ...data.plan,
  origin: 'ai',
  fallbackFailure: null,
  fallbackMessage: null,
};
```

Set `origin: 'local-fallback'` in `buildFallbackPlan()` and
`origin: 'safety-block'` in `blockedPlan()`. The non-2xx and invalid-payload paths
throw through `apiFailure`; the catch classifies once and passes both
`failure.kind` and `backendFailureMessage(failure)` into `buildFallbackPlan()`.
Type the player state as
`GeneratedTreatmentPlan | null`; the single-exercise plan built in
`ExercisePlayerScreen` uses `origin: 'library'`, `fallbackFailure: null` and
`fallbackMessage: null`. This keeps the wire schema unchanged while making
runtime provenance mandatory and retaining the distinct 429/offline/configuration
message that caused the local fallback.

Render an origin badge on `PRE_EXERCISE_INFO`:

```tsx
<p className="mb-4 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
  {plan.origin === 'ai'
    ? 'Plano adaptativo gerado pelo backend'
    : plan.origin === 'local-fallback'
      ? `Plano padrão local — ${plan.fallbackMessage ?? 'backend indisponível'}`
      : plan.origin === 'library'
        ? 'Exercício avulso da Biblioteca'
        : 'Sessão bloqueada pelo safety gate'}
</p>
```

The deterministic safety gate remains before the network request and can never be
overridden by fallback.

- [ ] **Step 6: Make recall persistence honest and retryable**

Extend `RecallFlowHandle` with:

```ts
recallPersistence: 'idle' | 'saving' | 'saved' | 'failed';
retryRecallPersistence: () => void;
pendingRecallResult: RecallTestResult | null;
```

Add the exported persistence helper before the hook:

```ts
export async function persistRecallResult(
  result: RecallTestResult,
  save: (record: RecallTestResult) => Promise<void> = saveRecallTest,
): Promise<'saved' | 'failed'> {
  try {
    await save(result);
    return 'saved';
  } catch {
    return 'failed';
  }
}
```

Keep the exact result in `const pendingRecallResultRef =
useRef<RecallTestResult | null>(null)` and add:

```ts
const [recallPersistence, setRecallPersistence] = useState<RecallFlowHandle['recallPersistence']>('idle');

const runRecallPersistence = (result: RecallTestResult) => {
  pendingRecallResultRef.current = result;
  setRecallPersistence('saving');
  void persistRecallResult(result).then(setRecallPersistence);
};

const retryRecallPersistence = () => {
  if (pendingRecallResultRef.current && recallPersistence === 'failed') {
    runRecallPersistence(pendingRecallResultRef.current);
  }
};
```

Replace the silent catch in `handleQuizDone()` with
`runRecallPersistence(result)`. Add this exact test to
`useRecallFlow.test.ts`:

```ts
test('recall retry persists the exact same immutable record', async () => {
  const record = buildRecallTestResult({
    content: { topic: 'Leitura', text: 'Texto.' },
    questions: QUESTIONS,
    answers: [0],
    score: 0,
    lastCapture: { captureId: 'cap-1', readingDurationMs: 1200 },
    context: null,
    now: 42,
  });
  const attempts: RecallTestResult[] = [];
  const save = async (candidate: RecallTestResult) => {
    attempts.push(candidate);
    if (attempts.length === 1) throw new Error('offline');
  };
  assert.equal(await persistRecallResult(record, save), 'failed');
  assert.equal(await persistRecallResult(record, save), 'saved');
  assert.equal(attempts[0], record);
  assert.equal(attempts[1], record);
});
```

Import `persistRecallResult` from the hook module and `RecallTestResult` from
`@/types` in that test file.

Retry therefore preserves the same `id`, `timestamp`, `captureId`, questions and
answers instead of creating a replacement record.

Pass the state/retry callback to `AssessmentResultPanel` and render:

```tsx
{recallOutcome ? (
  <p className={recallPersistence === 'failed' ? 'text-rose-300' : 'text-slate-400'}>
    {recallPersistence === 'saved'
      ? 'Recall salvo'
      : recallPersistence === 'failed'
        ? 'Recall não salvo — a captura ocular permanece preservada'
        : 'Salvando recall…'}
  </p>
) : null}
```

Show `Tentar salvar recall novamente` only on `failed`.

Add this pure exit guard to `assessmentSessionController.ts`:

```ts
export function hasUnsavedAssessmentResult(
  capture: 'saving' | 'saved' | 'failed' | null,
  recall: 'idle' | 'saving' | 'saved' | 'failed',
): boolean {
  return capture === 'saving' || capture === 'failed'
    || recall === 'saving' || recall === 'failed';
}
```

Test all saving/failed branches and the fully saved/idle branches. In
`EyeTrackingTestScreen`, derive `hasUnsavedResult` from the capture report and
recall state. While true, install a `beforeunload` handler that calls
`event.preventDefault()`. Intercept the result panel close action with an
accessible confirmation dialog containing `Continuar nesta tela`, `Exportar
resultado local` and `Sair mesmo assim`. Local export serializes the exact
in-memory capture and pending recall result; it never marks either record saved.
The existing retry callbacks remain the primary actions.

- [ ] **Step 7: Run the complete backend-capability unit gate**

Run:

```bash
npx tsx --test src/services/apiFailure.test.ts src/services/contentGenerator.test.ts src/services/recallService.test.ts src/services/planner.test.ts src/services/insightResponse.test.ts src/services/assessmentSessionController.test.ts src/hooks/useRecallFlow.test.ts src/exercises/implementations.test.ts && npm test && npm run lint
```

Expected: all PASS; no endpoint, exercise ID or payload field removed.

- [ ] **Step 8: Commit Task 7**

```bash
git add src/types.ts src/services/apiFailure.ts src/services/apiFailure.test.ts src/services/contentGenerator.ts src/services/contentGenerator.test.ts src/services/recallService.ts src/services/recallService.test.ts src/services/planner.ts src/services/planner.test.ts src/services/insightResponse.ts src/services/insightResponse.test.ts src/services/assessmentSessionController.ts src/services/assessmentSessionController.test.ts src/hooks/useRecallFlow.ts src/hooks/useRecallFlow.test.ts src/components/assessment/AssessmentResultPanel.tsx src/screens/EyeTrackingTestScreen.tsx src/screens/DashboardScreen.tsx src/screens/ExercisePlayerScreen.tsx src/screens/ExerciseLibraryScreen.tsx src/exercises/implementations.test.ts
git commit -m "feat: expose backend failures without dropping capabilities"
```

---

### Task 8: Integrate the controller and freeze the measurement surface

**Files:**
- Create: `src/services/sessionGeometry.ts`
- Create: `src/services/sessionGeometry.test.ts`
- Modify: `src/types.ts`
- Modify: `src/services/captureValidity.ts`
- Modify: `src/services/captureValidity.test.ts`
- Modify: `src/services/assessmentAdapter.ts`
- Modify: `src/screens/AssessmentWorkspaceScreen.tsx`
- Modify: `src/screens/EyeTrackingTestScreen.tsx`
- Modify: `src/components/assessment/AssessmentSessionSurface.tsx`
- Modify: `src/components/assessment/AssessmentSetupPanel.tsx`
- Modify: `src/hooks/useCaptureLifecycle.ts`
- Modify: `src/hooks/useCaptureLifecycle.test.ts`

**Interfaces:**
- Consumes: Task 4 controller and Task 1 device decision.
- Produces: `geometry-changed-during-capture` and `orientation-changed-during-capture` as canonical interruption evidence.
- Produces: stable live-workspace height and exact controller status for the measurement UI.

- [ ] **Step 1: Write RED geometry tests**

Create `src/services/sessionGeometry.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionGeometryInterruption } from './sessionGeometry';

const frozen = {
  orientation: 'portrait' as const,
  surfaceRect: { left: 0, top: 64, width: 390, height: 700 },
};

test('identical and subpixel geometry remains valid', () => {
  assert.equal(sessionGeometryInterruption(frozen, frozen), null);
  assert.equal(sessionGeometryInterruption(frozen, {
    ...frozen,
    surfaceRect: { left: 0.4, top: 63.6, width: 390.4, height: 699.6 },
  }), null);
});

test('orientation changes win over generic geometry changes', () => {
  assert.equal(sessionGeometryInterruption(frozen, {
    orientation: 'landscape',
    surfaceRect: { left: 0, top: 40, width: 844, height: 330 },
  }), 'orientation-changed-during-capture');
});

test('surface movement above one CSS pixel interrupts the run', () => {
  assert.equal(sessionGeometryInterruption(frozen, {
    ...frozen,
    surfaceRect: { ...frozen.surfaceRect, width: 388 },
  }), 'geometry-changed-during-capture');
});
```

Add to `captureValidity.test.ts` a case asserting both new reasons are invalid and
have canonical Portuguese descriptions.

- [ ] **Step 2: Run RED**

Run:

```bash
npx tsx --test src/services/sessionGeometry.test.ts src/services/captureValidity.test.ts
```

Expected: FAIL because the helper/reasons do not exist.

- [ ] **Step 3: Implement geometry comparison and canonical reasons**

Create `src/services/sessionGeometry.ts`:

```ts
import type { CaptureInterruptionReason } from './captureValidity';
import type { SurfaceRect } from './ocularSignalContract';

export interface SessionGeometry {
  orientation: 'portrait' | 'landscape';
  surfaceRect: SurfaceRect;
}

export function sessionGeometryInterruption(
  frozen: SessionGeometry,
  current: SessionGeometry,
  tolerancePx = 1,
): CaptureInterruptionReason | null {
  if (frozen.orientation !== current.orientation) return 'orientation-changed-during-capture';
  const keys = ['left', 'top', 'width', 'height'] as const;
  return keys.some(key => Math.abs(frozen.surfaceRect[key] - current.surfaceRect[key]) > tolerancePx)
    ? 'geometry-changed-during-capture'
    : null;
}
```

Extend `CaptureInterruptionReason`, `REASON_TEXT`, the interruption guard and
canonical tests with:

```ts
| 'geometry-changed-during-capture'
| 'orientation-changed-during-capture'
```

Both remain invalid because every non-null interruption already wins grade
precedence.

- [ ] **Step 4: Freeze live-workspace height at entry**

In `AssessmentWorkspaceScreen`, when `liveWorkspace` changes from false to true,
capture once:

```ts
const [sessionViewportHeight, setSessionViewportHeight] = useState<number | null>(null);

useLayoutEffect(() => {
  if (!liveWorkspace) {
    setSessionViewportHeight(null);
    return;
  }
  setSessionViewportHeight(window.visualViewport?.height ?? window.innerHeight);
}, [liveWorkspace]);
```

Render the live wrapper with:

```tsx
<div
  data-testid="measurement-viewport"
  className="overflow-hidden bg-slate-950 text-white"
  style={{ height: sessionViewportHeight ? `${sessionViewportHeight}px` : '100svh' }}
>
```

Remove `100dvh` from the live wrapper/fallback. Browser chrome may change the
visual viewport, but the measurement rect does not reflow.

- [ ] **Step 5: Add explicit comparable/exploratory choice before entry**

Resolve the device class in `AssessmentWorkspaceScreen` and pass it to
`AssessmentSetupPanel`. If source is suggested, show:

```tsx
<p>Confirme a classe em Ajustes para uma sessão comparável.</p>
<button onClick={onOpenSettings}>Confirmar em Ajustes</button>
<button onClick={onStartExploratory}>Executar como baseline exploratório</button>
```

`onStartExploratory` navigates to the live route with `quality=exploratory`; normal
confirmed entry uses `quality=comparable`. Add `initialExploratory` to
`EyeTrackingTestScreenProps`. No suggested class may silently enter a comparable
run.

- [ ] **Step 6: Wire real backend events into the controller**

In `EyeTrackingTestScreen`, initialize:

```ts
const [sessionState, dispatchSession] = useReducer(
  transitionAssessmentSession,
  initialAssessmentSessionState(initialMode),
);
const sessionStatus = assessmentSessionStatus(sessionState);
```

Dispatch at the existing ownership points:

- mount/route entry: `BEGIN`;
- reading/device/camera preflight: `READINESS_PASSED` or `READINESS_FAILED`;
- explicit baseline route: dispatch `READINESS_FAILED` with
  `canRunExploratory: true`, then `RUN_EXPLORATORY`; never dispatch the latter
  directly from the initial `setup` state;
- calibration callbacks: `CALIBRATION_ACCEPTED` or `CALIBRATION_SKIPPED`;
- compatibility/validation result: `VALIDATION_PASSED` or `VALIDATION_FAILED`;
- successful `startCaptureLifecycle()`: `CAPTURE_STARTED`;
- `onCaptureFinished`: dispatch `INTERRUPTED` when `info.interruption` is non-null;
  otherwise dispatch `CAPTURE_FINISHED` exactly once;
- `recallGenState`: `RECALL_READY`/`RECALL_FAILED`; quiz completion: `QUIZ_FINISHED`;
- recall retry button: `RETRY_RECALL` before `retryRecallQuestions()`, followed by
  the normal `RECALL_READY`/`RECALL_FAILED` observation;
- capture persistence state: `SAVE_SUCCEEDED`/`SAVE_FAILED`; retry: `RETRY_SAVE`.

Pass `controllerStatus: sessionStatus` to `buildAssessmentWorkspaceSnapshot()`.
Expand `AssessmentStage`/`SESSION_TITLES` so every controller status has a human
title. Delete `deriveAssessmentStage()` only after no runtime caller remains; keep
its historical unit test only if it still serves a compatibility adapter.

When `sessionState.transitionError` becomes non-null, emit one development
`console.error` with the rejected `phase:event`; do not hide illegal transitions.

- [ ] **Step 7: Interrupt on real surface changes**

At component scope, keep the successful start geometry:

```ts
const activeSessionGeometryRef = useRef<SessionGeometry | null>(null);
```

Immediately after `startCaptureLifecycle(startSnapshot)` returns `true`, set:

```ts
activeSessionGeometryRef.current = {
  orientation: startSnapshot.environment.viewport.orientation,
  surfaceRect: startSnapshot.environment.surfaceRect,
};
```

Clear the ref in the capture-release callback. While capturing, compare it to
`rectFromElement(canvasRef.current)` from a `ResizeObserver`, `resize` and
`orientationchange` listener:

```ts
useEffect(() => {
  if (!capturing) return;
  const canvas = canvasRef.current;
  const frozen = activeSessionGeometryRef.current;
  if (!canvas || !frozen) return;

  const checkGeometry = () => {
    if (!capturingRef.current || !activeSessionGeometryRef.current || !canvasRef.current) return;
    const interruption = sessionGeometryInterruption(activeSessionGeometryRef.current, {
      orientation: currentOrientation(window.innerWidth, window.innerHeight),
      surfaceRect: rectFromElement(canvasRef.current),
    });
    if (interruption) finishCapture(interruption);
  };

  const observer = new ResizeObserver(checkGeometry);
  observer.observe(canvas);
  window.addEventListener('resize', checkGeometry);
  window.addEventListener('orientationchange', checkGeometry);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', checkGeometry);
    window.removeEventListener('orientationchange', checkGeometry);
  };
}, [capturing, capturingRef, finishCapture]);
```

`onCaptureFinished` is the single place that dispatches the corresponding
controller event, avoiding a duplicate interrupt event. The result remains
available and persistence continues best-effort. A restart
dispatches `RESET` and re-enters preflight/calibration; it never appends to the old
sample buffers.

- [ ] **Step 8: Run controller, geometry and lifecycle GREEN**

Run:

```bash
npx tsx --test src/services/assessmentSessionController.test.ts src/services/sessionGeometry.test.ts src/services/captureValidity.test.ts src/hooks/useCaptureLifecycle.test.ts src/services/assessmentAdapter.test.ts && npm test && npm run lint && APP_BASE_PATH=/gaze npm run build
```

Expected: all tests PASS, TypeScript clean, build within 180000 gzip.

- [ ] **Step 9: Commit Task 8**

```bash
git add src/services/sessionGeometry.ts src/services/sessionGeometry.test.ts src/types.ts src/services/captureValidity.ts src/services/captureValidity.test.ts src/services/assessmentAdapter.ts src/screens/AssessmentWorkspaceScreen.tsx src/screens/EyeTrackingTestScreen.tsx src/components/assessment/AssessmentSessionSurface.tsx src/components/assessment/AssessmentSetupPanel.tsx src/hooks/useCaptureLifecycle.ts src/hooks/useCaptureLifecycle.test.ts
git commit -m "feat: freeze measurement geometry behind session controller"
```

---

### Task 9: Prove responsiveness, capability preservation and the deployed runtime

**Files:**
- Create: `scripts/smoke-notebook-v2.mjs`
- Modify: `scripts/smoke-built.mjs`
- Modify: `scripts/smoke-assessment-workflow.mjs`
- Modify: `scripts/smoke-layout.mjs`
- Modify: `scripts/smoke-loading.mjs`
- Modify: `BACKLOG.md`

**Interfaces:**
- Consumes: the built app only; no source-module imports beyond existing smoke helpers.
- Proves: six required viewports, four primary destinations, secondary Library/Player,
  four exercises, stable measurement viewport, route aliases and no horizontal overflow.
- Compares: approved concept images and real browser renders at matching viewport sizes.

- [ ] **Step 1: Create the responsive acceptance smoke**

Create `scripts/smoke-notebook-v2.mjs`. Reuse `smokeResultMarker()` and the local
Chrome convention from the other smoke scripts. The executable body is:

```js
import { chromium } from 'playwright';
import { smokeResultMarker } from './smoke-runtime.mjs';

const BASE_URL = (process.argv[2] ?? 'http://127.0.0.1:3060/gaze').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const VIEWPORTS = [
  { name: 'phone-small', width: 320, height: 568, touch: true, chrome: 'bottom', columns: 'stack' },
  { name: 'phone', width: 390, height: 844, touch: true, chrome: 'bottom', columns: 'stack' },
  { name: 'tablet', width: 834, height: 1194, touch: true, chrome: 'rail', columns: 'stack' },
  { name: 'compact-desktop', width: 1024, height: 768, touch: false, chrome: 'rail', columns: 'stack' },
  { name: 'desktop', width: 1366, height: 768, touch: false, chrome: 'sidebar', columns: 'side' },
  { name: 'desktop-large', width: 1440, height: 1024, touch: false, chrome: 'sidebar', columns: 'side' },
];
const failures = [];
let checks = 0;

function check(scope, label, condition, detail = '') {
  checks += 1;
  if (!condition) failures.push(`[${scope}] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function acceptConsent(page) {
  await page.goto(`${BASE_URL}/consent`, { waitUntil: 'networkidle' });
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await page.waitForURL(/\/assessment(?:\?|$)/);
  await page.getByTestId('experiment-notebook').waitFor();
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
try {
  for (const profile of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      hasTouch: profile.touch,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await acceptConsent(page);

    const labels = await page.locator('nav[aria-label="Navegação principal"] a').allTextContents();
    check(profile.name, 'four primary destinations',
      ['Hoje', 'Sessões', 'Progresso', 'Ajustes'].every(label => labels.some(text => text.includes(label))));
    check(profile.name, 'notebook has no horizontal overflow', await page.evaluate(() => (
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )));

    const current = await page.getByTestId('current-series-card').boundingBox();
    const recent = await page.getByTestId('recent-sessions-card').boundingBox();
    check(profile.name, 'current and recent cards rendered', Boolean(current && recent));
    if (current && recent) {
      check(profile.name, `notebook composition is ${profile.columns}`,
        profile.columns === 'side'
          ? Math.abs(current.y - recent.y) <= 2 && recent.x > current.x
          : recent.y > current.y);
    }

    const nav = await page.locator('nav[aria-label="Navegação principal"]').boundingBox();
    check(profile.name, `responsive chrome is ${profile.chrome}`, Boolean(nav) && (
      profile.chrome === 'bottom'
        ? nav.y + nav.height >= profile.height - 4
        : profile.chrome === 'rail'
          ? nav.x < 160 && nav.width < 150
          : nav.x < 280 && nav.width < 280
    ));

    await page.getByRole('button', { name: 'Nova sessão' }).click();
    const dialog = page.getByRole('dialog', { name: 'Preparar nova sessão' });
    await dialog.waitFor();
    check(profile.name, 'launcher keeps both real assessment modes',
      await dialog.getByRole('button', { name: /captura simples/i }).isVisible()
      && await dialog.getByRole('button', { name: /leitura.*recall/i }).isVisible());
    await dialog.getByRole('button', { name: /fechar/i }).click();
    check(profile.name, 'render has no runtime errors', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await context.newPage();
  await acceptConsent(page);
  await page.getByRole('button', { name: 'Biblioteca' }).click();
  await page.getByRole('heading', { name: 'Biblioteca', exact: true }).waitFor();
  for (const name of ['Fixação', 'Sacadas', 'Perseguição suave', 'Leitura assistida']) {
    check('capabilities', `library exposes ${name}`, await page.getByText(name, { exact: true }).count() > 0);
  }
  for (const route of [
    { path: '/player', heading: 'Contexto de hoje' },
    { path: '/history', heading: 'Sessões' },
    { path: '/dashboard', heading: 'Progresso' },
    { path: '/statistics', heading: 'Progresso' },
    { path: '/settings', heading: 'Ajustes & Perfil' },
  ]) {
    const response = await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: route.heading, exact: true }).waitFor();
    check('capabilities', `${route.path} route is preserved`, response?.status() === 200);
  }
  await context.close();
} finally {
  await browser.close();
}

if (failures.length) {
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
}
console.log(smokeResultMarker({
  suite: 'notebook-v2',
  assertionsPassed: checks - failures.length,
  assertionsTotal: checks,
  blockedRequiredCapabilities: 0,
  blockedCapabilityNames: [],
}));
```

Run it against the fresh build from Tasks 1-8. Any missing notebook test id,
four-label nav, responsive composition or route heading is a release-blocking
acceptance failure that must be corrected before Step 3.

- [ ] **Step 2: Make the existing smoke matrix describe V2, not stale UI**

In `scripts/smoke-built.mjs`, add:

```js
await run('scripts/smoke-notebook-v2.mjs'),
```

Update only route sentinels and launcher selectors in
`smoke-assessment-workflow.mjs` and `smoke-loading.mjs`: `/assessment` waits for
`data-testid="experiment-notebook"`; History is `Sessões`; Dashboard/Statistics
is `Progresso`; opening live assessment first clicks `Nova sessão`, then the
chosen mode. Preserve every cache, lazy-chunk, MediaPipe and permission-timing
assertion.

Extend `VIEWPORTS` in `smoke-layout.mjs` with the six required sizes above and an
additional 844x390 rotated-phone case. Keep the existing fake-camera, calibration,
asset MIME, lifecycle and geometry checks. Add this live-workspace assertion:

```js
const frozenHeight = await page.getByTestId('measurement-viewport').evaluate(element => (
  element.getBoundingClientRect().height
));
const originalViewport = page.viewportSize();
if (!originalViewport) throw new Error('viewport unavailable');
await page.setViewportSize({
  width: originalViewport.width,
  height: Math.max(320, originalViewport.height - 80),
});
const afterChromeResize = await page.getByTestId('measurement-viewport').evaluate(element => (
  element.getBoundingClientRect().height
));
check(profile.name, 'measurement viewport does not reflow with dynamic chrome',
  Math.abs(frozenHeight - afterChromeResize) <= 1,
  `${frozenHeight} -> ${afterChromeResize}`);
await page.setViewportSize(originalViewport);
```

- [ ] **Step 3: Run the full local evidence gate**

Run in this order:

```bash
npm test
npm run lint
APP_BASE_PATH=/gaze npm run build
npm run smoke
git diff --check
```

Expected: all unit/integration tests PASS; TypeScript clean; initial gzip at or
below 180000 bytes; all five built smoke suites PASS; no whitespace errors.

- [ ] **Step 4: Perform reference-plus-render visual QA**

At matching 390x844, 834x1194 and 1440x1024 viewports, capture the built
`/assessment` and compare side-by-side with:

- `docs/superpowers/assets/experimental-notebook-v2/mobile.png`
- `docs/superpowers/assets/experimental-notebook-v2/tablet.png`
- `docs/superpowers/assets/experimental-notebook-v2/desktop.png`

Record discrepancies in hierarchy, crop, spacing, typography, borders, contrast
and density. Fix material mismatches and rerun Steps 3-4. An isolated screenshot
is not acceptance. Also inspect 320x568 and zoom at 200% and 400%; controls must
remain reachable and text must not clip.

No Browser/IAB tool is exposed in this workspace, so Playwright Chromium is the
recorded fallback for rendered screenshots. In the same QA pass, call
`view_image` on each accepted concept and its latest matching render. Write a
fidelity ledger in the execution notes with at least five concrete comparison
points: visible copy/order, layout/container geometry, typography, palette and
gradient, icons, spacing/borders/radii, and responsive behavior. Run an
above-the-fold copy diff against the approved concept. Remove temporary render
screenshots after sign-off; keep only the three approved concept assets.

- [ ] **Step 5: Deploy through the registered service and verify both paths**

Read `/etc/apache2/APACHE.md` immediately before service work and confirm
`/gaze/ -> 3060 -> linhafixa.service` is unchanged. Then:

```bash
systemctl restart linhafixa.service
systemctl is-active linhafixa.service
curl -fsS -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:3060/gaze/
curl -fsS -o /dev/null -w '%{http_code} %{content_type}\n' https://ultrassom.ai/gaze/
```

Expected: service `active`; both URLs return `200 text/html`. Do not modify
`APACHE.md` because this bundle changes neither route nor port.

- [ ] **Step 6: Record implementation evidence without closing Anders' review gate**

Update the active PACK in `BACKLOG.md` with a new
`BUNDLE Caderno Experimental V2 (implementado; revisão de Anders pendente)`.
Record exact commits, test totals, bundle gzip, smoke totals, deploy status and
the remaining manual Safari gates for iPhone/iPad camera, rotation,
`VisualViewport` and safe areas. Do not mark the BUNDLE closed.

- [ ] **Step 7: Commit Task 9**

```bash
git add scripts/smoke-notebook-v2.mjs scripts/smoke-built.mjs scripts/smoke-assessment-workflow.mjs scripts/smoke-layout.mjs scripts/smoke-loading.mjs BACKLOG.md
git commit -m "test: verify notebook v2 capabilities and responsive runtime"
```

---

## Plan Self-Review

- **Spec coverage:** every route, endpoint, exercise, local store, device class,
  comparison dimension, state transition, failure state, responsive class and
  deployment gate in the approved design maps to a task and test above.
- **Persistence safety:** IndexedDB remains v3; all capture/profile fields are
  optional for legacy reads but mandatory in new-write paths; no migration or
  destructive operation exists in the plan.
- **Type consistency:** server `TreatmentPlanResponse` remains the wire schema;
  `GeneratedTreatmentPlan` adds mandatory client-only origin; controller status
  is narrowed in Task 4 and widened with `AssessmentStage` in Task 8.
- **Measurement integrity:** the capture freezes device provenance, viewport
  height and surface geometry; resize/orientation ends the run instead of joining
  incompatible samples.
- **Capability preservation:** unit tests lock the five endpoint payloads and four
  exercise IDs; built smoke locks all routes and primary/secondary navigation.
- **No placeholders:** every new public contract, reducer, projection, persistence
  helper and acceptance script has executable code or an exact modification;
  there are no TODOs, stubs or fake product records.
- **Worktree safety:** execution stages only listed files and explicitly excludes
  Anders' `.codex_reports/` and audit Markdown from every commit.

## Execution Handoff

Anders selected the inline, single-agent path. After plan approval, execute with
`superpowers:executing-plans`, one task and one evidence-bearing commit at a time;
apply `build-web-apps:frontend-app-builder` during visual implementation and the
reference-plus-render QA; do not dispatch subagents. Stop after Task 9 with the
BUNDLE implemented and deployed but still awaiting Anders' manual iPhone/iPad
review.

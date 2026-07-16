# Instrument Validity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer calibração e capturas diagnósticas carregarem evidência mínima versionada, interromper resultados falsamente válidos e separar tendências comparáveis de registros exploratórios ou inválidos.

**Architecture:** Componentes React continuam responsáveis por câmera e fluxo, mas deixam de decidir validade. Dois serviços puros novos (`calibrationValidity` e `captureValidity`) recebem fatos medidos e produzem snapshots versionados com códigos estáveis. `gazeCalibration` passa a manter um modelo pendente até o gate ser aceito; `ocularSignalContract` fornece a decisão única de reutilização. Captura congela proveniência no início, é encerrada por eventos de ciclo de vida e persiste exatamente o snapshot exibido pelo relatório e consumido pelo dashboard.

**Tech Stack:** React 19, TypeScript, Vite, IndexedDB via `idb`, testes `node:test` executados com `node --import tsx --test`, Playwright no smoke existente e serviço Express/systemd em `/gaze/`.

**Spec:** `docs/superpowers/specs/2026-07-16-instrument-validity-design.md`

## Global Constraints

- Runner do repo: `npm run test`; não introduzir Vitest, Jest, jsdom ou dependências novas.
- TDD por task: teste vermelho, implementação mínima, teste focal, `npm run lint && npm run test`, autorrevisão e commit próprio.
- Thresholds v1 são contrato: calibração 12 amostras/alvo, média `<=5°`, p95 `<=8°`, zero extrapolações; captura `>=20_000ms`, cobertura `>=80%`, fonte `>=90%`, high tier `>=45Hz`, coarse `>=24Hz`, gap máximo `200ms`.
- Nenhuma migração destrutiva do IndexedDB. Campo ausente em registro antigo vira `legacy-unassessed` em leitura, sem regravar o payload.
- Componentes não duplicam thresholds nem constroem códigos de razão. Textos de UI ficam em PT-BR e ausência fisiológica usa `null`/“não estimável”.
- Implementadores trabalham sequencialmente no mesmo worktree. Cada task recebe um agente novo, depois revisão independente de spec e qualidade; telas compartilhadas nunca são editadas em paralelo.
- Preservar as alterações preexistentes de Anders em `index.html` e `docs/superpowers/specs/2026-07-16-adaptive-surface-design.md`.

---

### Task 1: Contrato puro de validade da calibração

**Files:**
- Create: `src/services/calibrationValidity.ts`
- Create: `src/services/calibrationValidity.test.ts`

**Interfaces:**

```ts
export const CALIBRATION_VALIDITY_CONTRACT_VERSION = 1;

export type CalibrationReasonCode =
  | 'calibration-insufficient-target-samples'
  | 'calibration-missing-fit-points'
  | 'calibration-missing-validation-points'
  | 'calibration-high-mean-error'
  | 'calibration-high-p95-error'
  | 'calibration-extrapolated-validation';

export interface CalibrationValidationPointEvidence {
  sampleCount: number;
  errorsDeg: number[];
  extrapolatedCount: number;
}

export interface CalibrationAssessment {
  contractVersion: 1;
  id: string;
  createdAt: number;
  accepted: boolean;
  reasonCodes: CalibrationReasonCode[];
  fitSampleCounts: number[];
  validationSampleCounts: number[];
  completeFitPoints: number;
  completeValidationPoints: number;
  meanErrorDeg: number | null;
  p95ErrorDeg: number | null;
  extrapolatedValidationSamples: number;
  signature: CalibrationSignature;
}

export function assessCalibration(input: {
  id: string;
  createdAt: number;
  fitSampleCounts: number[];
  validationPoints: CalibrationValidationPointEvidence[];
  signature: CalibrationSignature;
}): CalibrationAssessment;
```

- [ ] **Step 1: Write boundary-first failing tests**

Use a helper that creates 9 fit counts, 5 validation points and a valid signature. Cover, in one table-driven suite: exactly 12 samples accepted; 11 rejected; missing ninth fit point; missing fifth validation point; exactly 5° mean accepted; value above 5° rejected; exactly 8° p95 accepted; value above 8° rejected; any extrapolation rejected. Add fail-closed cases for `NaN`, `Infinity`, negative errors and negative/non-integer counts. Assert exact `reasonCodes`, not only `accepted`; invalid numeric evidence maps to the closest existing missing/insufficient/high-error reason and can never yield `accepted: true`.

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessCalibration } from './calibrationValidity';

const point = (errorsDeg = Array(12).fill(2), extrapolatedCount = 0) => ({
  sampleCount: 12,
  errorsDeg,
  extrapolatedCount,
});

test('accepts the exact v1 boundaries with complete evidence', () => {
  const assessment = assessCalibration({
    id: 'cal-1',
    createdAt: 100,
    fitSampleCounts: Array(9).fill(12),
    validationPoints: Array.from({ length: 5 }, () => point()),
    signature: {
      viewportWidth: 1000, viewportHeight: 700, orientation: 'landscape', devicePixelRatio: 2,
      surfaceRect: { left: 0, top: 0, width: 1000, height: 700 }, videoWidth: 1280, videoHeight: 720,
    },
  });
  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.reasonCodes, []);
  assert.equal(assessment.completeFitPoints, 9);
  assert.equal(assessment.completeValidationPoints, 5);
});

test('computes p95 over all samples instead of a mean of point means', () => {
  const errors = [...Array(56).fill(1), 5, 5, 8, 8];
  const validationPoints = Array.from({ length: 5 }, (_, index) => point(errors.slice(index * 12, index * 12 + 12)));
  const assessment = assessCalibration({
    id: 'cal-p95', createdAt: 200, fitSampleCounts: Array(9).fill(12), validationPoints,
    signature: {
      viewportWidth: 1000, viewportHeight: 700, orientation: 'landscape', devicePixelRatio: 2,
      surfaceRect: { left: 0, top: 0, width: 1000, height: 700 }, videoWidth: 1280, videoHeight: 720,
    },
  });
  assert.equal(assessment.p95ErrorDeg, 5); // interpolated percentile over all 60 samples
  assert.equal(assessment.accepted, true);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --import tsx --test src/services/calibrationValidity.test.ts`

Expected: FAIL with module-not-found for `calibrationValidity`.

- [ ] **Step 3: Implement the pure evaluator**

Implementation rules: clone every input array/signature; flatten every `errorsDeg`; use interpolated percentile `(n - 1) * 0.95`; return `null` when no validation errors exist; add reason codes in the union order above; define completeness as a present point with an integer `sampleCount >= 12` and, for validation, at least 12 finite non-negative error observations. `calibration-insufficient-target-samples` is emitted when any present fit/validation point is below 12, non-integer, non-finite or supplies fewer than 12 valid errors. Non-finite/negative errors fail closed through insufficient evidence; no `NaN` is allowed in an assessment.

```ts
const MIN_SAMPLES = 12;
const FIT_POINTS = 9;
const VALIDATION_POINTS = 5;
const MAX_MEAN_ERROR_DEG = 5;
const MAX_P95_ERROR_DEG = 8;

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}
```

- [ ] **Step 4: Run focal and full gates**

Run: `node --import tsx --test src/services/calibrationValidity.test.ts && npm run lint && npm run test`

Expected: all calibration boundary tests and the existing suite pass.

- [ ] **Step 5: Commit only Task 1 files**

Commit: `feat: add versioned calibration validity contract`

---

### Task 2: Modelo pendente, aceitação transacional e UI de rejeição

**Files:**
- Modify: `src/services/gazeCalibration.ts:17-207`
- Modify: `src/services/gazeCalibration.test.ts`
- Modify: `src/components/CalibrationOverlay.tsx:1-430`

**Interfaces:**

```ts
export function fitCalibration(): boolean; // produz somente pendingModel
export function predictPendingNorm(features: number[]): GazePrediction | null;
export function acceptPendingCalibration(assessment: CalibrationAssessment): boolean;
export function rejectCalibration(assessment?: CalibrationAssessment | null): void;
export function getCalibrationAssessment(): CalibrationAssessment | null;
export function isCalibrated(): boolean; // somente activeModel + assessment.accepted
```

- [ ] **Step 1: Extend `gazeCalibration.test.ts` with failing transactional tests**

Keep the existing ridge fixture. After `fitCalibration()`, assert `isCalibrated() === false`, `predictNorm(features) === null` and `predictPendingNorm(features) !== null`. Then assert a rejected assessment cannot activate the model and clears signature/accuracy; an accepted assessment activates it and is returned as a defensive clone.

- [ ] **Step 2: Run RED**

Run: `node --import tsx --test src/services/gazeCalibration.test.ts`

Expected: FAIL because pending/accept/reject APIs do not exist and the old fit activates immediately.

- [ ] **Step 3: Refactor state without changing ridge mathematics**

Introduce an internal `CalibrationModel` containing weights and feature statistics. `fitCalibration()` builds `pendingModel`; `predictNorm()` reads only `activeModel`; `predictPendingNorm()` reads only `pendingModel`. `acceptPendingCalibration()` requires `assessment.accepted` and a non-null pending model, then atomically moves pending to active, stores cloned assessment/signature and assigns `accuracyDeg = assessment.meanErrorDeg`. Remove the overlay's direct `setAccuracyDeg` call and restrict/remove that public setter after consumers compile. `rejectCalibration()` clears pending, active, signature and accuracy while retaining a cloned rejected assessment only for explanation.

```ts
interface CalibrationModel {
  weightsX: number[];
  weightsY: number[];
  featureMean: number[];
  featureStd: number[];
}

let pendingModel: CalibrationModel | null = null;
let activeModel: CalibrationModel | null = null;
let calibrationAssessment: CalibrationAssessment | null = null;

export function isCalibrated(): boolean {
  return activeModel !== null && calibrationAssessment?.accepted === true;
}
```

- [ ] **Step 4: Convert `CalibrationOverlay` to evidence-driven completion**

Replace per-point mean accumulation with `fitSampleCountsRef` and five evidence objects containing every per-sample error and extrapolation count. Timeout is unconditional after `MAX_POINT_MS`: if count is below 12, immediately create a rejected assessment, call `rejectCalibration`, reset the distance anchor/baselines and show phase `rejected`; never advance to the next dot. During validation call `predictPendingNorm`; record an error for every prediction and increment extrapolation evidence even though the clamped prediction is available.

At the final validation point, build the signature first, call `assessCalibration`, then either `acceptPendingCalibration` plus anchor/baselines, or `rejectCalibration` plus resets. Expand `Phase` to include `rejected` and render the principal reason with actions “Tentar novamente” and “Continuar sem calibração”. When the failed point collected zero samples, the principal text must say that rosto/olhos não foram detectados; partial evidence uses the stable reason mapping below. `onComplete` is rendered only for an accepted assessment.

```ts
const CALIBRATION_REASON_TEXT: Record<CalibrationReasonCode, string> = {
  'calibration-insufficient-target-samples': 'Não houve amostras suficientes em todos os pontos.',
  'calibration-missing-fit-points': 'A grade de calibração não foi concluída.',
  'calibration-missing-validation-points': 'A verificação independente não foi concluída.',
  'calibration-high-mean-error': 'O erro médio ficou acima do limite de 5°.',
  'calibration-high-p95-error': 'A variação do erro ficou acima do limite de 8°.',
  'calibration-extrapolated-validation': 'O modelo extrapolou fora da região calibrada.',
};
```

- [ ] **Step 5: Verify Task 2**

Run: `node --import tsx --test src/services/calibrationValidity.test.ts src/services/gazeCalibration.test.ts && npm run lint && npm run test`

Expected: rejected attempts never make `isCalibrated()` true; existing regression tests remain green.

- [ ] **Step 6: Commit Task 2**

Commit: `feat: gate calibration activation on accepted evidence`

---

### Task 3: Decisão única de reutilização no player e canvas

**Files:**
- Modify: `src/services/ocularSignalContract.ts:26-125`
- Modify: `src/services/ocularSignalContract.test.ts`
- Create: `src/components/CalibrationReusePrompt.tsx`
- Modify: `src/screens/ExercisePlayerScreen.tsx:1-230`
- Modify: `src/components/ExerciseCanvas.tsx:1-310`
- Modify: `src/exercises/assistedReading.ts:18-127`
- Modify: `src/exercises/assistedReading.test.ts`

**Interfaces:**

```ts
export interface CalibrationReuseDecision {
  reusable: boolean;
  reasons: string[];
}

export function calibrationReuseDecision(
  assessment: CalibrationAssessment | null | undefined,
  actual: CalibrationSignature,
): CalibrationReuseDecision;
```

- [ ] **Step 1: Add failing contract tests**

Cover: no assessment; rejected assessment; accepted assessment without signature; exact match; orientation drift; DPR drift; surface drift; video aspect drift. Verify the wrapper delegates geometry to `calibrationSignatureMatches` and never returns reusable for a rejected assessment.

- [ ] **Step 2: Implement the wrapper and run focal test**

Run: `node --import tsx --test src/services/ocularSignalContract.test.ts`

Expected: PASS; existing Portuguese geometry reasons are preserved.

- [ ] **Step 3: Add an explicit player decision stage**

Add `RECALIBRATION_PROMPT` to `PlayerStage`, state `calibrationMismatchReasons` and a session-local `forceRawSignal` flag. In `proceedToExercise`, when camera is enabled and a calibration exists, obtain/reuse the front-camera stream inside `try/catch`, read track settings, construct the actual full-viewport signature, and call `calibrationReuseDecision`. Compatible enters `EXERCISE`; incompatible enters `RECALIBRATION_PROMPT`; camera/preflight failure enters `CALIBRATION`, whose unavailable state already offers continuation without metrics. Extract the visible prompt to `CalibrationReusePrompt`: it explains changed configuration, lists the returned reasons, and offers “Recalibrar agora” or “Continuar em modo bruto”. The raw action sets `forceRawSignal` only for the current player flow and enters the exercise; it does **not** destroy a still-valid calibration for its original surface. A never-calibrated session still enters `CALIBRATION` directly once. The extracted component is reused unchanged by the smoke harness in Task 8; it is not a production test route.

- [ ] **Step 4: Make `ExerciseCanvas` consume the same decision**

Replace direct `calibrationSignatureMatches(getCalibrationSignature(), actual)` with `calibrationReuseDecision(getCalibrationAssessment(), actual)` and add a `forceRawSignal` prop from the player. A non-reusable/forced-raw decision sets `latestGazePoint = null` while preserving `latestGaze` from raw MediaPipe. Do not add a second tolerance or alternate reason mapping.

In `assistedReading`, replace the calibrated-only buffer with separate calibrated and raw buffers. Push canvas-normalized `latestGazePoint` into the first and `latestGaze` into the second, never into one mixed array; at result time reuse `selectCaptureSeries` and pass its `signalSource` to `analyzeSaccades`. Persist calibrated/raw counts in `extraData` so raw continuation is visibly exploratory. Tests must prove a forced-raw reading produces `raw-mediapipe` metrics and that a mid-run source change never creates a mixed-unit series.

- [ ] **Step 5: Verify and commit**

Run: `npm run lint && npm run test`

Expected: full suite green; no direct `calibrationSignatureMatches` remains in player/canvas decision paths except inside `ocularSignalContract`.

Commit: `feat: require compatible calibration before player reuse`

---

### Task 4: Contrato puro de validade da captura e ciclo de vida

**Files:**
- Create: `src/services/captureValidity.ts`
- Create: `src/services/captureValidity.test.ts`
- Modify: `src/services/validationCapture.ts:1-86`
- Modify: `src/services/validationCapture.test.ts`

**Interfaces:**

```ts
export type CaptureValidityGrade = 'comparable' | 'exploratory' | 'invalid';
export type TemporalTier = 'high-temporal' | 'coarse-temporal' | 'insufficient-temporal';
export type CaptureInterruptionReason = 'page-hidden-during-capture' | 'pagehide-during-capture';
export type CaptureValidityReasonCode =
  | 'capture-duration-too-short'
  | 'capture-coverage-below-threshold'
  | 'capture-source-inconsistent'
  | 'capture-calibration-unavailable'
  | 'capture-calibration-incompatible'
  | 'capture-coarse-temporal'
  | 'capture-insufficient-temporal'
  | 'capture-source-unavailable'
  | 'capture-tracking-gap'
  | CaptureInterruptionReason
  | 'legacy-unassessed';

export interface CaptureValiditySnapshot {
  contractVersion: 1;
  assessedAt: number | null; // null only for synthetic legacy view adapters
  grade: CaptureValidityGrade;
  reasonCodes: CaptureValidityReasonCode[];
  durationMs: number | null;
  coverage: number | null;
  signalSource: NonNullable<SaccadeMetrics['signalSource']> | null;
  selectedSourceRatio: number | null;
  sampleRateHz: number | null;
  temporalTier: TemporalTier;
  gapCount: number;
  interruption: CaptureInterruptionReason | null;
}

export function classifyTemporalTier(sampleRateHz: number | null | undefined): TemporalTier;
export function countTrackingGaps(samples: GazeSample[], thresholdMs?: number): number;
export interface CaptureValidityInput {
  assessedAt: number;
  durationMs: number;
  coverage: number;
  signalSource: NonNullable<SaccadeMetrics['signalSource']>;
  selectedSourceRatio: number | null;
  sampleRateHz: number | null | undefined;
  calibrationAccepted: boolean;
  calibrationCompatible: boolean;
  gapCount: number;
  interruption: CaptureInterruptionReason | null;
}
export function assessCaptureValidity(input: CaptureValidityInput): CaptureValiditySnapshot;
export function captureValidityOrLegacy(snapshot: CaptureValiditySnapshot | undefined): CaptureValiditySnapshot;
export function describeCaptureValidity(snapshot: CaptureValiditySnapshot): {
  label: 'Comparável' | 'Exploratória' | 'Inválida';
  tone: 'emerald' | 'amber' | 'rose';
  primary: string;
  reasons: string[];
};
export function pageInterruptionReason(event: 'visibilitychange' | 'pagehide', visibilityState?: DocumentVisibilityState): CaptureInterruptionReason | null;
```

- [ ] **Step 1: Write exact-boundary and precedence tests**

Table-test 19,999/20,000 ms; 79.99/80% coverage; 0.899/0.90 source ratio; 23.99/24/44.99/45 Hz; zero/one gap; both interruption reasons; unavailable source; unaccepted/incompatible calibration; legacy snapshot. Add `NaN`, `Infinity`, negatives and ratios/cobertura fora de 0..1/0..100; all invalid numeric evidence fails closed and no snapshot contains `NaN`. Assert invalid reasons take precedence over exploratory ones while all applicable reasons remain recorded. Test `describeCaptureValidity` for every reason and primary-message priority so React components never remap codes.

- [ ] **Step 2: Run RED, then implement the pure evaluator**

Classification rules: interruption, short/invalid duration, insufficient tier, invalid coverage/ratio and unavailable source are invalid. Coarse tier, finite low coverage, finite inconsistent selected source, missing/incompatible calibration and gaps are exploratory. Only an accepted compatible calibrated source at high tier with all strict gates is comparable. `countTrackingGaps` sorts a copy by `t` and counts consecutive deltas strictly greater than 200 ms. Exactly 200 ms is not a gap.

```ts
export function classifyTemporalTier(rate: number | null | undefined): TemporalTier {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 24) return 'insufficient-temporal';
  return rate >= 45 ? 'high-temporal' : 'coarse-temporal';
}
```

- [ ] **Step 3: Extend capture-series selection with source ratio**

Add `selectedSampleCount`, `totalSourceSampleCount` and `selectedSourceRatio` to `CaptureSeriesSelection`; empty buffers yield `null`, otherwise ratio is `selected / (calibrated + raw)`. Add tests for exact 90%, 89.9%, ties and empty buffers.

- [ ] **Step 4: Verify and commit**

Run: `node --import tsx --test src/services/captureValidity.test.ts src/services/validationCapture.test.ts && npm run lint && npm run test`

Commit: `feat: add versioned capture validity contract`

---

### Task 5: Remover zeros sentinela e caracterizar os tiers temporais

**Files:**
- Modify: `src/types.ts:92-105`
- Modify: `src/exercises/saccadeAnalysis.ts:62-184`
- Modify: `src/exercises/saccadeAnalysis.test.ts`
- Modify: `src/exercises/detectorValidation.ts:24-165`
- Modify: `src/exercises/detectorValidation.test.ts`
- Modify: `src/exercises/readingDynamics.ts:1-54`
- Modify: `src/exercises/readingDynamics.test.ts`
- Modify: `src/screens/ExercisePlayerScreen.tsx:315-450`
- Modify: `src/screens/EyeTrackingTestScreen.tsx:1271-1356`
- Modify: `src/services/statisticsSummary.ts:5-20,95-155,217-276`
- Modify: `src/services/statisticsSummary.test.ts`

- [ ] **Step 1: Change metric contracts in failing tests first**

Change `SaccadeMetrics.meanSaccadeAmplitude` and `meanFixationMs` to `number | null`; change `DetectorValidationMetrics.medianLatencyMs`, `latencyIqrMs` and `meanAmplitudeGain` to `number | null`. Add assertions that insufficient/no-event signals return null, while real zero counts and zero detection rate remain numeric zero.

- [ ] **Step 2: Implement null-safe aggregation**

Replace empty-array means/percentiles with nullable helpers. Keep `sampleRateHz = 0` as a measured technical rate only where the existing type demands a number; the validity evaluator treats non-positive rate as insufficient. Update `readingDynamics`, player, diagnostic report and statistics in this same task. In every UI consumer, format nullable metrics with a shared local helper or direct null guard and the exact label “não estimável”. Statistics averages must filter with a type predicate and must never coerce null to zero.

```ts
const meanOrNull = (values: number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
```

- [ ] **Step 3: Add golden traces at 60, 50, 30 and 24 Hz**

In `saccadeAnalysis.test.ts`, generate the same deterministic `Δh=0.06` plateau/saccade trace at each rate and pin the reproduced behavior: one event at 60 Hz, one at 50 Hz, zero at 30 Hz and zero at 24 Hz, with no fabricated extra event. In the same table assert `classifyTemporalTier(60/50) === 'high-temporal'` and `classifyTemporalTier(30/24) === 'coarse-temporal'`. Do not retune I-VT thresholds in this PACK; the two zero-event coarse traces document why v1 does not promote that tier.

- [ ] **Step 4: Verify and commit**

Run: `node --import tsx --test src/exercises/saccadeAnalysis.test.ts src/exercises/detectorValidation.test.ts src/services/statisticsSummary.test.ts && npm run lint && npm run test`

Expected: no `.toFixed`/`Math.round` is called on a nullable metric; old synthetic fixtures compile after explicit null guards.

Commit: `fix: represent unestimable ocular metrics as null`

---

### Task 6: Integrar snapshot congelado, interrupção e retry de persistência

**Files:**
- Modify: `src/types.ts:161-242`
- Create: `src/components/CaptureValiditySummary.tsx`
- Create: `src/services/capturePersistence.ts`
- Create: `src/services/capturePersistence.test.ts`
- Modify: `src/screens/EyeTrackingTestScreen.tsx:1-1425`
- Modify: `src/services/signalQuality.ts:1-93`
- Modify: `src/services/signalQuality.test.ts`

**Persisted additions:**

```ts
export interface ValidationCapture {
  // existing fields stay intact
  durationMs?: number;
  calibrationAssessment?: CalibrationAssessment;
  validity?: CaptureValiditySnapshot;
}

export type AssessedValidationCapture = ValidationCapture & {
  durationMs: number;
  validity: CaptureValiditySnapshot;
};
```

- [ ] **Step 1: Add failing presentation tests to `signalQuality.test.ts`**

Make `summarizeSaccadeSignalQuality` accept `options.validity`. Assert labels/tones for comparable, exploratory, invalid and legacy; assert 30 Hz can no longer be labelled comparable; assert interruption detail says “Captura não utilizável — a página perdeu visibilidade”. Existing reading sessions without a snapshot are explicitly exploratory.

- [ ] **Step 2: Freeze capture provenance at start**

Add a `CaptureStartSnapshot` ref containing monotonic start, wall-clock timestamp, cloned conditions/context, calibration assessment, current compatibility decision, geometry/orientation/DPR, video/track settings and layout. Build it in `startCapture`; remove `conditionsRef.current` from `finishCapture`. Finish-time measured rates may fill the frozen environment’s `rates`, but viewport/surface/video/conditions must come from the start snapshot.

- [ ] **Step 3: Finish through one interruption-aware path**

Change `finishCapture(interruption: CaptureInterruptionReason | null = null)` to synchronously set `capturingRef.current = false`, copy sample buffers, compute gaps/source ratio/validity, create the complete `ValidationCapture`, and place it in `captureResult` before starting IndexedDB work. Install `visibilitychange` and `pagehide` listeners once; they call a ref to the current finish function. Returning to visible does nothing, so old and new samples are never concatenated.

```ts
useEffect(() => {
  const onVisibility = () => {
    const reason = pageInterruptionReason('visibilitychange', document.visibilityState);
    if (reason) finishCaptureRef.current(reason);
  };
  const onPageHide = () => finishCaptureRef.current('pagehide-during-capture');
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
  };
}, []);
```

- [ ] **Step 4: Expose honest persistence state and retry**

Construct new records with `satisfies AssessedValidationCapture`. Put the async transition in `capturePersistence.ts`, which accepts the immutable capture and injected `save` function and returns `{ capture, persistence: 'saved' | 'failed' }` without cloning/regenerating it. Store `{ capture, persistence: 'saving' | 'saved' | 'failed' }` in the report state. Only prepend to `captures` after `saveValidationCapture` resolves. On rejection, retain the full capture in memory, display “não salvo” and a “Tentar salvar novamente” action that retries the same immutable capture object/id. Unit tests inject a first-fail/second-pass saver and assert object identity, ID, timestamp and validity snapshot are unchanged across retry.

- [ ] **Step 5: Render the persisted validity snapshot**

Extract `CaptureValiditySummary` and make the report’s first badge consume `describeCaptureValidity(capture.validity)`, list its reason labels and measured facts. Interruption gets the exact primary message from the spec. Nullable amplitude/fixation display “não estimável”. Report data and export both use the same `ValidationCapture`; do not recompute validity for display or duplicate reason maps. Task 8 renders this same component in its smoke-only harness for each grade.

- [ ] **Step 6: Verify and commit**

Run: `npm run lint && npm run test`

Expected: the single creation path and its tests guarantee that every new capture has duration, calibration reference when present and a validity snapshot; optional persisted fields remain solely for legacy readability. The IndexedDB schema version stays unchanged.

Commit: `feat: freeze and persist capture validity evidence`

---

### Task 7: Separar tendências comparáveis e auditoria no dashboard

**Files:**
- Modify: `src/services/statisticsSummary.ts:1-330`
- Modify: `src/services/statisticsSummary.test.ts`
- Modify: `src/screens/DashboardScreen.tsx:1-435`

**Interfaces:**

```ts
export interface OcularReadingPoint {
  // existing identity and metrics
  validity: CaptureValiditySnapshot;
  comparisonKey: string | null;
  orientation: 'portrait' | 'landscape' | null;
}

export interface OcularSeriesPartition {
  comparableGroups: Array<{ key: string; label: string; points: OcularReadingPoint[] }>;
  audit: OcularReadingPoint[];
}

export function partitionOcularReadingSeries(points: OcularReadingPoint[]): OcularSeriesPartition;
```

- [ ] **Step 1: Write partition tests before changing UI**

Build fixtures for two comparable portrait captures, one comparable landscape capture, one coarse exploratory capture, one interrupted invalid capture and one legacy session. Assert only comparable points enter groups; portrait and landscape are different groups; group key also includes tier and source; audit retains every non-comparable point; null metrics remain null.

- [ ] **Step 2: Normalize legacy only at read time**

For captures call `captureValidityOrLegacy(capture.validity)`; the synthetic legacy adapter uses `assessedAt: null` so it never pretends the new assessment existed at capture time. Reading-session points without a validity snapshot are exploratory legacy. `buildStatisticsSummary` and insight payload aggregate ocular dynamics only from comparable points; counts of exploratory/invalid remain available as audit facts. Do not mutate captures returned from storage.

- [ ] **Step 3: Render groups and audit separately**

Replace the single mixed `ocularSeries` charts with one selected comparable group at a time (default: group containing the most recent point) and compact group selector labels showing orientation/tier/source. Below, render a separate “Registros para auditoria” list with grade, reasons, rate and save provenance. When no comparable group exists, say so without hiding exploratory/invalid records.

- [ ] **Step 4: Keep AI insight payload honest**

Send `validity.grade`, `reasonCodes`, `temporalTier`, source ratio and duration. Put comparable captures under `comparableDiagnosticCaptures` and audit records under `auditDiagnosticCaptures`; never provide a combined trend array that invites the generated insight to compare unlike conditions.

- [ ] **Step 5: Verify and commit**

Run: `node --import tsx --test src/services/statisticsSummary.test.ts && npm run lint && npm run test`

Commit: `feat: separate comparable ocular trends from audit records`

---

### Task 8: Smoke visual, revisão final e publicação

**Files:**
- Modify: `scripts/smoke-layout.mjs`
- Create: `scripts/smoke-validity.mjs`
- Create: `scripts/smoke-built.mjs`
- Create: `scripts/fixtures/validity-states.html`
- Create: `scripts/fixtures/validity-states.tsx`
- Modify: `package.json`
- Modify if needed after reviewer findings: files touched in Tasks 1-7 only
- Update after Anders reviews the bundle: `BACKLOG.md`

- [ ] **Step 1: Extend Playwright smoke without production-only test hooks**

Retain every existing geometry assertion. In the real app, add desktop, monitor vertical, iPhone portrait and iPhone landscape cases that reach calibration with the existing fake camera and verify insufficient samples end in rejection instead of looping, then start a diagnostic capture and test lifecycle. For hidden state, open a second tab, call `bringToFront()`, assert the capture tab now reports `document.visibilityState === 'hidden'`, and only then assert automatic interruption; dispatch `pagehide` separately. Do not override the readonly visibility property.

For presentation states that require an accepted transient model, `smoke-validity.mjs` starts a temporary Vite server over `scripts/fixtures/validity-states.html`; that entry imports the real `CalibrationReusePrompt` and `CaptureValiditySummary` and renders mismatch plus comparable/exploratory/invalid fixtures at the same four viewports. The harness is never imported by `src/main.tsx` and therefore never enters `dist`; do not add query parameters, globals or routes to the production app.

`smoke-built.mjs` is the single orchestrator: spawn the freshly built `dist/server.cjs` with `NODE_ENV=production APP_BASE_PATH=/gaze PORT=4175`, wait for `http://127.0.0.1:4175/gaze/`, pass that exact base URL to both smoke modules, then terminate the child in `finally`. Change `npm run smoke` to call this orchestrator, so optional URLs cannot be forwarded to only one half and no pre-deploy check can accidentally hit the older service on port 3060.

- [ ] **Step 2: Run the complete local gate**

Run: `npm run test && npx tsc --noEmit && APP_BASE_PATH=/gaze npm run build && git diff --check && npm run smoke`

Expected: all commands exit 0; the orchestrator prints the isolated port 4175 and both smokes report every existing/new viewport case green against that build.

- [ ] **Step 3: Request final independent code review**

Invoke `superpowers:requesting-code-review` against the spec and all Task 1-8 commits. Fix every High/Medium issue through the original task implementer when possible, then rerun the complete gate. Explicitly inspect for duplicated thresholds, nullable-metric coercion, capture resume after hidden, silent persistence failure and legacy mutation.

- [ ] **Step 4: Build and publish the real `/gaze/` runtime**

The route map is already confirmed in `/etc/apache2/APACHE.md`: `/gaze/` → port 3060 → `linhafixa.service`; no Apache edit is expected. Restart `linhafixa.service`, verify `systemctl is-active`, local `http://127.0.0.1:3060/gaze/` and public `https://ultrassom.ai/gaze/` return healthy HTML/assets. If routing changes unexpectedly become necessary, update `/etc/apache2/APACHE.md` in the same task.

- [ ] **Step 5: Hand off the bundle for Anders's iPhone/Safari review**

Do not mark the BUNDLE closed. Present calibration rejection, mismatch prompt, interrupted capture, persistence retry and dashboard separation for Anders. Ask exactly: “Bundle de validade mínima está pronto para revisão?” Only after his confirmation update the active PACK/BUNDLE state in `BACKLOG.md` and use `superpowers:finishing-a-development-branch` for integration/cleanup choices.

---

## Final Self-Review Checklist

- Every acceptance criterion in the approved spec maps to a task and a test; excluded items (auth/privacy, global IndexedDB recovery, mobile recall redesign, physical px/cm calibration, blink gate and detector/postural retuning) remain untouched.
- New types use one canonical spelling across services, `ValidationCapture`, UI and tests; persisted fields are optional only for legacy compatibility, not for newly created captures.
- No placeholder, TODO, synthetic success path or destructive migration is part of the plan.
- Each task is independently reviewable, ends with focused/full verification and produces a narrow commit before the next shared-file edit begins.

# BUNDLE "Instrumentação do pipeline de detecção" — discriminar o 15fps + dados pro blink gate

> **Status 2026-07-19: EXECUTADO (as-built).** Tasks 1-4 completas via /fluxo (plano→executar→verificar). Gate: lint ✓, 296/296 (+6 TDD red→green), build 85319 gzip, smoke 108L+72V+7WF+43LD. Falta a leitura viva no tablet do Anders (câmera física). Sem commit, sem deploy.

**Data:** 2026-07-19 · **Execução:** inline (trilho A, decisão fechada) · **Origem:** 15fps de detecção no tablet do Anders; hipóteses (harmônico 30→15, fallback CPU, câmera 15fps nativa, throttling) indiscrimináveis sem medir inferência e delegate.

## Contexto técnico

- O loop processa 1 frame real de câmera por `requestVideoFrameCallback` (`videoFrameLoop.ts:37`); `detectForVideo` é síncrono (`faceTracking.ts:80`); "FPS detecção" = frames processados/s (`EyeTrackingTestScreen.tsx:757`).
- A UI já tem snapshot throttled ~5/s (`setLive`, linha 760-763) — campos novos pegam carona.
- Cada captura salva já grava `environment.rates` via `readCameraPipelineTelemetry` (`EyeTrackingTestScreen.tsx:826-830`) — estender `measured` persiste o diagnóstico nos exports.
- Blink score já é medido por frame (`getBlinkScore`, importado na tela); o gate duro segue desligado (`BLINK_REJECT_GATE_ENABLED=false`) — este BUNDLE só coleta, não liga.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/services/inferenceMeter.ts` | Criar | EMA puro de duração de inferência |
| `src/services/inferenceMeter.test.ts` | Criar | Testes do EMA |
| `src/services/faceTracking.ts` | Modificar | Cronometrar `detectForVideo`, registrar delegate ativo, expor `getDetectionTelemetry()` |
| `src/services/cameraTelemetry.ts` | Modificar | `CameraMeasuredRates` ganha `inferenceEmaMs` e `delegate` |
| `src/services/cameraTelemetry.test.ts` | Modificar | Testes dos campos novos |
| `src/screens/EyeTrackingTestScreen.tsx` | Modificar | `LiveSnapshot` + métricas no acordeão + persistência no `finishCapture` |

---

### Task 1: `inferenceMeter` (puro, TDD)

**Arquivos:** Criar `src/services/inferenceMeter.ts` + `src/services/inferenceMeter.test.ts`

- [ ] **1. Teste que falha** (`inferenceMeter.test.ts`):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInferenceMeter } from './inferenceMeter';

test('sem amostras, emaMs é null e count 0', () => {
  const m = createInferenceMeter();
  assert.equal(m.emaMs(), null);
  assert.equal(m.count(), 0);
});

test('primeira amostra vira o EMA inteiro', () => {
  const m = createInferenceMeter();
  m.record(40);
  assert.equal(m.emaMs(), 40);
  assert.equal(m.count(), 1);
});

test('EMA converge na direção das amostras novas (alpha 0.5 pra teste)', () => {
  const m = createInferenceMeter(0.5);
  m.record(40);
  m.record(20); // 40*0.5 + 20*0.5 = 30
  assert.equal(m.emaMs(), 30);
});

test('amostra não-finita é ignorada', () => {
  const m = createInferenceMeter();
  m.record(NaN);
  m.record(Infinity);
  assert.equal(m.emaMs(), null);
  assert.equal(m.count(), 0);
});
```
- [ ] **2. Ver falhar** — `node --import tsx --test src/services/inferenceMeter.test.ts` (module not found)
- [ ] **3. Implementação** (`inferenceMeter.ts`):
```ts
// EMA of per-frame inference duration. Pure so the smoothing is testable without
// MediaPipe; alpha 0.15 ≈ ~13-frame memory, stable enough to read live in the UI.
export interface InferenceMeter {
  record(ms: number): void;
  emaMs(): number | null;
  count(): number;
}

export function createInferenceMeter(alpha = 0.15): InferenceMeter {
  let ema: number | null = null;
  let samples = 0;
  return {
    record(ms: number) {
      if (!Number.isFinite(ms) || ms < 0) return;
      samples += 1;
      ema = ema === null ? ms : ema * (1 - alpha) + ms * alpha;
    },
    emaMs: () => ema,
    count: () => samples,
  };
}
```
- [ ] **4. Ver passar** — mesmo comando.

### Task 2: `faceTracking` — cronômetro + delegate

**Arquivos:** Modificar `src/services/faceTracking.ts:26-45` (delegate) e `:71-103` (detect)

- [ ] **1.** Import + estado de módulo (junto de `lastDetectTimestamp`):
```ts
import { createInferenceMeter } from './inferenceMeter';
// Which MediaPipe delegate actually initialized — the GPU→CPU fallback is silent
// (console.warn only) and CPU inference is 3-5x slower; the diagnostics UI needs this.
let activeDelegate: 'GPU' | 'CPU' | null = null;
const inferenceMeter = createInferenceMeter();
```
- [ ] **2.** No `detectorInitialization` (faceTracking.ts:38-43), registrar o delegate:
```ts
try {
  faceLandmarker = await create('GPU');
  activeDelegate = 'GPU';
} catch (gpuErr) {
  console.warn('GPU face tracking unavailable; falling back to CPU.', gpuErr);
  faceLandmarker = await create('CPU');
  activeDelegate = 'CPU';
}
```
- [ ] **3.** Em `detect()` (faceTracking.ts:78-89), cronometrar só a chamada real (cache e erro ficam fora):
```ts
let results;
const inferenceStart = performance.now();
try {
  results = faceLandmarker.detectForVideo(videoElement, timestamp);
} catch (err) {
  ...código de erro existente inalterado...
}
inferenceMeter.record(performance.now() - inferenceStart);
```
- [ ] **4.** Export no fim do arquivo:
```ts
// Live telemetry for the diagnostics UI and capture provenance.
export function getDetectionTelemetry(): { delegate: 'GPU' | 'CPU' | null; inferenceEmaMs: number | null; inferenceCount: number } {
  return { delegate: activeDelegate, inferenceEmaMs: inferenceMeter.emaMs(), inferenceCount: inferenceMeter.count() };
}
```
- [ ] **5. Gate:** `npm run lint` + `npm test` (sem harness pra MediaPipe; a validação viva é a Task 4).

### Task 3: `cameraTelemetry` persiste inferência e delegate (TDD)

**Arquivos:** Modificar `src/services/cameraTelemetry.ts:23-26,48-51` · Teste `src/services/cameraTelemetry.test.ts`

- [ ] **1. Teste que falha** (adicionar ao arquivo de teste existente, seguindo o helper que já houver):
```ts
test('measured carrega inferenceEmaMs e delegate quando fornecidos', () => {
  const t = readCameraPipelineTelemetry(null, { detectionFps: 15, inferenceEmaMs: 62.4, delegate: 'CPU' });
  assert.equal(t.measured.inferenceEmaMs, 62.4);
  assert.equal(t.measured.delegate, 'CPU');
});

test('measured omite inferenceEmaMs não-finito e delegate ausente', () => {
  const t = readCameraPipelineTelemetry(null, { inferenceEmaMs: NaN });
  assert.equal(t.measured.inferenceEmaMs, undefined);
  assert.equal(t.measured.delegate, undefined);
});
```
- [ ] **2. Ver falhar** — `node --import tsx --test src/services/cameraTelemetry.test.ts` (erro de tipo/campo)
- [ ] **3. Implementação:**
```ts
export interface CameraMeasuredRates {
  detectionFps?: number;
  ocularSampleRateHz?: number;
  inferenceEmaMs?: number;
  delegate?: 'GPU' | 'CPU';
}
```
e em `readCameraPipelineTelemetry`:
```ts
measured: {
  detectionFps: finiteNumber(measured.detectionFps),
  ocularSampleRateHz: finiteNumber(measured.ocularSampleRateHz),
  inferenceEmaMs: finiteNumber(measured.inferenceEmaMs),
  delegate: measured.delegate === 'GPU' || measured.delegate === 'CPU' ? measured.delegate : undefined,
},
```
- [ ] **4. Ver passar** + `npm run lint`.

### Task 4: tela — snapshot vivo, acordeão e persistência na captura

**Arquivos:** Modificar `src/screens/EyeTrackingTestScreen.tsx:112-122` (LiveSnapshot), `:140-143` (EMPTY_LIVE), `:753-758` (snapshot no loop), `:826-830` (finishCapture), `:1152-1163` (metricsGrid), `:1273` (summary do acordeão)

- [ ] **1.** Import: adicionar `getDetectionTelemetry` ao import de `@/services/faceTracking` (getBlinkScore já está importado).
- [ ] **2.** `LiveSnapshot` ganha campos:
```ts
interface LiveSnapshot {
  faceFound: boolean;
  eyesFound: boolean;
  h: number | null;
  v: number | null;
  yaw: number | null;
  pitch: number | null;
  roll: number | null;
  fps: number;
  coverage: number; // % of recent frames with a face
  cameraFps: number | null;      // negotiated track frameRate (what the camera promised)
  inferenceMs: number | null;    // EMA of detectForVideo duration
  delegate: 'GPU' | 'CPU' | null;
  blinkScore: number | null;     // live max(eyeBlinkL, eyeBlinkR)
}
```
e `EMPTY_LIVE` ganha `cameraFps: null, inferenceMs: null, delegate: null, blinkScore: null`.
- [ ] **3.** No loop (`:753-758`), montar o snapshot com os campos novos:
```ts
const detectionTelemetry = getDetectionTelemetry();
const negotiatedFps = ((video.srcObject as MediaStream | null)?.getVideoTracks()[0])?.getSettings?.().frameRate ?? null;
const snap: LiveSnapshot = {
  faceFound, eyesFound,
  h: gaze ? gaze.h : null, v: gaze ? gaze.v : null,
  yaw: pose ? pose.yaw : null, pitch: pose ? pose.pitch : null, roll: pose ? pose.roll : null,
  fps: ft.length, coverage,
  cameraFps: typeof negotiatedFps === 'number' && Number.isFinite(negotiatedFps) ? negotiatedFps : null,
  inferenceMs: detectionTelemetry.inferenceEmaMs,
  delegate: detectionTelemetry.delegate,
  blinkScore: getBlinkScore(),
};
```
- [ ] **4.** `metricsGrid` (`:1152-1163`) ganha 4 métricas após "Cobertura":
```tsx
<Metric label="Câmera fps" value={live.cameraFps != null ? String(Math.round(live.cameraFps)) : '—'} />
<Metric label="Inferência" value={live.inferenceMs != null ? `${live.inferenceMs.toFixed(0)} ms` : '—'} />
<Metric label="Delegate" value={live.delegate ?? '—'} />
<Metric label="Blink" value={live.blinkScore != null ? live.blinkScore.toFixed(2) : '—'} />
```
- [ ] **5.** Summary do acordeão (`:1273`) passa a discriminar câmera×detecção:
```ts
summary: `${live.fps ? `${live.fps}fps` : '—'}${live.cameraFps != null ? `/${Math.round(live.cameraFps)}cam` : ''} · ${live.inferenceMs != null ? `${live.inferenceMs.toFixed(0)}ms` : '—'}`,
```
- [ ] **6.** `finishCapture` (`:826-830`) persiste nos rates:
```ts
const detectionTelemetry = getDetectionTelemetry();
const measuredRates = readCameraPipelineTelemetry(videoRef.current, {
  detectionFps: liveRef.current.fps,
  ocularSampleRateHz: metrics.sampleRateHz,
  inferenceEmaMs: detectionTelemetry.inferenceEmaMs ?? undefined,
  delegate: detectionTelemetry.delegate ?? undefined,
}).measured;
```
- [ ] **7. Gate:** `npm run lint` && `npm test` && `APP_BASE_PATH=/gaze npm run build` && `npm run smoke`.

---

## Gate final do BUNDLE

lint + test + build (`APP_BASE_PATH=/gaze`) + smoke; depois captura real do Anders no tablet lendo a linha nova (`detecção/câmera · inferência · delegate`) — é ela que fecha o diagnóstico do 15fps.

## Riscos

- `performance.now()` em volta de `detectForVideo` mede também o custo de upload de textura no delegate GPU (parte do trabalho é assíncrona no driver) — o número é "custo na main thread", que é exatamente o que importa pro harmônico 30→15; anotar isso na leitura, não corrigir.
- `getSettings().frameRate` é o **negociado**, não o entregue — em luz fraca a câmera entrega menos que o negociado; se `câmera 30 · detecção 15 · inferência <20ms`, a hipótese luz/entrega segue viva (discriminável cobrindo a lente: fps de entrega aparece no rVFC).
- Campos novos em `environment.rates` são opcionais — capturas antigas seguem válidas (tipos `?`), sem migração.

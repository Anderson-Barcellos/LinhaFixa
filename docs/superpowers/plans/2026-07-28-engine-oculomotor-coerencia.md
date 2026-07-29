# Coerência do Engine Oculomotor — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a migração I-VT → I-DT do engine: baseline de piscada medido do próprio olho, purga da borda de subida nos buffers de medida, e painel ao vivo sobre o detector clínico fps-invariante.

**Architecture:** Quatro unidades (spec `docs/superpowers/specs/2026-07-28-engine-oculomotor-coerencia-design.md`): `blinkBaseline.ts` novo mede o baseline no settle da calibração e deriva enter/exit; `blinkGate.ts` resolve limiares em tempo de update a partir de uma fonte única e expõe a borda de subida; a purga existente passa a cobrir captura e amostras de fit; `visualSignal.ts` é reescrito sobre `detectFixations`/`saccadesFromFixations`.

**Tech Stack:** TypeScript, React, node:test (`node --import tsx --test`), sem dependência nova.

## Global Constraints

- Testes colocalizados `*.test.ts`, `node:test` + `node:assert/strict`, mesmo estilo dos existentes (comentários PT-BR onde explicam contrato).
- Rodar um arquivo: `node --import tsx --test src/services/<arquivo>.test.ts`. Suíte inteira: `npm test` (447 testes hoje — nenhum pode quebrar sem ser mudança de contrato declarada pelo spec; só a Task 6 muda contrato, e apenas em `visualSignal.test.ts`).
- Constantes de derivação (spec, fixas): `EXIT_MIN_MARGIN = 0.05`, `ENTER_GAP = 0.15`, `ENTER_FLOOR = 0.45`, exit em `[0.10, 0.45]`, enter em `[0.45, 0.75]`.
- Derivação fora das faixas → fallback nos limiares atuais (`BLINK_REJECT_THRESHOLD = 0.5`, `BLINK_EXIT_THRESHOLD = 0.25`). O fallback é o comportamento de hoje.
- Formato de `FunctionalVisualSignalSummary` não muda; payload persistido da calibração não muda (a calibração é estado em memória por sessão — os limiares derivados também são).
- Cortes de status do painel (`sensitivityScore >= 55` etc.) ficam nos valores atuais, agrupados num bloco nomeado, aguardando reancoragem empírica (`REVISÃO SUGERIDA` do spec).
- Sem deploy neste plano: entrega termina com suíte + lint verdes. Deploy no 3060 é passo separado autorizado por Anders.

---

### Task 1: Medidor de baseline de piscada (`blinkBaseline.ts`)

**Files:**
- Create: `src/services/blinkBaseline.ts`
- Test: `src/services/blinkBaseline.test.ts`

**Interfaces:**
- Consumes: nada do projeto (módulo puro).
- Produces: `createBlinkBaselineMeter(): BlinkBaselineMeter` com `observe(score: number | null): void`, `sampleCount(): number`, `derive(): DerivedBlinkThresholds | null`, `reset(): void`; tipo `DerivedBlinkThresholds { enter: number; exit: number }`; constantes `BLINK_EXIT_MIN_MARGIN`, `BLINK_ENTER_GAP`, `BLINK_ENTER_FLOOR`, `BLINK_EXIT_RANGE`, `BLINK_ENTER_RANGE`, `MIN_BASELINE_SAMPLES`. (O store de limiares é a Task 2.)

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/blinkBaseline.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBlinkBaselineMeter,
  BLINK_ENTER_GAP,
  MIN_BASELINE_SAMPLES,
} from './blinkBaseline';

// Distribuição realista do repouso do Anders: corpo em ~0.27-0.31, cauda de
// oscilação em 0.34, e alguns picos de piscada real que a mediana deve ignorar.
function observeAndersBaseline(meter: ReturnType<typeof createBlinkBaselineMeter>) {
  const body = [0.27, 0.29, 0.29, 0.31];
  for (let i = 0; i < 80; i++) meter.observe(body[i % body.length]);
  for (let i = 0; i < 15; i++) meter.observe(0.34);
  for (let i = 0; i < 5; i++) meter.observe(0.9); // piscadas dentro da janela
}

test('deriva exit acima do baseline e enter com histerese completa', () => {
  const meter = createBlinkBaselineMeter();
  observeAndersBaseline(meter);
  const t = meter.derive();
  assert.ok(t, 'com 100 amostras a derivação deve convergir');
  // p50 = 0.29, p90 = 0.34 → spread 0.05: exit = 0.34 (ACIMA do repouso — correção de P3)
  assert.ok(Math.abs(t.exit - 0.34) < 1e-9);
  // enter = max(exit + gap, floor) = max(0.49, 0.45) = 0.49
  assert.ok(Math.abs(t.enter - 0.49) < 1e-9);
  assert.ok(t.enter - t.exit >= BLINK_ENTER_GAP - 1e-9);
});

test('amostras insuficientes derivam null (fallback nos limiares fixos)', () => {
  const meter = createBlinkBaselineMeter();
  for (let i = 0; i < MIN_BASELINE_SAMPLES - 1; i++) meter.observe(0.29);
  assert.equal(meter.derive(), null);
});

test('baseline alto demais deriva null em vez de um exit clampado enganoso', () => {
  // Repouso em 0.45: exit bruto = 0.50 > teto 0.45. Clampar fingiria um gate
  // válido para um sinal que o contrato não cobre — a resposta honesta é fallback.
  const meter = createBlinkBaselineMeter();
  for (let i = 0; i < 100; i++) meter.observe(0.45);
  assert.equal(meter.derive(), null);
});

test('null e não-finito são ignorados; reset limpa tudo', () => {
  const meter = createBlinkBaselineMeter();
  meter.observe(null);
  meter.observe(Number.NaN);
  assert.equal(meter.sampleCount(), 0);
  observeAndersBaseline(meter);
  meter.reset();
  assert.equal(meter.sampleCount(), 0);
  assert.equal(meter.derive(), null);
});

test('picos de piscada não arrastam a mediana do repouso', () => {
  const meter = createBlinkBaselineMeter();
  // 60% repouso baixo, 40% piscadas longas — ainda assim p50 fica no repouso.
  for (let i = 0; i < 60; i++) meter.observe(0.1);
  for (let i = 0; i < 40; i++) meter.observe(0.95);
  const t = meter.derive();
  assert.ok(t);
  assert.ok(t.exit <= 0.45 && t.exit >= 0.1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/services/blinkBaseline.test.ts`
Expected: FAIL — módulo `./blinkBaseline` não existe.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/blinkBaseline.ts
// Baseline de eyeBlink medido do próprio sujeito, coletado nas janelas de settle
// da calibração (o olho está pousando num ponto e nenhuma amostra de ajuste é
// coletada — ~4s de sinal que era descartado). Piscadas são picos raros e curtos;
// o repouso é o corpo da distribuição, então a mediana é robusta a elas.
//
// Correção de P3 do spec 2026-07-28: os limiares fixos (enter 0.5 / exit 0.25)
// deixam baselines reais (~0.29) numa zona morta em que o exit nunca é cruzado.
// Aqui o exit é derivado ACIMA do baseline; fora das faixas de sanidade a
// derivação devolve null e os limiares fixos continuam valendo — o fallback é
// exatamente o comportamento de hoje, nunca pior.

export interface DerivedBlinkThresholds {
  enter: number;
  exit: number;
}

export const BLINK_EXIT_MIN_MARGIN = 0.05;
export const BLINK_ENTER_GAP = 0.15;
export const BLINK_ENTER_FLOOR = 0.45;
export const BLINK_EXIT_RANGE = Object.freeze({ min: 0.10, max: 0.45 });
export const BLINK_ENTER_RANGE = Object.freeze({ min: 0.45, max: 0.75 });
// ~1s de settle a 30fps; as janelas somadas dão 100-240 frames em condições normais.
export const MIN_BASELINE_SAMPLES = 30;

export interface BlinkBaselineMeter {
  observe(score: number | null): void;
  sampleCount(): number;
  derive(): DerivedBlinkThresholds | null;
  reset(): void;
}

function percentile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export function createBlinkBaselineMeter(): BlinkBaselineMeter {
  const scores: number[] = [];
  return {
    observe(score) {
      if (score != null && Number.isFinite(score)) scores.push(score);
    },
    sampleCount() {
      return scores.length;
    },
    derive() {
      if (scores.length < MIN_BASELINE_SAMPLES) return null;
      const sorted = scores.slice().sort((a, b) => a - b);
      const baseline = percentile(sorted, 0.5);
      const spread = percentile(sorted, 0.9) - baseline;
      if (!Number.isFinite(baseline) || !Number.isFinite(spread)) return null;
      const exit = baseline + Math.max(spread, BLINK_EXIT_MIN_MARGIN);
      // Fora da faixa não se clampa: um exit "válido" fabricado por clamp
      // esconderia um sinal que o contrato não cobre. Fallback honesto.
      if (exit < BLINK_EXIT_RANGE.min || exit > BLINK_EXIT_RANGE.max) return null;
      const enter = Math.max(exit + BLINK_ENTER_GAP, BLINK_ENTER_FLOOR);
      if (enter < BLINK_ENTER_RANGE.min || enter > BLINK_ENTER_RANGE.max) return null;
      return { enter, exit };
    },
    reset() {
      scores.length = 0;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/services/blinkBaseline.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/services/blinkBaseline.ts src/services/blinkBaseline.test.ts
git commit -m "feat: derive blink thresholds from the subject's measured baseline"
```

---

### Task 2: Fonte única de limiares + borda de subida no gate

**Files:**
- Modify: `src/services/blinkBaseline.ts` (store de módulo)
- Modify: `src/services/blinkGate.ts` (resolução em update-time + `wasRisingEdge`)
- Test: `src/services/blinkBaseline.test.ts`, `src/services/blinkGate.test.ts`

**Interfaces:**
- Consumes: `DerivedBlinkThresholds` da Task 1.
- Produces: em `blinkBaseline.ts` — `commitDerivedBlinkThresholds(t: DerivedBlinkThresholds | null): void`, `getDerivedBlinkThresholds(): DerivedBlinkThresholds | null`, `resetDerivedBlinkThresholds(): void`. Em `blinkGate.ts` — `BlinkGateTracker` ganha `wasRisingEdge(): boolean` (true sse o último `update` transicionou de aceitando para rejeitando).

- [ ] **Step 1: Write the failing tests**

Acrescentar a `src/services/blinkBaseline.test.ts`:

```typescript
import {
  commitDerivedBlinkThresholds,
  getDerivedBlinkThresholds,
  resetDerivedBlinkThresholds,
} from './blinkBaseline';

test('store: commit publica, null e reset restauram o default', () => {
  resetDerivedBlinkThresholds();
  assert.equal(getDerivedBlinkThresholds(), null);
  commitDerivedBlinkThresholds({ enter: 0.49, exit: 0.34 });
  assert.deepEqual(getDerivedBlinkThresholds(), { enter: 0.49, exit: 0.34 });
  commitDerivedBlinkThresholds(null);
  assert.equal(getDerivedBlinkThresholds(), null);
  commitDerivedBlinkThresholds({ enter: 0.49, exit: 0.34 });
  resetDerivedBlinkThresholds();
  assert.equal(getDerivedBlinkThresholds(), null);
});
```

Acrescentar a `src/services/blinkGate.test.ts` (com `beforeEach`/`after` chamando `resetDerivedBlinkThresholds()` para não vazar estado entre testes):

```typescript
import { commitDerivedBlinkThresholds, resetDerivedBlinkThresholds } from './blinkBaseline';

test('gate criado ANTES do commit adota os limiares derivados no update seguinte', () => {
  // O gate do pipeline nasce antes da calibração existir: a resolução precisa
  // ser em tempo de update, não de criação.
  resetDerivedBlinkThresholds();
  const gate = createBlinkGateTracker();
  assert.equal(gate.update(0.45, 0), false);       // default: 0.45 < 0.5 não entra
  commitDerivedBlinkThresholds({ enter: 0.40, exit: 0.30 });
  assert.equal(gate.update(0.45, 16), true);       // derivado: 0.45 > 0.40 entra
  resetDerivedBlinkThresholds();
});

test('limiar explícito nas opções vence o derivado', () => {
  commitDerivedBlinkThresholds({ enter: 0.40, exit: 0.30 });
  const gate = createBlinkGateTracker({ enterThreshold: 0.7 });
  assert.equal(gate.update(0.5, 0), false);        // 0.5 < 0.7 explícito
  resetDerivedBlinkThresholds();
});

test('exit derivado acima do baseline reabre pelo caminho projetado', () => {
  // Critério de aceite 2 do spec: baseline 0.29 sai da piscada cruzando o exit
  // derivado (0.34), sem depender do backstop de recoveryStableMs.
  commitDerivedBlinkThresholds({ enter: 0.49, exit: 0.34 });
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);                              // piscada real
  assert.equal(gate.update(0.29, 40), true);        // 0.29 <= exit 0.34 → hold armado
  assert.equal(gate.update(0.29, 40 + BLINK_HOLD_MS + 1), false); // reaberto após o hold
  resetDerivedBlinkThresholds();
});

test('wasRisingEdge marca só o frame da transição aberto→fechado', () => {
  const gate = createBlinkGateTracker();
  assert.equal(gate.update(0.3, 0), false);
  assert.equal(gate.wasRisingEdge(), false);
  assert.equal(gate.update(0.9, 16), true);
  assert.equal(gate.wasRisingEdge(), true);         // este frame é a borda
  assert.equal(gate.update(0.9, 33), true);
  assert.equal(gate.wasRisingEdge(), false);        // segue fechado, sem nova borda
  gate.reset();
  assert.equal(gate.wasRisingEdge(), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test src/services/blinkBaseline.test.ts src/services/blinkGate.test.ts`
Expected: FAIL — store e `wasRisingEdge` não existem.

- [ ] **Step 3: Implement**

Em `blinkBaseline.ts`, ao final:

```typescript
// --- Fonte única dos limiares vigentes ---
// Estado de sessão, como o modelo de calibração: derivado no aceite da
// calibração, zerado junto com âncoras/baselines. Os gates leem em tempo de
// update — o gate do pipeline nasce antes da calibração existir.
let derivedThresholds: DerivedBlinkThresholds | null = null;

export function commitDerivedBlinkThresholds(t: DerivedBlinkThresholds | null): void {
  derivedThresholds = t;
}

export function getDerivedBlinkThresholds(): DerivedBlinkThresholds | null {
  return derivedThresholds;
}

export function resetDerivedBlinkThresholds(): void {
  derivedThresholds = null;
}
```

Em `blinkGate.ts`:

```typescript
import { getDerivedBlinkThresholds } from './blinkBaseline';
```

Dentro de `createBlinkGateTracker`, trocar a resolução fixa por resolução em update-time e registrar a borda:

```typescript
  // Limiar explícito nas opções vence; sem ele, o derivado da calibração vence
  // o default fixo — resolvido a cada update porque o commit acontece depois
  // que os gates de longa vida (pipeline) já existem.
  const resolveEnter = () => opts.enterThreshold ?? getDerivedBlinkThresholds()?.enter ?? BLINK_REJECT_THRESHOLD;
  const resolveExit = () => opts.exitThreshold ?? getDerivedBlinkThresholds()?.exit ?? BLINK_EXIT_THRESHOLD;
```

- Dentro de `update`, usar `const enter = resolveEnter(); const exit = resolveExit();` no lugar das constantes capturadas.
- Novo estado `let risingEdge = false;` — setado `true` exatamente na transição `state === 'open' && isBlinking(...)`, `false` em qualquer outro caminho de `update` e em `reset`.
- Expor `wasRisingEdge() { return risingEdge; }` no objeto retornado.
- `BLINK_EXIT_THRESHOLD` continua exportado (fallback e testes).

- [ ] **Step 4: Run the two files, then the full suite**

Run: `node --import tsx --test src/services/blinkBaseline.test.ts src/services/blinkGate.test.ts && npm test`
Expected: PASS geral — os 12 testes existentes do gate usam defaults e não podem mudar de resultado.

- [ ] **Step 5: Commit**

```bash
git add src/services/blinkBaseline.ts src/services/blinkBaseline.test.ts src/services/blinkGate.ts src/services/blinkGate.test.ts
git commit -m "feat: resolve blink gate thresholds from a single live source with rising-edge contract"
```

---

### Task 3: Coleta no settle + commit no aceite (CalibrationOverlay)

**Files:**
- Modify: `src/components/CalibrationOverlay.tsx`

**Interfaces:**
- Consumes: `createBlinkBaselineMeter`, `commitDerivedBlinkThresholds`, `resetDerivedBlinkThresholds` (Tasks 1-2); `getBlinkScore` já importado no arquivo.
- Produces: nada novo exportado — integração.

Não há infraestrutura de teste de componente no repo (node:test puro, sem DOM). A lógica de medição e derivação está 100% testada nas Tasks 1-2; esta task é fiação. Verificação: `npm run lint` + suíte + smoke manual (passo 3).

- [ ] **Step 1: Wire the meter**

1. Import: `import { createBlinkBaselineMeter, commitDerivedBlinkThresholds, resetDerivedBlinkThresholds } from '@/services/blinkBaseline';`
2. Ao lado de `const blinkGate = createBlinkGateTracker();` (linha ~256): `const baselineMeter = createBlinkBaselineMeter();`
3. No loop, o ramo `if (elapsed >= SETTLE_MS)` ganha um `else` para a fase de calibração — o settle dos 9 pontos é a janela de coleta:

```typescript
        } else if (phaseNow === 'calibrating') {
          // Janela de settle: o olho está pousando e nada alimenta o fit — é a
          // amostra de repouso que calibra os limiares de piscada (spec P3).
          baselineMeter.observe(getBlinkScore());
        }
```

4. Em `completeCurrentPoint`, no ramo de aceite (`if (acceptPendingCalibration(assessment))`, junto do `setDistanceAnchor`/`setPosturalBaseline` — mesma transação):

```typescript
          // Limiares de piscada derivados do repouso medido nesta calibração.
          // derive() === null (amostras insuficientes / fora das faixas) mantém
          // os limiares fixos — fallback é o comportamento de hoje.
          commitDerivedBlinkThresholds(baselineMeter.derive());
```

5. Em `resetCalibrationAnchorsAndBaselines()` (linha ~552), acrescentar `resetDerivedBlinkThresholds();` — rejeição e recalibração descartam o derivado junto com âncora de distância e baseline postural, mesma semântica transacional.
6. No `setup` (que zera `ipdSamplesRef` etc.): `baselineMeter.reset();`

- [ ] **Step 2: Lint and full suite**

Run: `npm run lint && npm test`
Expected: PASS — sem teste novo, sem regressão.

- [ ] **Step 3: Manual smoke (dev)**

Run: `npm run dev` e calibrar uma vez com a câmera. Evidência esperada: calibração aceita segue aceitando; nenhum erro de console. (A prova de que os limiares derivados regem os gates é a Task 2; aqui o smoke confirma a fiação.)

- [ ] **Step 4: Commit**

```bash
git add src/components/CalibrationOverlay.tsx
git commit -m "feat: measure blink baseline during calibration settle and commit derived thresholds on accept"
```

---

### Task 4: Purga das amostras de fit da calibração

**Files:**
- Modify: `src/services/gazeCalibration.ts` (amostras ganham `t`; purga)
- Modify: `src/components/CalibrationOverlay.tsx` (passa `t`; purga na borda; contadores coerentes)
- Test: `src/services/gazeCalibration.test.ts`

**Interfaces:**
- Consumes: `purgeLeadingBlinkSamples`, `BLINK_LEADING_PURGE_MS` (`blinkGate.ts`); `wasRisingEdge` (Task 2).
- Produces: `addCalibrationSample(features: number[], target: {x,y}, tMs: number)` (terceiro parâmetro novo, obrigatório); `purgeRecentCalibrationSamples(nowMs: number, windowMs?: number): number` (remove do fim as amostras com `nowMs − t ≤ windowMs`, devolve quantas removeu).

Escopo deliberado: a purga cobre o **fit**. Erros de validação inflados por borda de piscada só tornam o aceite mais conservador — direção segura, fora do escopo (spec, critério 5).

- [ ] **Step 1: Write the failing test**

Acrescentar a `src/services/gazeCalibration.test.ts` (seguir o padrão de reset dos testes existentes do arquivo):

```typescript
import { purgeRecentCalibrationSamples } from './gazeCalibration';

// Vetor de features finito e determinístico no shape que addCalibrationSample exige.
const makeFeatures = (seed: number) =>
  Array.from({ length: GAZE_FEATURE_LENGTH }, (_, i) => seed + i * 0.01);

test('purga remove só as amostras da janela recente e informa quantas', () => {
  resetCalibration();
  addCalibrationSample(makeFeatures(0.1), { x: 0.1, y: 0.1 }, 1000);
  addCalibrationSample(makeFeatures(0.2), { x: 0.2, y: 0.2 }, 1400);
  addCalibrationSample(makeFeatures(0.3), { x: 0.3, y: 0.3 }, 1950);
  addCalibrationSample(makeFeatures(0.4), { x: 0.4, y: 0.4 }, 1990);
  // Borda de subida em t=2000 com janela default de 80ms: 1950 e 1990 caem.
  const removed = purgeRecentCalibrationSamples(2000);
  assert.equal(removed, 2);
  assert.equal(calibrationSampleCount(), 2);
});

test('purga sem amostras na janela é um no-op', () => {
  resetCalibration();
  addCalibrationSample(makeFeatures(0.1), { x: 0.1, y: 0.1 }, 100);
  assert.equal(purgeRecentCalibrationSamples(5000), 0);
  assert.equal(calibrationSampleCount(), 1);
});
```

Os call-sites existentes do próprio arquivo de teste (os loops que constroem o fit
com `addCalibrationSample(features, target)`, linha ~72) ganham o terceiro
argumento com timestamp monotônico: `addCalibrationSample(features, target, index * 40)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/services/gazeCalibration.test.ts`
Expected: FAIL — `purgeRecentCalibrationSamples` não existe; `addCalibrationSample` não aceita `tMs`.

- [ ] **Step 3: Implement in gazeCalibration.ts**

```typescript
import { purgeLeadingBlinkSamples, BLINK_LEADING_PURGE_MS } from './blinkGate';

interface Sample {
  t: number; // ms — permite purga retroativa da borda de subida da piscada
  features: number[];
  target: { x: number; y: number };
}

export function addCalibrationSample(features: number[], target: { x: number; y: number }, tMs: number) {
  if (features.length !== GAZE_FEATURE_LENGTH) return;
  samples.push({ t: tMs, features: features.slice(), target });
}

// Borda de subida da piscada detectada AGORA: as amostras dos últimos windowMs
// entraram no buffer com a pálpebra já descendo (score ainda abaixo do enter) e
// contaminariam o ridge fit — o modelo treinado espalha o erro para TODAS as
// medidas posteriores. Mesma semântica da purga do buffer de traçado.
export function purgeRecentCalibrationSamples(
  nowMs: number,
  windowMs: number = BLINK_LEADING_PURGE_MS,
): number {
  const before = samples.length;
  purgeLeadingBlinkSamples(samples, nowMs, windowMs);
  return before - samples.length;
}
```

(`purgeLeadingBlinkSamples` opera sobre `Array<{t:number}>` — o `Sample` novo satisfaz o contrato; buffers são apendados em ordem de `t`, requisito da purga.)

Checar ciclo de import: `gazeCalibration` → `blinkGate` → `blinkBaseline` → (nada). Sem ciclo.

- [ ] **Step 4: Wire the overlay**

Em `CalibrationOverlay.tsx`:

1. `addCalibrationSample(feat, targetAbs, now)` — passa o timestamp já disponível (linha ~287).
2. Manter um registro paralelo por amostra aceita para os contadores: `fitSampleLogRef = useRef<Array<{ t: number; point: number }>>([])`; push `{ t: now, point: idxRef.current }` junto de cada `addCalibrationSample`; zerar no `setup` e nos resets que zeram `fitSampleCountsRef`.
3. Logo após `const blinking = blinkGate.update(getBlinkScore(), now);`, na fase `calibrating`:

```typescript
          if (blinkGate.wasRisingEdge() && phaseNow === 'calibrating') {
            // Mesmo predicado nas duas estruturas (janela de t sobre agora):
            // buffer de fit e contadores não podem divergir — os contadores
            // alimentam o contrato de validade (minimumSamplesPerPoint).
            purgeRecentCalibrationSamples(now);
            const log = fitSampleLogRef.current;
            while (log.length && now - log[log.length - 1].t <= BLINK_LEADING_PURGE_MS) {
              const entry = log.pop()!;
              fitSampleCountsRef.current[entry.point] -= 1;
              if (entry.point === idxRef.current) collectedRef.current -= 1;
            }
          }
```

(`BLINK_LEADING_PURGE_MS` entra nos imports do arquivo. A purga pode atravessar a fronteira do ponto anterior — o log carrega `point` exatamente para decrementar o contador certo.)

- [ ] **Step 5: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS — o call-site único de `addCalibrationSample` fora dos testes é o overlay; qualquer outro quebraria no lint.

- [ ] **Step 6: Commit**

```bash
git add src/services/gazeCalibration.ts src/services/gazeCalibration.test.ts src/components/CalibrationOverlay.tsx
git commit -m "feat: purge blink rising-edge samples from the calibration fit buffer"
```

---

### Task 5: Purga nos buffers de captura

**Files:**
- Modify: `src/hooks/useCameraPipeline.ts` (`blinkRising` no frame)
- Modify: `src/screens/EyeTrackingTestScreen.tsx` (consome `blinkRising`; repassa à captura)
- Modify: `src/hooks/useCaptureLifecycle.ts` (purga os dois buffers)
- Test: `src/hooks/useCaptureLifecycle.test.ts`

**Interfaces:**
- Consumes: `wasRisingEdge` (Task 2), `purgeLeadingBlinkSamples`.
- Produces: `CameraPipelineFrame` ganha `blinkRising: boolean`; `CaptureFrameInput` ganha `blinkRising: boolean`; helper puro exportado `purgeCaptureBuffersOnBlinkEdge(calSamples: GazeSample[], rawSamples: GazeSample[], nowMs: number): void` em `useCaptureLifecycle.ts`.

- [ ] **Step 1: Write the failing test**

Acrescentar a `src/hooks/useCaptureLifecycle.test.ts`:

```typescript
import { purgeCaptureBuffersOnBlinkEdge } from './useCaptureLifecycle';

test('borda de piscada purga os DOIS buffers de captura, não só o traçado', () => {
  // Critério de aceite 4 do spec: calibrado e bruto acumulam em buffers
  // separados (routeCaptureSample) e ambos ingeriram a borda de subida.
  const cal = [{ t: 100, h: 0.5, v: 0.5 }, { t: 950, h: 0.6, v: 0.5 }];
  const raw = [{ t: 120, h: 0.4, v: 0.5 }, { t: 990, h: 0.7, v: 0.5 }];
  purgeCaptureBuffersOnBlinkEdge(cal, raw, 1000);
  assert.deepEqual(cal.map(s => s.t), [100]);   // 950 está nos últimos 80ms
  assert.deepEqual(raw.map(s => s.t), [120]);   // 990 idem
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/hooks/useCaptureLifecycle.test.ts`
Expected: FAIL — helper não existe.

- [ ] **Step 3: Implement**

Em `useCaptureLifecycle.ts` (junto das decisões puras, seção `--- Pure per-frame decisions ---`):

```typescript
import { purgeLeadingBlinkSamples } from '@/services/blinkGate';

// Borda de subida da piscada durante captura: as amostras dos últimos ~80ms
// entraram nos buffers com a íris parcialmente coberta. O buffer de traçado já
// recebia esta purga; os buffers que viram MEDIDA (spec P2) agora também.
export function purgeCaptureBuffersOnBlinkEdge(
  calSamples: GazeSample[],
  rawSamples: GazeSample[],
  nowMs: number,
): void {
  purgeLeadingBlinkSamples(calSamples, nowMs);
  purgeLeadingBlinkSamples(rawSamples, nowMs);
}
```

Em `pushFrameSample`, no caminho em que a captura está ativa, antes do roteamento da amostra do frame:

```typescript
    if (input.blinkRising) {
      purgeCaptureBuffersOnBlinkEdge(captureCalSamplesRef.current, captureRawSamplesRef.current, input.ts);
    }
```

`CaptureFrameInput` ganha `blinkRising: boolean` documentado: "Borda de subida do gate de piscada neste frame (transição aceitar→rejeitar)".

Em `useCameraPipeline.ts`, no `loop`:

```typescript
    const blinking = blinkGateRef.current.update(blinkScore, ts);
    const blinkRising = blinkGateRef.current.wasRisingEdge();
```

e `blinkRising` entra no objeto passado a `onFrameRef.current({...})` + no tipo `CameraPipelineFrame` (comentário: `// transição aceitar→rejeitar neste frame (borda de subida da piscada)`).

Em `EyeTrackingTestScreen.tsx`:

- `handleFrame` desestrutura `blinkRising` e substitui a detecção manual de borda:

```typescript
    if (blinkRising) {
      purgeLeadingBlinkSamples(visualSignalSamplesRef.current, ts);
    }
```

- Remover `prevBlinkingRef` (declaração e as duas linhas de uso) — o gate agora é o dono da informação de borda.
- `pushFrameSample({ ..., blinking: input.blinking, blinkRising, ... })` — repassa o campo novo.

- [ ] **Step 4: Run full suite + lint**

Run: `npm test && npm run lint`
Expected: PASS. O lint acusa qualquer construtor de `CaptureFrameInput` sem o campo novo.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCameraPipeline.ts src/hooks/useCaptureLifecycle.ts src/hooks/useCaptureLifecycle.test.ts src/screens/EyeTrackingTestScreen.tsx
git commit -m "feat: purge blink rising-edge samples from both capture measurement buffers"
```

---

### Task 6: `visualSignal` sobre o detector clínico

**Files:**
- Modify: `src/exercises/saccadeAnalysis.ts` (extrair `lineReturnThresholdFor` — refactor puro, comportamento idêntico)
- Modify: `src/services/visualSignal.ts` (reescrita interna)
- Test: `src/exercises/saccadeAnalysis.test.ts` (só se necessário p/ export), `src/services/visualSignal.test.ts`

**Interfaces:**
- Consumes: `detectFixations`, `dispersion` (`@/exercises/fixationDetection`); `saccadesFromFixations`, `dispersionThresholdFor` (`@/exercises/saccadesFromFixations`); `lineReturnThresholdFor` (novo export de `@/exercises/saccadeAnalysis`).
- Produces: `summarizeFunctionalVisualSignal` com a MESMA assinatura e o MESMO shape de retorno; semântica nova de `fixationShare` (fração de tempo), `lineReturnCandidate` (sacada derivada) e `directionChangeRate` (entre sacadas); `lineReturnThresholdFor(progressiveAmplitudes: number[]): number` exportado de `saccadeAnalysis.ts`.

**Contrato declarado:** este é o único task que muda contrato de teste existente. Os testes de `visualSignal.test.ts` que codificam a régua por-amostra (line-return por delta único, fixationShare por intervalo) são reescritos para a régua por-tempo — mudança prevista e aprovada no spec, não mascaramento de falha.

- [ ] **Step 1: Extract `lineReturnThresholdFor` (refactor, teste primeiro é dispensado: comportamento idêntico provado pela suíte existente)**

Em `saccadeAnalysis.ts`, extrair o cálculo do limiar (linhas ~130-135) para função exportada:

```typescript
// Limiar de retorno de linha derivado das amplitudes progressivas da própria
// captura (ver o bloco de comentário das constantes LINE_RETURN_* acima).
// Exportado para o hint ao vivo (visualSignal) usar a MESMA régua do clínico.
export function lineReturnThresholdFor(progressiveAmplitudes: number[]): number {
  return progressiveAmplitudes.length
    ? Math.min(
        LINE_RETURN_THRESHOLD_CAP,
        Math.max(LINE_RETURN_THRESHOLD_FLOOR, LINE_RETURN_RELATIVE_FACTOR * median(progressiveAmplitudes))
      )
    : LINE_RETURN_THRESHOLD_CAP;
}
```

`analyzeSaccades` passa a chamar `lineReturnThresholdFor(progressive)`. Atualizar o comentário `visualSignal.ts keeps its own fixed LINE_RETURN_DH` (linhas ~52-53) — deixa de ser verdade nesta task.

Run: `npm test` — a suíte inteira prova o refactor.

- [ ] **Step 2: Write the failing invariance test (criterion 1 do spec)**

Acrescentar a `src/services/visualSignal.test.ts`:

```typescript
// Trajetória de leitura contínua no tempo: 5 fixações progressivas (~250ms) com
// sacadas para a direita, retorno de linha amplo, mais 3 fixações. Amostrada a
// 30 e a 60fps a partir da MESMA função contínua.
function readingTrajectory(tMs: number): { h: number; v: number } {
  const fixations = [
    { until: 250, h: 0.15, v: 0.30 }, { until: 500, h: 0.30, v: 0.30 },
    { until: 750, h: 0.45, v: 0.30 }, { until: 1000, h: 0.60, v: 0.30 },
    { until: 1250, h: 0.75, v: 0.30 },
    // retorno de linha: salto amplo para a esquerda com deslocamento vertical
    { until: 1500, h: 0.15, v: 0.42 }, { until: 1750, h: 0.30, v: 0.42 },
    { until: 2100, h: 0.45, v: 0.42 },
  ];
  for (const f of fixations) if (tMs < f.until) return { h: f.h, v: f.v };
  return { h: 0.45, v: 0.42 };
}

function sampleAt(fps: number): VisualSignalSample[] {
  const dt = 1000 / fps;
  const out: VisualSignalSample[] = [];
  for (let t = 0; t < 2100; t += dt) {
    const p = readingTrajectory(t);
    out.push({ t, h: p.h, v: p.v });
  }
  return out;
}

test('mesma leitura a 30 e 60fps: hint de retorno de linha e oscilação idênticos, fixationShare ≤ 5pp', () => {
  const s30 = summarizeFunctionalVisualSignal(sampleAt(30));
  const s60 = summarizeFunctionalVisualSignal(sampleAt(60));
  // Antes da migração este par diverge categoricamente: a 60fps nenhum delta
  // individual cruza LINE_RETURN_DH = -0.35 (o salto se divide em dois frames).
  assert.equal(s30.lineReturnCandidate, true);
  assert.equal(s60.lineReturnCandidate, true);
  assert.ok(Math.abs(s30.fixationShare - s60.fixationShare) <= 5);
  assert.equal(s30.status, s60.status);
});

test('fixationShare é fração de TEMPO em fixação, não de intervalos', () => {
  // 8 fixações de ~250ms num total de 2100ms ⇒ share alto (>70) nas duas taxas.
  const s = summarizeFunctionalVisualSignal(sampleAt(30));
  assert.ok(s.fixationShare > 70, `share=${s.fixationShare}`);
});
```

- [ ] **Step 3: Run to verify the new tests fail**

Run: `node --import tsx --test src/services/visualSignal.test.ts`
Expected: FAIL — a 60fps `lineReturnCandidate` é `false` (é exatamente o defeito P1).

- [ ] **Step 4: Rewrite the internals**

Em `visualSignal.ts`:

1. Imports novos:

```typescript
import { detectFixations, dispersion } from '@/exercises/fixationDetection';
import { saccadesFromFixations, dispersionThresholdFor } from '@/exercises/saccadesFromFixations';
import { lineReturnThresholdFor } from '@/exercises/saccadeAnalysis';
```

2. Bloco de constantes de apresentação, agrupado no topo (mitigação do risco do spec):

```typescript
// --- Limiares de APRESENTAÇÃO do painel ao vivo ---
// Sintonizados na régua antiga (por amostra); mantidos após a migração para o
// detector por tempo e sujeitos a reancoragem empírica com Anders lendo o
// painel (REVISÃO SUGERIDA no spec 2026-07-28). São cortes de rótulo, não medidas.
const MIN_SAMPLES = 5;
const MIN_DURATION_MS = 250;
const USEFUL_HORIZONTAL_RANGE = 0.18;
const LOW_HORIZONTAL_RANGE = 0.08;
const CONTINUITY_GAP_MS = 160;
const NOISY_DIRECTION_CHANGE_RATE = 0.7;
const NOISY_MIN_RANGE = 0.12;
const USEFUL_CONTINUITY = 70;
const USEFUL_SENSITIVITY = 55;
const LOW_CONTINUITY = 50;
```

(Removidas: `FIXATION_VELOCITY`, `LINE_RETURN_DH`, `LINE_RETURN_DV` — a régua por-amostra morre aqui. Os cortes hardcoded `50`, `0.7`, `0.12`, `70`, `55` do corpo migram para as constantes nomeadas, valores idênticos.)

3. Núcleo novo do cálculo (substitui `fixationShare`/`lineReturnCandidate`/`directionChangeRate` atuais; `intervals` continua existindo só para `continuityPct`):

```typescript
  // Mesmo detector do clínico (saccadeAnalysis): fixações por dispersão (I-DT),
  // sacadas derivadas das transições, limiar de dispersão relativo à extensão do
  // próprio sinal. Fps-invariante por construção — provado no teste 30↔60fps.
  const fixations = detectFixations(valid, {
    dispersionThreshold: dispersionThresholdFor(dispersion(valid)),
  });
  const fixatedMs = fixations.reduce((sum, f) => sum + f.durationMs, 0);
  const fixationShare = round0(Math.min(100, (fixatedMs / durationMs) * 100));

  const saccades = saccadesFromFixations(fixations);
  const progressive = saccades.filter(s => s.amplitude > 0).map(s => s.amplitude);
  const lineReturnThreshold = lineReturnThresholdFor(progressive);
  const lineReturnCandidate = saccades.some(
    s => s.amplitude < 0 && Math.abs(s.amplitude) >= lineReturnThreshold,
  );
  // Oscilação entre SACADAS (o olho alternando direção), não entre amostras —
  // a alternância por amostra era dominada pelo ruído e dependia da taxa.
  const directionChangeRate = directionChanges(saccades.map(s => s.amplitude))
    / Math.max(1, saccades.length - 1);
```

4. A fórmula do `sensitivityScore` e a árvore de status ficam como estão, agora lendo as constantes nomeadas.

5. Testes existentes de `visualSignal.test.ts` — análise já feita contra o engine novo:
   - `reports no useful capture with sparse samples`, `recognizes useful horizontal reading movement` e `preserves fractional sample rate evidence` **permanecem intocados** (verificado: no engine novo o segundo produz 3 fixações de 120ms → `fixationShare` 60, e todos os asserts continuam válidos).
   - `separates broad line return from short regression` **quebra de verdade** (5 amostras espaçadas 100ms não formam fixação nenhuma no I-DT) e é substituído por este, que preserva a intenção — separar retorno amplo de regressão curta — na régua de sacadas derivadas:

```typescript
// Emite um platô de fixação (~30ms de passo) e devolve o t do fim.
function plateau(samples: VisualSignalSample[], tStart: number, ms: number, h: number, v: number): number {
  for (let t = tStart; t < tStart + ms; t += 33) samples.push({ t, h, v, calibrated: true });
  return tStart + ms;
}

test('summarizeFunctionalVisualSignal separates broad line return from short regression', () => {
  const samples: VisualSignalSample[] = [];
  let t = 0;
  t = plateau(samples, t, 250, 0.22, 0.42);
  t = plateau(samples, t, 250, 0.40, 0.42); // progressiva +0.18
  t = plateau(samples, t, 250, 0.58, 0.42); // progressiva +0.18
  t = plateau(samples, t, 250, 0.50, 0.42); // regressão curta −0.08: NÃO é retorno
  t = plateau(samples, t, 250, 0.86, 0.43); // progressiva +0.36
  t = plateau(samples, t, 250, 0.18, 0.61); // retorno de linha −0.68 com queda de linha
  plateau(samples, t, 250, 0.34, 0.61);     // progressiva +0.16

  const summary = summarizeFunctionalVisualSignal(samples, { coverage: 88 });

  // Mediana progressiva 0.18 → limiar adaptativo = min(0.35, 3×0.18) = 0.35:
  // |−0.68| cruza (retorno); |−0.08| não (regressão curta) — a separação que
  // o teste antigo provava por delta único agora é provada por sacada derivada.
  assert.equal(summary.lineReturnCandidate, true);
  assert.match(summary.eventLabel, /retorno de linha/i);
});
```

- [ ] **Step 5: Run the file, then the full suite + lint**

Run: `node --import tsx --test src/services/visualSignal.test.ts && npm test && npm run lint`
Expected: PASS completo.

- [ ] **Step 6: Commit**

```bash
git add src/exercises/saccadeAnalysis.ts src/services/visualSignal.ts src/services/visualSignal.test.ts
git commit -m "feat: drive the live signal panel with the clinical fixation-first detector"
```

---

### Task 7: Verificação final e fechamento

**Files:**
- Modify: `BACKLOG.md` (registrar a `REVISÃO SUGERIDA` de reancoragem dos cortes)

- [ ] **Step 1: Full gates com evidência fresca**

Run: `npm test && npm run lint && npm run build`
Expected: suíte inteira PASS (447 + novos), tsc limpo, build dentro do budget de bundle (180000).

- [ ] **Step 2: Conferir critérios de aceite do spec**

1. Invariância 30↔60fps — teste da Task 6. ✓ automatizado
2. Baseline 0.29 sai pelo exit derivado — teste da Task 2. ✓ automatizado
3. Fallback preserva limiares atuais — testes das Tasks 1-2. ✓ automatizado
4. Purga nos dois buffers de captura — teste da Task 5. ✓ automatizado
5. Purga no fit da calibração — teste da Task 4. ✓ automatizado
6. Suíte verde com teste falhando antes de cada implementação — histórico dos commits.

- [ ] **Step 3: Registrar pendência real no BACKLOG.md**

Adicionar entrada: reancoragem empírica dos cortes de status do painel ao vivo (`visualSignal.ts`, bloco de limiares de apresentação) — exige sessão de Anders lendo o painel com o engine novo; e a decisão adiada sobre o trilho EMA do ponto azul (spec, fora de escopo).

- [ ] **Step 4: Commit**

```bash
git add BACKLOG.md
git commit -m "docs: record live-panel threshold re-anchoring as pending empirical review"
```

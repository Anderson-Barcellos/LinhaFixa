# BUNDLE "Religar os fios" — leitura sustentada, contexto sem atrito, tap encerra

> **Status 2026-07-19: EXECUTADO (as-built).** Tasks 1-8 completas. Gate: lint ✓, 288/288 tests (12 novos), build 85451/180000 gzip, smoke 108L+72V+7WF+43LD (real-tab-hidden BLOCKED pré-existente). Aguardando revisão do Anders; sem commit e sem deploy.

**Data:** 2026-07-19 · **Execução:** inline (Claude, sem subagentes) · **Origem:** auditoria de 3 agentes Sonnet (leitura curta / form pré-teste / tap-para-encerrar)

## Contexto

Três incômodos do Anders + dois bugs achados na auditoria. Padrão comum: os pipelines certos já existem (`finishCapture` trunca buffers, `contextDraft` prefill, `durationSec` no planner) mas estão desligados uns dos outros. Nada aqui é refactor — é religar fio.

Descoberta da leitura de código: a tela de captura (`EyeTrackingTestScreen`) tem fluxo próprio de texto/fonte, **separado** do exercício `assistedReading` (fluxo `/player`). As mudanças de texto/duração precisam cobrir os dois.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/services/readingLength.ts` | Criar | Função pura: duração-alvo → faixa de palavras |
| `src/services/readingLength.test.ts` | Criar | Testes da faixa |
| `server.ts:42-71` | Modificar | Rota `generateReadingContent` aceita `targetDurationSec`, prompt escala palavras |
| `src/services/contentGenerator.ts` | Modificar | Repassa `targetDurationSec` no POST |
| `src/screens/EyeTrackingTestScreen.tsx` | Modificar | Alvo 20s no texto; adotar contexto do dia (pular form); botão "Pular"; overlay opaco; timer no drawer `side`; tap na área de leitura encerra captura |
| `src/exercises/assistedReading.ts` | Modificar | Clamp do `fontPx`; loop de chunks até tempo mínimo; passa `durationSec` ao gerador |
| `src/exercises/assistedReading.test.ts` | Modificar | Testes de clamp + loop |
| `src/services/preTestContext.ts` | Criar | Seletor puro do contexto de hoje (sessions + captures) |
| `src/services/preTestContext.test.ts` | Criar | Testes do seletor |
| `src/services/storage.ts:91-101` | Modificar | `getTodayPreContext` passa a olhar sessions **e** validationCaptures |
| `src/components/QuickContextForm.tsx` | Modificar | Compactação CSS (spacing/padding) |
| `src/components/ExerciseCanvas.tsx` | Modificar | Prop `registerStop` expondo parada limpa via `finishExercise` |
| `src/screens/ExercisePlayerScreen.tsx:309` | Modificar | "Parar Imediatamente" trunca e salva parcial em vez de descartar |

---

### Task 1: Faixa de palavras por duração (pura)

**Arquivos:** Criar `src/services/readingLength.ts` + `src/services/readingLength.test.ts`

Leitura silenciosa ~180-270 wpm ⇒ 3-4.5 palavras/s. Piso 30 (nunca menor que o comportamento atual), teto 400 (sanidade).

- [ ] **1. Teste que falha** (`readingLength.test.ts`):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingWordRange } from './readingLength';

test('20s → 60-90 palavras', () => {
  assert.deepEqual(readingWordRange(20), { min: 60, max: 90 });
});
test('duração curta respeita piso de 30 palavras', () => {
  assert.deepEqual(readingWordRange(5), { min: 30, max: 30 });
});
test('duração longa respeita teto de 400', () => {
  assert.deepEqual(readingWordRange(200), { min: 400, max: 400 });
});
test('entrada inválida cai no default 20s', () => {
  assert.deepEqual(readingWordRange(NaN), readingWordRange(20));
  assert.deepEqual(readingWordRange(0), readingWordRange(20));
});
```
- [ ] **2. Rodar e ver falhar** — `node --import tsx --test src/services/readingLength.test.ts` (module not found)
- [ ] **3. Implementação** (`readingLength.ts`):
```ts
// Silent-reading pace: ~3-4.5 words/s. The floor keeps today's minimum text;
// the cap bounds the OpenAI prompt no matter what duration a caller sends.
export function readingWordRange(targetDurationSec: number): { min: number; max: number } {
  const sec = Number.isFinite(targetDurationSec) && targetDurationSec > 0 ? targetDurationSec : 20;
  const clamp = (n: number) => Math.max(30, Math.min(400, Math.round(n)));
  return { min: clamp(sec * 3), max: clamp(sec * 4.5) };
}
```
- [ ] **4. Rodar e ver passar** — mesmo comando

### Task 2: Prompt escala com a duração (server + client)

**Arquivos:** Modificar `server.ts:42-55`, `src/services/contentGenerator.ts`, chamadas em `EyeTrackingTestScreen.tsx:307` e `assistedReading.ts:70`

- [ ] **1.** `server.ts`: importar `readingWordRange` de `./src/services/readingLength`; na rota, `const { complexity, targetDurationSec } = req.body;` e `const range = readingWordRange(Number(targetDurationSec));`; trocar a linha fixa do prompt por:
```ts
`O texto deve sustentar uma leitura contínua de ~${Math.round(Number.isFinite(Number(targetDurationSec)) && Number(targetDurationSec) > 0 ? Number(targetDurationSec) : 20)} segundos (entre ${range.min} e ${range.max} palavras).`
```
- [ ] **2.** `contentGenerator.ts`: assinatura `getReadingContent(complexity, targetDurationSec = 20)`; body `JSON.stringify({ complexity, targetDurationSec })`.
- [ ] **3.** `EyeTrackingTestScreen.tsx:307`: `getReadingContent('facil', READING_TARGET_DURATION_SEC)` com `const READING_TARGET_DURATION_SEC = 20;` junto ao `CAPTURE_SAFETY_CAP_MS`.
- [ ] **4.** `assistedReading.ts:70`: `getReadingContent(context.parameters.textComplexity || 'facil', context.parameters.durationSec)`.
- [ ] **5.** Gate: `npm run lint` + `npm test` verdes.

### Task 3: assistedReading — clamp de fonte + loop até tempo mínimo

**Arquivos:** Modificar `src/exercises/assistedReading.ts:54,204-206` · Teste `src/exercises/assistedReading.test.ts`

- [ ] **1. Testes que falham** (adicionar ao test existente; conferir se o caso atual espera `fontPx=60` e ajustar para o clamp):
```ts
test('fontPx tem clamp superior (56px) mesmo com distância enorme', () => {
  const context = makeContext({ degToPx: (deg: number) => deg * 100 }); // 1.2° → 120px
  assistedReadingExercise.init(context);
  assert.equal(context.state.fontPx, 56);
});
test('fontPx tem clamp inferior (18px)', () => {
  const context = makeContext({ degToPx: (deg: number) => deg * 10 }); // 1.2° → 12px
  assistedReadingExercise.init(context);
  assert.equal(context.state.fontPx, 18);
});
test('último chunk antes de 70% da duração reinicia o loop em vez de finalizar', () => {
  // contexto com durationSec=20, timeMs baixo; avançar todos os chunks
  // esperar: finishExercise NÃO chamado, currentIndex === 0
});
test('último chunk após 70% da duração finaliza normalmente', () => {
  // timeMs ≥ 14000 → finishExercise chamado
});
```
(adaptar `makeContext` ao helper que o arquivo de teste já usa — repetir o setup existente, não inventar novo)
- [ ] **2. Ver falhar** — `node --import tsx --test src/exercises/assistedReading.test.ts`
- [ ] **3. Implementação:**
```ts
// init: clamp absoluto — protege contra distância de perfil digitada errada
const fontPx = Math.max(18, Math.min(56, Math.round(context.degToPx(readingFontAngleDeg(context.fontSizePreference)))));
```
```ts
// onInput, no lugar do finish incondicional:
if (s.currentIndex === s.chunks.length) {
   const minMs = (context.parameters.durationSec || 0) * 1000 * 0.7;
   if (context.timeMs >= minMs) {
      context.finishExercise(buildReadingResult(context));
   } else {
      // Texto acabou cedo: recomeça o percurso para sustentar a duração-alvo;
      // intervals continuam acumulando, o teto do canvas encerra no durationSec.
      s.currentIndex = 0;
   }
}
```
- [ ] **4. Ver passar** — mesmo comando; suite inteira `npm test`.

### Task 4: Seletor puro do contexto de hoje + fix do prefill

**Arquivos:** Criar `src/services/preTestContext.ts` + `.test.ts` · Modificar `src/services/storage.ts:91-101`

- [ ] **1. Teste que falha** (`preTestContext.test.ts`):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectTodayPreContext } from './preTestContext';

const ctx = (mood: number) => ({ venvanseTakenAt: null, sleepHours: 7, mood, feeling: 3 });
const day = new Date('2026-07-19T15:00:00');
const t = (h: number) => new Date('2026-07-19T00:00:00').getTime() + h * 3600_000;

test('retorna o contexto mais recente de hoje entre as fontes', () => {
  const picked = selectTodayPreContext([
    { timestamp: t(8), context: ctx(2) },
    { timestamp: t(11), context: ctx(4) },
    { timestamp: t(9), context: undefined },
  ], day);
  assert.equal(picked?.mood, 4);
});
test('ignora registros de ontem', () => {
  const picked = selectTodayPreContext([{ timestamp: t(-2), context: ctx(5) }], day);
  assert.equal(picked, null);
});
```
- [ ] **2. Ver falhar** — `node --import tsx --test src/services/preTestContext.test.ts`
- [ ] **3. Implementação** (`preTestContext.ts`):
```ts
import { PreTestContext } from '@/types';

// Latest context tagged today across any record source (sessions from the
// player, validation captures from /assessment). Pure so it's testable without idb.
export function selectTodayPreContext(
  entries: Array<{ timestamp: number; context?: PreTestContext | null }>,
  now: Date = new Date(),
): PreTestContext | null {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  let best: { timestamp: number; context: PreTestContext } | null = null;
  for (const e of entries) {
    if (e.timestamp < startOfDay.getTime() || !e.context) continue;
    if (!best || e.timestamp > best.timestamp) best = { timestamp: e.timestamp, context: e.context };
  }
  return best?.context ?? null;
}
```
- [ ] **4.** `storage.ts`: reescrever `getTodayPreContext` usando o seletor sobre **sessions + validationCaptures**:
```ts
export async function getTodayPreContext(): Promise<PreTestContext | null> {
  const [sessions, captures] = await Promise.all([getSessions(), getValidationCaptures()]);
  return selectTodayPreContext([
    ...sessions.map(s => ({ timestamp: s.timestamp, context: s.contextBefore })),
    ...captures.map(c => ({ timestamp: c.timestamp, context: c.context })),
  ]);
}
```
- [ ] **5. Ver passar** — suite inteira `npm test` + `npm run lint`.

### Task 5: EyeTrackingTestScreen — adotar contexto do dia, "Pular", overlay opaco, timer no side

**Arquivos:** Modificar `src/screens/EyeTrackingTestScreen.tsx:203-207, 1334, 1522, 1539-1544`

- [ ] **1.** Efeito de mount (203-207): quando `getTodayPreContext()` retorna contexto, além do draft, **adotar** — assim o form nem abre nas próximas sessões do dia:
```ts
getTodayPreContext()
  .then(ctx => {
    if (!ctx) return;
    setContextDraft(ctx);
    preContextRef.current = ctx;   // adota: form só na primeira resposta do dia
    setPreContext(ctx);
  })
  .catch(() => {/* keep defaults */});
```
- [ ] **2.** Botão "Pular por agora" no modal (reata o comentário "never blocks"): entre o submit e o "Cancelar":
```tsx
<button
  onClick={() => { setContextFormOpen(false); startCapture(); }}
  className="w-full mt-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-sm font-bold"
>
  Pular por agora e iniciar
</button>
```
  Atenção: `startCapture()` re-checa `preContextRef.current` e reabriria o modal — guardar com flag `skipContextRef` (ref booleana) checada em `startCapture` antes de abrir o form:
```ts
if (!preContextRef.current && !skipContextRef.current) { setContextFormOpen(true); return; }
```
  (o "Pular" seta `skipContextRef.current = true` antes de chamar `startCapture`; captura segue com `context: undefined`.)
- [ ] **3.** Overlay do form: `bg-slate-900/90` → `bg-slate-900` (linha 1522) — elimina "leitura rodando atrás".
- [ ] **4.** Timer no drawer `side` (linha 1334): remover a condição `drawerVariant === 'sheet' &&` — o span é pequeno, cabe na coluna lateral.
- [ ] **5. Gate:** `npm run lint` + `npm run build` verdes.

### Task 6: Tap na área de leitura encerra a captura

**Arquivos:** Modificar `src/screens/EyeTrackingTestScreen.tsx:1388-1393`

- [ ] **1.** No wrapper da área de leitura (div com `aria-label="Área fixa de leitura, captura e calibração"`), adicionar:
```tsx
onPointerDown={() => { if (capturingRef.current) finishCapture(); }}
```
  `finishCapture()` já copia os buffers no instante da chamada — a truncagem no timestamp do tap é automática. O botão "Terminei de ler" permanece como afordance redundante. Fora de captura o tap é inerte (não inicia nada — evita começo acidental).
- [ ] **2.** Sanity: overlays (form, quiz, report) ficam em `z-40+` acima da área — tap neles não vaza pro wrapper; CalibrationOverlay é irmão, não filho. Confirmar por leitura.
- [ ] **3. Gate:** `npm run lint` + smoke existente.

### Task 7: "Parar Imediatamente" trunca em vez de descartar

**Arquivos:** Modificar `src/components/ExerciseCanvas.tsx` (props + efeito) e `src/screens/ExercisePlayerScreen.tsx:309` + `handleExerciseFinish`

- [ ] **1.** `ExerciseCanvas`: nova prop opcional `registerStop?: (stop: () => void) => void`. Depois de `impl.init(exContext)`:
```ts
registerStop?.(() => {
  const partial = impl.getResultData ? impl.getResultData(exContext) : undefined;
  exContext.finishExercise({ ...(partial || {}), stoppedEarly: true });
});
```
  (usa o pipeline `finishExercise` existente — stillness/postural/geometry saem corretos; guard `isRunning` já torna idempotente.)
- [ ] **2.** `ExercisePlayerScreen`: `const stopExerciseRef = useRef<(() => void) | null>(null);` e `const stopEarlyRef = useRef(false);`. Botão:
```tsx
<button onClick={() => {
  if (stopExerciseRef.current) { stopEarlyRef.current = true; stopExerciseRef.current(); }
  else setStage('POST_CONTEXT');
}} ...>Parar Imediatamente</button>
```
  Passar `registerStop={stop => { stopExerciseRef.current = stop; }}` ao `ExerciseCanvas`.
- [ ] **3.** `handleExerciseFinish`: após `setResults([...results, newResult])`, se `stopEarlyRef.current` → `stopEarlyRef.current = false; setStage('POST_CONTEXT'); return;` (parada manual pula rating de leitura e próximos exercícios — resultado parcial fica salvo em `results`).
- [ ] **4. Gate:** `npm run lint` + `npm test` + `npm run build`.

### Task 8: Compactar o PreContextForm

**Arquivos:** Modificar `src/components/QuickContextForm.tsx:112-145`

- [ ] **1.** Só CSS (vale pros dois fluxos que usam o form): `p-6`→`p-5`, `mb-6`→`mb-4`, `space-y-6`→`space-y-4`, `mt-8`→`mt-5`, `py-4`→`py-3.5` no submit, `py-2.5`→`py-2` nos EmojiScale, `text-2xl`→`text-xl` nos emojis. Reduz ~90-110px de altura sem mudar lógica.
- [ ] **2. Gate:** `npm run build` + conferência visual (screenshot mobile landscape se possível).

---

## Gate final do BUNDLE

`npm run lint` && `npm test` && `APP_BASE_PATH=/gaze npm run build` + smoke layout. Deploy só após OK do Anders (`sudo systemctl restart linhafixa.service`). `real-tab-hidden` BLOCKED é pré-existente (BACKLOG).

## Riscos (detectar cedo)

- **Teste existente do fontPx=60** vai quebrar com o clamp 56 — ajustar a expectativa é parte da Task 3, não regressão.
- **Loop de chunks** muda semântica dos `intervals` (inclui re-leituras): aceitável — fluxo temporal é o que se mede; anotar no resultado se preciso (`loopedReading: true` é follow-up, não bloqueia).
- **Tap-to-finish**: risco de tap acidental encerrar cedo — mitigado por só valer durante captura e pelo botão continuar existindo; se incomodar, exigir tap duplo é ajuste de 1 linha.
- **`skipContextRef`**: sem ele, "Pular" entra em loop reabrindo o modal — teste manual obrigatório desse caminho.

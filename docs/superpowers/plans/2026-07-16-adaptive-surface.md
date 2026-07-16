# Adaptive Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Superfícies de texto dimensionadas por medição real do container (fim da incoerência badge×caixa e do borrão DPR) e estímulo do exercício congelado por distância viva com monitor de drift.

**Architecture:** Uma primitiva pura de medição (`measuredSurface`) alimenta um hook React (tela de diagnóstico) e um ResizeObserver imperativo (ExerciseCanvas). `computeDiagnosticsSurface` deixa de prever espaço com constantes e passa a receber medidas reais. Um serviço puro novo (`stimulusDistance`) congela a distância do estímulo no início do exercício e monitora drift com histerese.

**Tech Stack:** React 18 + TypeScript + Vite; testes com **node:test nativo** (`node --import tsx --test`) — NÃO é vitest/jest, não há jsdom; Tailwind para classes utilitárias.

**Spec:** `docs/superpowers/specs/2026-07-16-adaptive-surface-design.md`

> **Superseded em parte:** commits 8f3cf1c (geometria desktop unificada, sem 16:9) e 605962f (teto de largura 1440) substituem o código da Task 3 embutido abaixo — decisões de Anders no gate L1.

## Global Constraints

- Runner de teste: `npm run test` = `node --import tsx --test src/services/*.test.ts src/exercises/*.test.ts`. Testes novos DEVEM usar `import { test } from 'node:test'` + `import assert from 'node:assert/strict'` (padrão do repo — veja `src/services/captureGeometry.test.ts`).
- Gate por task: `npm run lint` (= `tsc --noEmit`) e `npm run test`. Gate de fim de BUNDLE inclui `npm run smoke`.
- Zero dependências novas. Zero jsdom. Lógica testável vive em serviços puros; hooks/componentes ficam finos.
- Textos de UI em PT-BR. Comentários no estilo do repo (explicam o porquê, em inglês ou PT-BR conforme o arquivo).
- Imports com alias `@/` (padrão do repo).
- Commits por task com footer `Co-Authored-By: Claude <noreply@anthropic.com>` (HEREDOC para mensagens multi-linha).
- Parâmetros clínicos pinados (do spec): EMA α=0.15; convergência = variação relativa ≤5% ao longo de 1000ms; timeout sem medição = 3000ms; drift entra >15% (`DISTANCE_DRIFT_TOLERANCE` existente em `viewingGeometry.ts:69`), sai <12%.

---

# BUNDLE L1 — Medição e layout

**Critério verificável do BUNDLE:** badge == caixa renderizada no monitor vertical do Anders; texto do exercício nítido em dpr 1.3375; suíte + smoke verdes.

---

### Task 1: Serviço puro `measuredSurface`

**Files:**
- Create: `src/services/measuredSurface.ts`
- Test: `src/services/measuredSurface.test.ts`

**Interfaces:**
- Consumes: nada (folha).
- Produces (Tasks 2 e 5 dependem EXATAMENTE destes nomes):
  ```ts
  export interface MeasuredSurface {
    cssWidth: number;      // px CSS do content box
    cssHeight: number;
    dpr: number;           // devicePixelRatio efetivo usado
    devicePxWidth: number; // px físicos do backing store
    devicePxHeight: number;
  }
  export interface SurfaceBoxEntry { /* shape mínima de ResizeObserverEntry */ }
  export function measuredSurfaceFromEntry(entry: SurfaceBoxEntry, dpr: number): MeasuredSurface | null;
  export function measuredSurfaceEquals(a: MeasuredSurface | null, b: MeasuredSurface | null): boolean;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/services/measuredSurface.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measuredSurfaceFromEntry, measuredSurfaceEquals } from './measuredSurface';

test('prefers devicePixelContentBoxSize when the browser provides it (Chromium)', () => {
  const m = measuredSurfaceFromEntry({
    devicePixelContentBoxSize: [{ inlineSize: 1071, blockSize: 1605 }],
    contentBoxSize: [{ inlineSize: 800.7, blockSize: 1200.4 }],
  }, 1.3375);

  assert.ok(m);
  assert.equal(m.devicePxWidth, 1071);   // px físicos exatos, sem meio-pixel
  assert.equal(m.devicePxHeight, 1605);
  assert.equal(m.cssWidth, 800.7);
  assert.equal(m.cssHeight, 1200.4);
  assert.equal(m.dpr, 1.3375);
});

test('falls back to contentBoxSize × dpr when device-pixel box is missing (Safari/iPhone)', () => {
  const m = measuredSurfaceFromEntry({
    contentBoxSize: [{ inlineSize: 800, blockSize: 1200 }],
  }, 1.3375);

  assert.ok(m);
  assert.equal(m.devicePxWidth, Math.round(800 * 1.3375));  // 1070
  assert.equal(m.devicePxHeight, Math.round(1200 * 1.3375)); // 1605
});

test('falls back to contentRect for older engines', () => {
  const m = measuredSurfaceFromEntry({ contentRect: { width: 320, height: 480 } }, 2);
  assert.ok(m);
  assert.equal(m.cssWidth, 320);
  assert.equal(m.devicePxWidth, 640);
});

test('returns null for an entry with no usable box and guards non-positive dpr', () => {
  assert.equal(measuredSurfaceFromEntry({}, 1), null);
  const m = measuredSurfaceFromEntry({ contentRect: { width: 100, height: 100 } }, 0);
  assert.ok(m);
  assert.equal(m.dpr, 1); // dpr inválido normaliza para 1
});

test('equality guard treats same values as equal and null asymmetries as different', () => {
  const a = measuredSurfaceFromEntry({ contentRect: { width: 100, height: 50 } }, 2);
  const b = measuredSurfaceFromEntry({ contentRect: { width: 100, height: 50 } }, 2);
  const c = measuredSurfaceFromEntry({ contentRect: { width: 101, height: 50 } }, 2);
  assert.equal(measuredSurfaceEquals(a, b), true);
  assert.equal(measuredSurfaceEquals(a, c), false);
  assert.equal(measuredSurfaceEquals(a, null), false);
  assert.equal(measuredSurfaceEquals(null, null), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/services/measuredSurface.test.ts`
Expected: FAIL — `Cannot find module './measuredSurface'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/measuredSurface.ts
// Single source of truth for "how big is this box, really": parses a
// ResizeObserverEntry-shaped object into CSS px + device px. Prefers
// devicePixelContentBoxSize (exact physical pixels, Chromium) and falls back to
// contentBoxSize × dpr (Safari/iOS has no device-pixel box) then contentRect.
// Pure so node:test can cover it without a DOM.

export interface MeasuredSurface {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  devicePxWidth: number;
  devicePxHeight: number;
}

interface BoxSize { inlineSize: number; blockSize: number }

export interface SurfaceBoxEntry {
  devicePixelContentBoxSize?: ReadonlyArray<BoxSize>;
  contentBoxSize?: ReadonlyArray<BoxSize>;
  contentRect?: { width: number; height: number };
}

export function measuredSurfaceFromEntry(entry: SurfaceBoxEntry, dpr: number): MeasuredSurface | null {
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;

  const contentBox = entry.contentBoxSize?.[0];
  const cssWidth = contentBox ? contentBox.inlineSize : entry.contentRect?.width;
  const cssHeight = contentBox ? contentBox.blockSize : entry.contentRect?.height;
  if (cssWidth == null || cssHeight == null) return null;

  const deviceBox = entry.devicePixelContentBoxSize?.[0];
  return {
    cssWidth,
    cssHeight,
    dpr: safeDpr,
    devicePxWidth: deviceBox ? deviceBox.inlineSize : Math.round(cssWidth * safeDpr),
    devicePxHeight: deviceBox ? deviceBox.blockSize : Math.round(cssHeight * safeDpr),
  };
}

export function measuredSurfaceEquals(a: MeasuredSurface | null, b: MeasuredSurface | null): boolean {
  if (a === null || b === null) return a === b;
  return a.cssWidth === b.cssWidth
    && a.cssHeight === b.cssHeight
    && a.dpr === b.dpr
    && a.devicePxWidth === b.devicePxWidth
    && a.devicePxHeight === b.devicePxHeight;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/services/measuredSurface.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Full gate + commit**

Run: `npm run lint && npm run test`
Expected: tsc limpo; suíte inteira verde.

```bash
git add src/services/measuredSurface.ts src/services/measuredSurface.test.ts
git commit -m "$(cat <<'EOF'
feat: measuredSurface — parse puro de ResizeObserverEntry (css px + device px)

Primitiva única de medição para diagnóstico e exercício; prefere
devicePixelContentBoxSize (Chromium) com fallback contentBoxSize×dpr
(Safari/iOS) e contentRect (engines antigas).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Hook `useMeasuredSurface`

**Files:**
- Create: `src/hooks/useMeasuredSurface.ts` (diretório `src/hooks/` é novo)

**Interfaces:**
- Consumes: `measuredSurfaceFromEntry`, `measuredSurfaceEquals`, `MeasuredSurface` (Task 1).
- Produces (Task 4 depende):
  ```ts
  export function useMeasuredSurface<T extends HTMLElement>(): {
    ref: React.RefCallback<T>;
    surface: MeasuredSurface | null; // null até a primeira medição
  };
  ```
- Sem teste unitário próprio: não há jsdom no runner; toda a lógica de parsing/igualdade
  já está coberta na Task 1. O hook é só fiação de RO + setState. Gate = tsc.

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useMeasuredSurface.ts
import { useCallback, useRef, useState } from 'react';
import {
  measuredSurfaceFromEntry,
  measuredSurfaceEquals,
  type MeasuredSurface,
  type SurfaceBoxEntry,
} from '@/services/measuredSurface';

// Measures the element's real content box via ResizeObserver, so layout math can
// consume reality instead of predicting it from viewport-minus-constants. The
// equality guard keeps setState quiet on no-op callbacks (avoids RO feedback loops).
export function useMeasuredSurface<T extends HTMLElement>(): {
  ref: (el: T | null) => void;
  surface: MeasuredSurface | null;
} {
  const [surface, setSurface] = useState<MeasuredSurface | null>(null);
  const lastRef = useRef<MeasuredSurface | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[entries.length - 1] as unknown as SurfaceBoxEntry;
      const next = measuredSurfaceFromEntry(entry, window.devicePixelRatio || 1);
      if (next && !measuredSurfaceEquals(next, lastRef.current)) {
        lastRef.current = next;
        setSurface(next);
      }
    });
    // device-pixel-content-box is a Chromium-only observe option; Safari throws.
    try {
      observer.observe(el, { box: 'device-pixel-content-box' } as ResizeObserverOptions);
    } catch {
      observer.observe(el);
    }
    observerRef.current = observer;
  }, []);

  return { ref, surface };
}
```

- [ ] **Step 2: Gate + commit**

Run: `npm run lint && npm run test`
Expected: tsc limpo; suíte verde (nenhum teste novo).

```bash
git add src/hooks/useMeasuredSurface.ts
git commit -m "$(cat <<'EOF'
feat: useMeasuredSurface — hook fino de medição real de container

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `computeDiagnosticsSurface` passa a receber medidas reais

**Files:**
- Modify: `src/services/captureGeometry.ts`
- Test: `src/services/captureGeometry.test.ts` (reescrito)

**Interfaces:**
- Produces (Task 4 depende da assinatura NOVA):
  ```ts
  export interface DiagnosticsSurfaceInput {
    availableWidth: number;   // px CSS MEDIDOS do container que hospeda a superfície
    availableHeight: number;
    layoutMode: DiagnosticsLayoutMode;
  }
  export interface DiagnosticsSurface {
    mode: DiagnosticsLayoutMode;
    width: number;
    height: number;
  }
  ```
- REMOVIDOS: `viewportWidth/viewportHeight/panelWidth/headerHeight` (a subtração vira
  responsabilidade do flexbox real) e `left/top` do output (sem consumidores — verificado
  por grep em 2026-07-16; centralização é CSS `items-center justify-center`).

- [ ] **Step 1: Rewrite the test file (failing)**

Substituir TODO o conteúdo de `src/services/captureGeometry.test.ts` por:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDiagnosticsSurface } from './captureGeometry';

// Os casos históricos foram traduzidos: o que antes era viewport−panel−header
// agora chega como espaço MEDIDO (o flexbox já descontou painel, header, p-4 e
// safe-area — fonte do bug da caixa cortada no desktop portrait).

test('constrains wide desktop reading area without using the full measured box', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 1632, // ex-1920 menos painel+gutter, agora medido
    availableHeight: 1007,
    layoutMode: 'desktop',
  });
  assert.equal(surface.mode, 'desktop');
  assert.equal(surface.width <= 1180, true);
  assert.equal(surface.height <= 760, true);
  assert.equal(surface.width >= 720, true);
  assert.equal(surface.height >= 420, true);
});

test('shrinks to fit when the measured box is tighter than the desktop floor', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 704,  // dead band: menor que o floor de 720
    availableHeight: 827,
    layoutMode: 'desktop',
  });
  assert.equal(surface.mode, 'desktop');
  assert.equal(surface.width <= 704, true);
  assert.equal(surface.width > 0, true);
});

test('never exceeds a short measured height', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 944,
    availableHeight: 387,
    layoutMode: 'desktop',
  });
  assert.equal(surface.height <= 387, true);
  assert.equal(surface.width <= 944, true);
});

test('portrait desktop fills the measured column instead of forcing 16:9', () => {
  // Monitor vertical do caso real: 1077×1436 CSS de viewport → box medido menor.
  const surface = computeDiagnosticsSurface({
    availableWidth: 741,
    availableHeight: 1331,
    layoutMode: 'desktop',
  });
  assert.equal(surface.mode, 'desktop');
  assert.equal(surface.width, 741);
  assert.equal(surface.height > surface.width, true);
  assert.equal(surface.height <= 1331, true);
});

test('caps portrait desktop height at the portrait ceiling', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 764,
    availableHeight: 2127,
    layoutMode: 'desktop',
  });
  assert.equal(surface.height <= 1280, true);
});

test('keeps the landscape clamps when width dominates', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 1584,
    availableHeight: 1007,
    layoutMode: 'desktop',
  });
  assert.equal(surface.width <= 1180, true);
  assert.equal(surface.height <= 760, true);
});

test('compact/touch layout takes the full measured box', () => {
  const surface = computeDiagnosticsSurface({
    availableWidth: 932,
    availableHeight: 366,
    layoutMode: 'compact',
  });
  assert.equal(surface.mode, 'compact');
  assert.equal(surface.width, 932);
  assert.equal(surface.height, 366);
});

test('REGRESSION: surface never exceeds the measured box on any portrait geometry', () => {
  // Classe do bug original: a caixa computada excedia o espaço real e o CSS
  // cortava em silêncio. Com medidas reais isso é impossível por construção.
  for (const [w, h] of [[600, 900], [741, 1331], [800, 2400], [300, 500], [1080, 1920]]) {
    const s = computeDiagnosticsSurface({ availableWidth: w, availableHeight: h, layoutMode: 'desktop' });
    assert.equal(s.width <= w, true, `width ${s.width} > ${w}`);
    assert.equal(s.height <= h, true, `height ${s.height} > ${h}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/services/captureGeometry.test.ts`
Expected: FAIL — tipos/propriedades da assinatura antiga (`viewportWidth` obrigatório etc.).

- [ ] **Step 3: Rewrite the implementation**

Substituir TODO o conteúdo de `src/services/captureGeometry.ts` por:

```ts
import type { DiagnosticsLayoutMode } from './deviceProfile';

export interface DiagnosticsSurfaceInput {
  // MEASURED CSS px of the box that hosts the surface. The flexbox already
  // subtracted header, panel, paddings and safe-area — this module no longer
  // predicts space from viewport-minus-constants (that arithmetic silently
  // diverged from the real container and the CSS clipped the difference).
  availableWidth: number;
  availableHeight: number;
  layoutMode: DiagnosticsLayoutMode;
}

export interface DiagnosticsSurface {
  mode: DiagnosticsLayoutMode;
  width: number;
  height: number;
}

const DESKTOP_MIN_WIDTH = 720;
const DESKTOP_MAX_WIDTH = 1180;
const DESKTOP_MIN_HEIGHT = 420;
const DESKTOP_MAX_HEIGHT = 760;
// Portrait desktop (vertical monitor): the 16:9 aspect would squash the surface into
// a short strip, so the column fills the available height up to this ceiling instead.
const DESKTOP_MAX_HEIGHT_PORTRAIT = 1280;
const DESKTOP_TARGET_ASPECT = 16 / 9;

export function computeDiagnosticsSurface(input: DiagnosticsSurfaceInput): DiagnosticsSurface {
  const availableWidth = Math.max(0, input.availableWidth);
  const availableHeight = Math.max(0, input.availableHeight);

  if (input.layoutMode === 'compact') {
    return { mode: 'compact', width: availableWidth, height: availableHeight };
  }

  // The 720×420 floor is soft: when the measured box is tighter than the floor,
  // the surface shrinks to fit instead of overflowing.
  const minWidth = Math.min(DESKTOP_MIN_WIDTH, availableWidth);
  const minHeight = Math.min(DESKTOP_MIN_HEIGHT, availableHeight);
  const widthByBounds = clamp(availableWidth, minWidth, DESKTOP_MAX_WIDTH);

  // Portrait desktop: height is the abundant axis, so the aspect coupling is dropped
  // and the surface fills the column (more visible lines, less neck travel).
  if (availableWidth < availableHeight) {
    return {
      mode: 'desktop',
      width: Math.round(widthByBounds),
      height: Math.round(clamp(availableHeight, minHeight, DESKTOP_MAX_HEIGHT_PORTRAIT)),
    };
  }

  const heightFromAspect = widthByBounds / DESKTOP_TARGET_ASPECT;
  const height = clamp(Math.min(availableHeight, heightFromAspect), minHeight, DESKTOP_MAX_HEIGHT);
  const width = clamp(Math.min(widthByBounds, height * DESKTOP_TARGET_ASPECT), minWidth, DESKTOP_MAX_WIDTH);
  return { mode: 'desktop', width: Math.round(width), height: Math.round(height) };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return value;
  return Math.max(min, Math.min(max, value));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/services/captureGeometry.test.ts`
Expected: PASS (8 tests). `npm run lint` vai FALHAR agora (EyeTrackingTestScreen usa a assinatura antiga) — esperado; a Task 4 conserta. NÃO commitar ainda.

- [ ] **Step 5: Hold — commit acontece junto com a Task 4**

A mudança de assinatura e a integração são um único deliverable verificável (tsc só fecha com os dois). O subagente da Task 4 herda este diff.

---

### Task 4: Integrar medição real na tela de diagnóstico

**Files:**
- Modify: `src/screens/EyeTrackingTestScreen.tsx` (pontos: constantes ~`:69-71`, cálculo `~:745-766`, JSX `~:1082-1100`)

**Interfaces:**
- Consumes: `useMeasuredSurface` (Task 2), `computeDiagnosticsSurface` nova assinatura (Task 3).
- Produces: nada novo para outras tasks.

- [ ] **Step 1: Adicionar o host medido e trocar o cálculo**

1. Import: `import { useMeasuredSurface } from '@/hooks/useMeasuredSurface';`
2. Dentro do componente (perto dos outros hooks): `const { ref: surfaceHostRef, surface: measuredHost } = useMeasuredSurface<HTMLDivElement>();`
3. Substituir o bloco `diagnosticsSurface`/`readingSurfaceStyle` (hoje `~:752-766`) por:

```tsx
  const diagnosticsSurface = measuredHost
    ? computeDiagnosticsSurface({
      availableWidth: measuredHost.cssWidth,
      availableHeight: measuredHost.cssHeight,
      layoutMode: diagnosticsLayout,
    })
    : null;
  // Antes da primeira medição do RO (1 frame), deixa o CSS preencher; o estilo
  // dimensionado entra assim que a medida real existe — nunca maior que o host.
  const readingSurfaceStyle: React.CSSProperties | undefined =
    isDesktopDiagnosticsLayout && diagnosticsSurface
      ? { width: `${diagnosticsSurface.width}px`, height: `${diagnosticsSurface.height}px` }
      : undefined;
```

Nota: `maxWidth/maxHeight:'100%'` morrem de propósito — eram o curativo que cortava em silêncio. Se a superfície exceder o host agora, é bug e DEVE aparecer.

4. No JSX (`~:1082`), envolver a superfície num host `flex-1` que é quem o RO mede
   (o flexbox desconta painel/header/p-4/safe-area de verdade):

```tsx
      <div className={`flex-1 flex min-h-0 ${isDesktopDiagnosticsLayout ? 'flex-row justify-center gap-4 p-4' : isLandscape ? 'flex-row' : 'flex-col'}`}>
        <div ref={surfaceHostRef} className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
          <div
            className={`relative min-w-0 min-h-0 ${isDesktopDiagnosticsLayout ? 'shrink-0 overflow-hidden rounded-2xl border-2 border-indigo-300/70 bg-slate-900/30 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_24px_70px_rgba(15,23,42,0.45)]' : 'w-full h-full'}`}
            style={readingSurfaceStyle}
            aria-label="Área fixa de leitura, captura e calibração"
          >
            {/* conteúdo interno inalterado: canvas + moldura + badge */}
          </div>
        </div>
        {/* painel/accordion inalterados, irmãos do host */}
      </div>
```

Detalhes obrigatórios: o `self-center` antigo sai (o host centraliza); no modo compacto
a superfície vira `w-full h-full` do host `flex-1` (comportamento visual idêntico ao
`flex-1` antigo). O badge (`~:1098`) continua exibindo `diagnosticsSurface.width×height`
— agora coerente por construção (guard: badge só renderiza quando `diagnosticsSurface` existe).

5. Apagar `DIAGNOSTICS_HEADER_HEIGHT_PX` e `DIAGNOSTICS_DESKTOP_GUTTER_PX` (`:70-71`).
   Antes de apagar `DIAGNOSTICS_PANEL_WIDTH_PX` (`:69`), rodar
   `rg -n "DIAGNOSTICS_PANEL_WIDTH_PX|DIAGNOSTICS_HEADER_HEIGHT_PX|DIAGNOSTICS_DESKTOP_GUTTER_PX" src/`
   — apagar apenas os que ficarem sem consumidor; se o painel usar a constante na
   largura, ela fica.

- [ ] **Step 2: Full gate**

Run: `npm run lint && npm run test && npm run smoke`
Expected: tudo verde (o lint volta a fechar com a Task 3 + esta).

- [ ] **Step 3: Commit (inclui o diff da Task 3)**

```bash
git add src/services/captureGeometry.ts src/services/captureGeometry.test.ts src/screens/EyeTrackingTestScreen.tsx
git commit -m "$(cat <<'EOF'
fix: superfície de diagnóstico dimensionada por medição real do container

computeDiagnosticsSurface deixa de prever espaço com viewport−constantes
(header 73px etc.) e recebe o box medido por ResizeObserver; o p-4 e o
safe-area que o cálculo antigo ignorava eram a causa da caixa cortada em
silêncio no desktop portrait (badge ≠ caixa renderizada).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: DPR no ExerciseCanvas (texto nítido)

**Files:**
- Modify: `src/components/ExerciseCanvas.tsx` (`resize()` `~:94-99`, loop `~:158-165`, cleanup `~:259-263`)

**Interfaces:**
- Consumes: `measuredSurfaceFromEntry`, `measuredSurfaceEquals`, `MeasuredSurface` (Task 1) — RO imperativo direto, SEM o hook React (o canvas é gerido imperativamente dentro do useEffect; hook aqui causaria re-run do effect inteiro a cada resize).
- Produces: contrato para exercícios INALTERADO — `exContext.width/height` seguem em px CSS; o escalonamento físico é todo via `ctx.setTransform`.

- [ ] **Step 1: Substituir o resize por RO + backing store com DPR**

1. Import: `import { measuredSurfaceFromEntry, measuredSurfaceEquals, type MeasuredSurface } from '@/services/measuredSurface';`
2. Substituir o bloco `resize` (`~:94-99`) por:

```ts
      // Real-space sizing: the backing store follows the parent's measured box at
      // device-pixel resolution (crisp text at any DPR), while exercises keep
      // drawing in CSS px via the ctx transform below. Replaces the old CSS-px
      // resize listener (which also leaked: it was never removed on cleanup).
      const parent = canvas.parentElement!;
      const initialDpr = window.devicePixelRatio || 1;
      let surface: MeasuredSurface = {
        cssWidth: parent.clientWidth || window.innerWidth,
        cssHeight: parent.clientHeight || window.innerHeight,
        dpr: initialDpr,
        devicePxWidth: Math.round((parent.clientWidth || window.innerWidth) * initialDpr),
        devicePxHeight: Math.round((parent.clientHeight || window.innerHeight) * initialDpr),
      };
      const applySurface = (m: MeasuredSurface) => {
        surface = m;
        canvas.width = m.devicePxWidth;
        canvas.height = m.devicePxHeight;
        canvas.style.width = `${m.cssWidth}px`;
        canvas.style.height = `${m.cssHeight}px`;
      };
      applySurface(surface);
      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(entries => {
          const next = measuredSurfaceFromEntry(entries[entries.length - 1], window.devicePixelRatio || 1);
          if (next && !measuredSurfaceEquals(next, surface)) applySurface(next);
        });
        try {
          resizeObserver.observe(parent, { box: 'device-pixel-content-box' } as ResizeObserverOptions);
        } catch {
          resizeObserver.observe(parent);
        }
      }
```

3. No loop (`~:164-165`), trocar `exContext.width = canvas.width; exContext.height = canvas.height;` por:

```ts
        exContext.width = surface.cssWidth;
        exContext.height = surface.cssHeight;
        ctx.setTransform(surface.dpr, 0, 0, surface.dpr, 0, 0); // exercises draw in CSS px
```

4. No cleanup do useEffect (`~:259-263`), acrescentar `resizeObserver?.disconnect();`
   (e remover o `window.addEventListener('resize', resize)` antigo junto com `resize`).
5. Atualizar o comentário `NOTE` (`~:28-31` e `~:104-105`): o canvas agora É escalado
   por DPR; `PX_PER_CM` segue em CSS px (correto, pois o transform absorve o DPR).

- [ ] **Step 2: Full gate**

Run: `npm run lint && npm run test && npm run smoke`
Expected: tudo verde. (Exercícios desenham via exContext.width/height em CSS px — contrato preservado; `handlePointerDown` já era CSS-relativo via getBoundingClientRect.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ExerciseCanvas.tsx
git commit -m "$(cat <<'EOF'
fix: ExerciseCanvas com backing store em device px (texto nítido em DPR>1)

RO no container substitui o resize listener (que vazava no cleanup);
exercícios seguem desenhando em CSS px via ctx.setTransform(dpr).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**GATE DE BUNDLE L1 (Anders):** monitor vertical — badge == caixa (sem corte silencioso); texto do exercício nítido; iPhone sem regressão no modo compacto. Só então iniciar L2.

---

# BUNDLE L2 — Estímulo congelado + drift

**Critério verificável do BUNDLE:** resultado do exercício carrega `stimulusGeometry` (`distanceSource`, stats de drift); anel âmbar acende ao afastar-se de propósito e apaga ao voltar; suíte + smoke verdes.

---

### Task 6: Serviço puro `stimulusDistance`

**Files:**
- Create: `src/services/stimulusDistance.ts`
- Test: `src/services/stimulusDistance.test.ts`

**Interfaces:**
- Consumes: `DISTANCE_DRIFT_TOLERANCE` de `@/services/viewingGeometry` (0.15 — NÃO duplicar a constante); `clampViewingDistanceCm` de `@/services/viewingDistance`.
- Produces (Task 7 depende EXATAMENTE destes nomes):
  ```ts
  export interface StimulusDistanceSnapshot {
    phase: 'stabilizing' | 'frozen';
    distanceCm: number;                    // distância efetiva do estímulo (perfil até congelar)
    frozenDistanceCm: number | null;
    distanceSource: 'measured' | 'profile' | null; // null enquanto stabilizing
    inDrift: boolean;
    maxDeviationPct: number;               // 0–100, pico de |ema−frozen|/frozen
    driftTimePct: number;                  // 0–100, % do tempo pós-freeze em drift
  }
  export function createStimulusDistanceTracker(opts: {
    profileDistanceCm: number;
    emaAlpha?: number;            // default 0.15
    convergenceWindowMs?: number; // default 1000
    convergenceSpanPct?: number;  // default 0.05
    freezeTimeoutMs?: number;     // default 3000
    driftEnterPct?: number;       // default DISTANCE_DRIFT_TOLERANCE (0.15)
    driftExitPct?: number;        // default 0.12
  }): {
    update(sampleCm: number | null, tMs: number): StimulusDistanceSnapshot;
    snapshot(): StimulusDistanceSnapshot;
  };
  ```

Semântica (do spec, pinada):
- `update(sample, t)`: sample válido alimenta EMA (α=0.15). Janela deslizante de valores
  de EMA por 1000ms; quando a janela cobre ≥1000ms e `(max−min)/min ≤ 0.05` → congela na
  EMA corrente, `distanceSource:'measured'`.
- Timeout: se `t − t0 ≥ 3000` sem congelar → congela na EMA se ela existir
  (`'measured'`), senão no perfil (`'profile'`). Nunca fica `stabilizing` além do timeout.
- Pós-freeze: EMA continua; `dev = |ema − frozen|/frozen`. Histerese: `inDrift` liga com
  `dev > 0.15`, desliga com `dev < 0.12`. `driftTimePct` = tempo com inDrift ÷ tempo
  desde o freeze; `maxDeviationPct` = pico de `dev×100`. `update(null, t)` pós-freeze só
  avança o relógio (mantém estado de drift corrente).
- `distanceCm` = frozen se congelado, senão `clampViewingDistanceCm(profileDistanceCm)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/services/stimulusDistance.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStimulusDistanceTracker } from './stimulusDistance';

test('freezes at the measured EMA once stable for the convergence window', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  let snap = tracker.snapshot();
  for (let t = 0; t <= 1200; t += 100) snap = tracker.update(55, t);
  assert.equal(snap.phase, 'frozen');
  assert.equal(snap.distanceSource, 'measured');
  assert.ok(Math.abs(snap.frozenDistanceCm! - 55) < 1);
  assert.equal(snap.distanceCm, snap.frozenDistanceCm);
});

test('uses the profile distance while stabilizing (no font jump before freeze)', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  const snap = tracker.update(60, 0);
  assert.equal(snap.phase, 'stabilizing');
  assert.equal(snap.distanceCm, 40);
  assert.equal(snap.distanceSource, null);
});

test('falls back to profile at the timeout when no face was ever measured', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 45 });
  tracker.update(null, 0);
  const snap = tracker.update(null, 3000);
  assert.equal(snap.phase, 'frozen');
  assert.equal(snap.distanceSource, 'profile');
  assert.equal(snap.frozenDistanceCm, 45);
});

test('freezes at the EMA at timeout when samples exist but never converged', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  // Rampa monotônica: a EMA sobe continuamente, o span da janela nunca fecha ≤5%,
  // então o freeze só pode vir do timeout de 3s (determinístico, sem depender da
  // atenuação da EMA sobre oscilações).
  let snap = tracker.snapshot();
  for (let t = 0; t <= 3000; t += 100) snap = tracker.update(40 + t / 50, t);
  assert.equal(snap.phase, 'frozen');
  assert.equal(snap.distanceSource, 'measured');
});

test('drift hysteresis: enters above 15%, stays between 12-15%, exits below 12%', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  let t = 0;
  for (; t <= 1200; t += 100) tracker.update(50, t);       // congela ~50
  let snap = tracker.snapshot();
  assert.equal(snap.phase, 'frozen');

  for (; t <= 5000; t += 100) snap = tracker.update(60, t); // 20% além → drift
  assert.equal(snap.inDrift, true);

  for (; t <= 9000; t += 100) snap = tracker.update(56.5, t); // ~13%: dentro da banda, mantém
  assert.equal(snap.inDrift, true);

  for (; t <= 13000; t += 100) snap = tracker.update(52, t); // 4% → sai do drift
  assert.equal(snap.inDrift, false);
});

test('accumulates max deviation and % of time in drift after freeze', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  let t = 0;
  for (; t <= 1200; t += 100) tracker.update(50, t);
  for (; t <= 4000; t += 100) tracker.update(65, t);        // fase em drift
  for (; t <= 8000; t += 100) tracker.update(50, t);        // volta
  const snap = tracker.snapshot();
  assert.ok(snap.maxDeviationPct >= 15, `max ${snap.maxDeviationPct}`);
  assert.ok(snap.driftTimePct > 0 && snap.driftTimePct < 100, `pct ${snap.driftTimePct}`);
});

test('frozen distance never changes after freezing (stimulus constancy contract)', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  let t = 0;
  for (; t <= 1200; t += 100) tracker.update(50, t);
  const frozen = tracker.snapshot().frozenDistanceCm;
  for (; t <= 6000; t += 100) tracker.update(90, t);
  assert.equal(tracker.snapshot().frozenDistanceCm, frozen);
  assert.equal(tracker.snapshot().distanceCm, frozen);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/services/stimulusDistance.test.ts`
Expected: FAIL — `Cannot find module './stimulusDistance'`

- [ ] **Step 3: Write the implementation**

```ts
// src/services/stimulusDistance.ts
// Stimulus-distance policy for the exercise player: measure the live viewing
// distance at exercise start, FREEZE it (constant stimulus ⇒ comparable metrics),
// then only OBSERVE drift — never resize the text mid-task. Drift compares the
// smoothed EMA (not raw frames): clinical drift is the patient migrating, not
// 200ms tracking jitter; the ~1s lag on the live warning is accepted by design.
import { DISTANCE_DRIFT_TOLERANCE } from './viewingGeometry';
import { clampViewingDistanceCm } from './viewingDistance';

export interface StimulusDistanceSnapshot {
  phase: 'stabilizing' | 'frozen';
  distanceCm: number;
  frozenDistanceCm: number | null;
  distanceSource: 'measured' | 'profile' | null;
  inDrift: boolean;
  maxDeviationPct: number;
  driftTimePct: number;
}

export interface StimulusDistanceOptions {
  profileDistanceCm: number;
  emaAlpha?: number;
  convergenceWindowMs?: number;
  convergenceSpanPct?: number;
  freezeTimeoutMs?: number;
  driftEnterPct?: number;
  driftExitPct?: number;
}

export function createStimulusDistanceTracker(opts: StimulusDistanceOptions) {
  const alpha = opts.emaAlpha ?? 0.15;
  const windowMs = opts.convergenceWindowMs ?? 1000;
  const spanPct = opts.convergenceSpanPct ?? 0.05;
  const timeoutMs = opts.freezeTimeoutMs ?? 3000;
  const enterPct = opts.driftEnterPct ?? DISTANCE_DRIFT_TOLERANCE;
  const exitPct = opts.driftExitPct ?? 0.12;
  const profileCm = clampViewingDistanceCm(opts.profileDistanceCm);

  let ema: number | null = null;
  let startT: number | null = null;
  let emaWindow: { t: number; v: number }[] = [];
  let frozen: number | null = null;
  let source: 'measured' | 'profile' | null = null;
  let frozenAtT = 0;
  let inDrift = false;
  let maxDeviationPct = 0;
  let driftMs = 0;
  let lastT: number | null = null;

  const freeze = (value: number, from: 'measured' | 'profile', t: number) => {
    frozen = clampViewingDistanceCm(value);
    source = from;
    frozenAtT = t;
    lastT = t;
    emaWindow = [];
  };

  const snapshot = (): StimulusDistanceSnapshot => ({
    phase: frozen != null ? 'frozen' : 'stabilizing',
    distanceCm: frozen ?? profileCm,
    frozenDistanceCm: frozen,
    distanceSource: source,
    inDrift,
    maxDeviationPct,
    driftTimePct: frozen != null && lastT != null && lastT > frozenAtT
      ? (driftMs / (lastT - frozenAtT)) * 100
      : 0,
  });

  const update = (sampleCm: number | null, tMs: number): StimulusDistanceSnapshot => {
    if (startT == null) startT = tMs;
    const validSample = sampleCm != null && Number.isFinite(sampleCm) && sampleCm > 0;
    if (validSample) ema = ema == null ? sampleCm! : ema * (1 - alpha) + sampleCm! * alpha;

    if (frozen == null) {
      if (ema != null) {
        emaWindow.push({ t: tMs, v: ema });
        while (emaWindow.length && tMs - emaWindow[0].t > windowMs) emaWindow.shift();
        const covered = emaWindow.length > 1 && tMs - emaWindow[0].t >= windowMs * 0.999;
        if (covered) {
          const vs = emaWindow.map(w => w.v);
          const min = Math.min(...vs);
          const max = Math.max(...vs);
          if (min > 0 && (max - min) / min <= spanPct) freeze(ema, 'measured', tMs);
        }
      }
      if (frozen == null && tMs - startT >= timeoutMs) {
        if (ema != null) freeze(ema, 'measured', tMs);
        else freeze(profileCm, 'profile', tMs);
      }
      if (frozen == null) return snapshot();
    }

    // Post-freeze: observe drift on the smoothed estimate.
    if (lastT != null && tMs > lastT && inDrift) driftMs += tMs - lastT;
    lastT = tMs;
    if (ema != null && frozen! > 0) {
      const dev = Math.abs(ema - frozen!) / frozen!;
      maxDeviationPct = Math.max(maxDeviationPct, dev * 100);
      if (!inDrift && dev > enterPct) inDrift = true;
      else if (inDrift && dev < exitPct) inDrift = false;
    }
    return snapshot();
  };

  return { update, snapshot };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/services/stimulusDistance.test.ts`
Expected: PASS (7 tests). Se o teste de histerese falhar por acumulação do driftMs
antes/depois do flip, a ordem correta é: acumular driftMs com o estado ANTERIOR ao
flip (como no código acima) — corrigir o teste nunca; corrigir a implementação.

- [ ] **Step 5: Full gate + commit**

Run: `npm run lint && npm run test`

```bash
git add src/services/stimulusDistance.ts src/services/stimulusDistance.test.ts
git commit -m "$(cat <<'EOF'
feat: stimulusDistance — congela distância do estímulo e observa drift

Freeze por EMA convergida (5%/1s, timeout 3s → perfil) e drift com
histerese 15%/12% reusando DISTANCE_DRIFT_TOLERANCE; estímulo constante
com honestidade geométrica (stats por captura).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Integrar o tracker no ExerciseCanvas

**Files:**
- Modify: `src/components/ExerciseCanvas.tsx` (EMA `~:62-64`, degToPx `~:104-111`, loop `~:188-199`, finishExercise `~:129-148`)

**Interfaces:**
- Consumes: `createStimulusDistanceTracker`, `StimulusDistanceSnapshot` (Task 6).
- Produces (Task 8 depende): estado React `stimulusDrift: boolean` no componente;
  `extraData.stimulusGeometry: StimulusDistanceSnapshot` no `onFinish`.

- [ ] **Step 1: Substituir a EMA manual pelo tracker**

1. Import: `import { createStimulusDistanceTracker, type StimulusDistanceSnapshot } from '@/services/stimulusDistance';`
2. Novo estado (junto de `headStable`): `const [stimulusDrift, setStimulusDrift] = useState(false);`
3. No topo do useEffect, substituir `let emaDistanceCm = viewingDistanceCm;` (`~:64`) por:

```ts
    // Stimulus geometry: freeze the live distance at start, then only observe drift.
    // Absolute distance needs the calibration anchor (IPD→cm is relative to it);
    // without an anchor the sample is null and the tracker falls back to the profile.
    const stimulusTracker = createStimulusDistanceTracker({ profileDistanceCm: viewingDistanceCm });
    let stimulusSnap: StimulusDistanceSnapshot = stimulusTracker.snapshot();
```

4. `degToPx` (`~:108-111`) passa a ler a distância efetiva do tracker:

```ts
      // Visual angle -> screen size at the FROZEN stimulus distance (profile until
      // the tracker freezes; a single early adjustment ≤3s in is the accepted cost).
      const degToPx = (deg: number) => {
        const sizeCm = 2 * stimulusSnap.distanceCm * Math.tan((deg * Math.PI / 180) / 2);
        return sizeCm * pxPerCm;
      };
```

5. No loop, dentro do branch de frame processado, substituir as duas linhas da EMA
   (`~:193-195`: `const dEst...`, `emaDistanceCm = ...`) por:

```ts
           const dEst = estimateDistanceCm(ipdPx, anchor, viewingDistanceCm);
           stimulusSnap = stimulusTracker.update(anchor && ipdPx != null ? dEst : null, exContext.timeMs);
           if (stimulusSnap.inDrift !== stimulusDriftRef.current) {
             stimulusDriftRef.current = stimulusSnap.inDrift;
             setStimulusDrift(stimulusSnap.inDrift);
           }
           const distanceOk = distanceWithinAnchorTolerance(dEst, anchor?.distanceCm ?? null);
```

   E no branch `else` (sem frame processado / câmera off), acrescentar antes de zerar o gaze:

```ts
           stimulusSnap = stimulusTracker.update(null, exContext.timeMs);
```

   Declarar junto aos outros refs do componente: `const stimulusDriftRef = useRef(false);`
   Nota: o gate de calibração (`distanceOk`) usa `dEst` direto — a suavização agora vive
   no tracker; NÃO reintroduzir uma segunda EMA paralela.

6. Em `finishExercise` (`~:139-147`), anexar a geometria ao lado de `posturalStability`:

```ts
           onFinish(score, stillnessScore, { ...(extraData || {}), posturalStability, stimulusGeometry: stimulusTracker.snapshot() });
```

- [ ] **Step 2: Full gate**

Run: `npm run lint && npm run test && npm run smoke`
Expected: tudo verde.

- [ ] **Step 3: Commit**

```bash
git add src/components/ExerciseCanvas.tsx
git commit -m "$(cat <<'EOF'
feat: exercício com distância congelada por medição viva + stats de drift

degToPx usa a distância do stimulusDistance (perfil como fallback sem
anchor/rosto); resultado do exercício carrega stimulusGeometry.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Anel âmbar de drift (aviso discreto ao vivo)

**Files:**
- Modify: `src/components/ExerciseCanvas.tsx` (container JSX `~:280`)

**Interfaces:**
- Consumes: estado `stimulusDrift` (Task 7).
- Produces: nada — folha de UI.

- [ ] **Step 1: Ring no container do canvas**

Substituir a abertura do container (`~:280`) por:

```tsx
    <div className={`relative w-full h-full bg-slate-900 overflow-hidden flex items-center justify-center transition-shadow duration-500 ${stimulusDrift ? 'ring-4 ring-inset ring-amber-400/70' : ''}`}>
```

Sem texto, sem popup — só a borda muda, conforme decisão do spec (aviso discreto que
não interrompe o paciente; o clínico acompanhando enxerga).

- [ ] **Step 2: Full gate + commit**

Run: `npm run lint && npm run test && npm run smoke`

```bash
git add src/components/ExerciseCanvas.tsx
git commit -m "$(cat <<'EOF'
feat: anel âmbar discreto durante drift de distância no exercício

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**GATE DE BUNDLE L2 (Anders):** rodar um exercício, afastar-se de propósito → anel
âmbar acende e apaga ao voltar; resultado carrega `stimulusGeometry` com
`distanceSource` e stats. Validação física: monitor vertical + iPhone.

---

## Fora do plano (notas de PACK, não implementar)

- Premissa 96dpi × dpr real (limite documentado, aviso já existe na UI).
- `fullViewportRect` × `rectFromElement` no ExerciseCanvas (só diverge se o canvas
  deixar de ser fullscreen).
- FPS: cap confirmado como negociação da webcam (H1) — sem mudança de código.

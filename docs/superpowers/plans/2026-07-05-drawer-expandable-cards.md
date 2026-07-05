# D2 — Expandable Cards na Gaveta de Diagnóstico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No painel expandido da gaveta mobile, empilhar os cards de diagnóstico como acordeão (um aberto por vez) com resumo vivo de 1 linha no cabeçalho — desktop pixel-idêntico a hoje.

**Architecture:** As seções viram dados (`DiagnosticsSection[]`) construídos no `EyeTrackingTestScreen` a partir dos mesmos JSX de hoje, extraídos em consts. O desktop recompõe esses consts verbatim (zero mudança visual); a gaveta mobile passa a lista pro componente novo `DiagnosticsAccordion`, que guarda `useState<SectionId | null>` e delega a alternância à função pura `toggleSection` (testável em node:test). Tudo acontece dentro do painel overlay do D1 — o `surfaceRect` do canvas nunca se move.

**Tech Stack:** React 19 **sem @types/react** (props com `key` precisam declarar `key?: React.Key`), Tailwind, lucide-react, node:test via tsx, Playwright smoke (`scripts/smoke-layout.mjs`).

**Spec:** `docs/superpowers/specs/2026-07-05-drawer-expandable-cards-design.md`

## Global Constraints

- Desktop (`isDesktopDiagnosticsLayout`) permanece **pixel-idêntico** — o `<aside>` recompõe os mesmos nós na mesma ordem (metrics → signal → `<details>` interpret → conditions).
- Ordem no acordeão mobile (spec §2): Métricas → Captação → Condição → Como interpretar. Switch de modo, aviso de captura, "Capturas salvas" e "Parar câmera" ficam **fora** do acordeão, abaixo dele.
- Conteúdo dos cards **sem alteração interna** (spec: "o card atual, sem alteração interna").
- Invariante D1 preservada: painel é overlay; canvas rect estável durante qualquer toque no acordeão (vigiado pelo smoke).
- **NUNCA** tocar `saccadeAnalysis.ts`. **NÃO** usar vitest — testes rodam com `node --import tsx --test`. **NÃO** ler `/etc/linhafixa.env`.
- Deploy (build com `APP_BASE_PATH=/gaze` + `systemctl restart linhafixa.service`) só com aval explícito de Anders.
- Commits com footer `Co-Authored-By: Claude <noreply@anthropic.com>` via HEREDOC.

---

### Task 1: Helper puro `toggleSection`

**Files:**
- Create: `src/services/diagnosticsAccordion.ts`
- Test: `src/services/diagnosticsAccordion.test.ts`

**Interfaces:**
- Produces: `type SectionId = 'metrics' | 'signal' | 'conditions' | 'interpret'` e `toggleSection(current: SectionId | null, id: SectionId): SectionId | null` — consumidos pela Task 2.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/services/diagnosticsAccordion.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleSection } from './diagnosticsAccordion';

test('abre seção a partir de tudo fechado', () => {
  assert.equal(toggleSection(null, 'metrics'), 'metrics');
});

test('abrir outra seção fecha a anterior (um aberto por vez)', () => {
  assert.equal(toggleSection('metrics', 'signal'), 'signal');
});

test('tocar na seção aberta fecha tudo', () => {
  assert.equal(toggleSection('signal', 'signal'), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --import tsx --test src/services/diagnosticsAccordion.test.ts`
Expected: FAIL — `Cannot find module './diagnosticsAccordion'`

- [ ] **Step 3: Implementação mínima**

```ts
// src/services/diagnosticsAccordion.ts
// Alternância do acordeão da gaveta de diagnóstico (mobile): um card aberto
// por vez; tocar no card aberto fecha tudo.
export type SectionId = 'metrics' | 'signal' | 'conditions' | 'interpret';

export function toggleSection(current: SectionId | null, id: SectionId): SectionId | null {
  return current === id ? null : id;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --import tsx --test src/services/diagnosticsAccordion.test.ts`
Expected: PASS — 3/3

- [ ] **Step 5: Commit**

```bash
git add src/services/diagnosticsAccordion.ts src/services/diagnosticsAccordion.test.ts
git commit -m "$(cat <<'EOF'
feat: alternância pura do acordeão de diagnóstico (um aberto por vez)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Componente `DiagnosticsAccordion`

**Files:**
- Create: `src/components/DiagnosticsAccordion.tsx`

**Interfaces:**
- Consumes: `toggleSection`, `SectionId` (Task 1).
- Produces: `interface DiagnosticsSection { id: SectionId; title: string; summary?: string; content: React.ReactNode }` e `DiagnosticsAccordion({ sections })` — consumidos pela Task 3. Cabeçalhos com `data-testid="accordion-<id>"` e `aria-expanded` — consumidos pelo smoke (Task 4).

Sem infra de teste de componente no projeto (padrão do D1): a lógica está coberta pela Task 1, a renderização pelo smoke da Task 4. Gate desta task é o tsc.

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/DiagnosticsAccordion.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toggleSection, type SectionId } from '@/services/diagnosticsAccordion';

export interface DiagnosticsSection {
  id: SectionId;
  title: string;
  /** Resumo vivo de 1 linha derivado de estado existente (fps, sinal, condição). */
  summary?: string;
  /** O card atual, sem alteração interna. */
  content: React.ReactNode;
}

// Acordeão da gaveta mobile: estado local, inicial fechado. Como o painel da
// gaveta só renderiza expandido (drawerLayout.panelOpen), o estado reseta
// sozinho a cada abertura — sem effect nem persistência. O resumo vivo no
// cabeçalho deixa a gaveta escaneável sem abrir card nenhum.
export function DiagnosticsAccordion({ sections }: { sections: DiagnosticsSection[] }) {
  const [open, setOpen] = useState<SectionId | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {sections.map(s => {
        const isOpen = open === s.id;
        const Chevron = isOpen ? ChevronDown : ChevronRight;
        return (
          <div key={s.id} className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
            <button
              onClick={() => setOpen(cur => toggleSection(cur, s.id))}
              aria-expanded={isOpen}
              data-testid={`accordion-${s.id}`}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5"
            >
              <Chevron className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="text-sm font-bold text-slate-200 shrink-0">{s.title}</span>
              {s.summary && (
                <span className="ml-auto min-w-0 truncate text-xs text-slate-400">{s.summary}</span>
              )}
            </button>
            {isOpen && <div className="px-2 pb-2">{s.content}</div>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Gate de tipos**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/components/DiagnosticsAccordion.tsx
git commit -m "$(cat <<'EOF'
feat: DiagnosticsAccordion — cards colapsáveis com resumo vivo no cabeçalho

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Seções como dados no `EyeTrackingTestScreen`

**Files:**
- Modify: `src/screens/EyeTrackingTestScreen.tsx` (região `diagnosticsCards`, hoje `:850-952`; children da `DiagnosticsDrawer`, hoje `:1181`; imports `:23`)

**Interfaces:**
- Consumes: `DiagnosticsAccordion`, `DiagnosticsSection` (Task 2).
- Produces: `data-testid="accordion-metrics"` etc. renderizados na gaveta — consumidos pelo smoke (Task 4). Desktop `<aside>` continua consumindo `diagnosticsCards` sem mudança.

- [ ] **Step 1: Adicionar import**

Junto ao import da DiagnosticsDrawer (`:23`):

```tsx
import { DiagnosticsAccordion, type DiagnosticsSection } from '@/components/DiagnosticsAccordion';
```

- [ ] **Step 2: Extrair opções de condição pra módulo**

As tuplas hoje inline nos botões (`:919` e `:931`) sobem pra módulo (logo após os imports), porque o resumo vivo do card Condição precisa do mesmo rótulo:

```tsx
// Opções de condição compartilhadas entre os botões do card e o resumo do acordeão.
const LIGHTING_OPTIONS: [ValidationLighting, string][] = [['dim', 'Fraca'], ['normal', 'Normal'], ['bright', 'Forte']];
const POSTURE_OPTIONS: [ValidationPosture, string][] = [['upright', 'Reta'], ['tilted', 'Inclinada'], ['slouched', 'Curvada'], ['reclined', 'Recostada']];
const optionLabel = <T extends string>(options: [T, string][], value: T) =>
  options.find(([v]) => v === value)?.[1] ?? value;
```

Nos dois `.map(...)` dentro do card Condição, substituir a tupla inline por `LIGHTING_OPTIONS.map(...)` e `POSTURE_OPTIONS.map(...)` — o corpo do map fica idêntico.

- [ ] **Step 3: Quebrar `diagnosticsCards` em consts nomeados**

A região `:850-952` vira quatro consts + a recomposição desktop + a lista de seções. Conteúdo interno dos cards **verbatim** (só mostrado resumido aqui onde é cópia literal do que já existe — na edição real, mover as linhas sem alterá-las):

```tsx
  // Cards de diagnóstico como dados: o desktop recompõe verbatim (pixel igual),
  // a gaveta mobile empilha como acordeão com resumo vivo no cabeçalho.
  const metricsGrid = (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {/* ...as 8 <Metric .../> de hoje (:853-860), verbatim... */}
    </div>
  );

  const signalCard = (
    <div className="rounded-xl bg-slate-900/60 border border-white/10 p-3">
      {/* ...conteúdo de hoje (:864-887), verbatim... */}
    </div>
  );

  // Corpo compartilhado: no desktop dentro do <details>, no mobile como card do acordeão.
  const interpretBody = (
    <>
      {/* ...conteúdo do div.mt-2 de hoje (:895-909), verbatim, incluindo o bloco
          {isDesktopDiagnosticsLayout && ...} da escala... */}
    </>
  );

  const conditionsCard = (
    <div className="rounded-xl bg-slate-900/50 border border-white/10 p-3 flex flex-col gap-3">
      {/* ...conteúdo de hoje (:915-949), verbatim (com os maps da Step 2)... */}
    </div>
  );

  // Miolo de diagnóstico do <aside> desktop — mesma composição e ordem de hoje.
  const diagnosticsCards = (
    <>
      {metricsGrid}
      {signalCard}
      <details className="rounded-xl bg-slate-900/40 border border-white/10 px-3 py-2 text-xs text-slate-400">
        <summary className="cursor-pointer select-none font-bold text-slate-300">
          Como interpretar os indicadores
        </summary>
        <div className="mt-2">{interpretBody}</div>
      </details>
      {conditionsCard}
    </>
  );

  // Resumos derivam de estado que já existe — nenhum buffer ou cálculo novo.
  const diagnosticsSections: DiagnosticsSection[] = [
    { id: 'metrics', title: 'Métricas', summary: `${live.fps ? `${live.fps}fps` : '—'} · H ${fmt(live.h)}`, content: metricsGrid },
    { id: 'signal', title: 'Captação', summary: `${liveSignal.sensitivityScore}% · ${liveSignal.sourceLabel}`, content: signalCard },
    { id: 'conditions', title: 'Condição', summary: `${optionLabel(LIGHTING_OPTIONS, conditions.lighting)} · ${optionLabel(POSTURE_OPTIONS, conditions.posture)}`, content: conditionsCard },
    { id: 'interpret', title: 'Como interpretar', content: <div className="text-xs text-slate-400 px-1">{interpretBody}</div> },
  ];
```

- [ ] **Step 4: Trocar o miolo da gaveta pelo acordeão**

Nos children da `DiagnosticsDrawer` (`:1181`), substituir `{diagnosticsCards}` por:

```tsx
          <DiagnosticsAccordion sections={diagnosticsSections} />
```

`{modeSwitch}`, aviso de captura, `{capturesButton}` e `{stopCameraButton}` seguem logo abaixo, fora do acordeão — sem mudança. O branch desktop (`:1134`) continua `{diagnosticsCards}` — sem mudança.

- [ ] **Step 5: Gates**

Run: `npx tsc --noEmit && node --import tsx --test src/services/*.test.ts src/exercises/*.test.ts`
Expected: tsc limpo; 133/133 testes PASS (130 atuais + 3 da Task 1)

Run: `npm run build`
Expected: build OK (sem `APP_BASE_PATH` aqui — build de gate, não de deploy)

- [ ] **Step 6: Commit**

```bash
git add src/screens/EyeTrackingTestScreen.tsx
git commit -m "$(cat <<'EOF'
feat: gaveta mobile empilha diagnóstico como acordeão com resumo vivo

Desktop recompõe os mesmos cards verbatim; seções viram dados
(DiagnosticsSection[]) e só a gaveta usa o DiagnosticsAccordion.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Smoke — acordeão exclusivo + canvas estável

**Files:**
- Modify: `scripts/smoke-layout.mjs` (dentro do bloco `if (profile.drawer)`, entre o check "cartões da gaveta alinhados" e o recolhimento `:193`)

**Interfaces:**
- Consumes: `data-testid="accordion-metrics"` / `"accordion-signal"` com `aria-expanded` (Task 2); variável `canvasBefore` já existente no bloco (`:165`).

- [ ] **Step 1: Inserir os checks do acordeão**

Logo após o check `'cartões da gaveta alinhados'` e antes do click em "Recolher diagnóstico":

```js
      // --- Acordeão (D2): um card aberto por vez; toques não movem a superfície ---
      const metricsHeader = page.getByTestId('accordion-metrics');
      const signalHeader = page.getByTestId('accordion-signal');
      check(profile.name, 'acordeão começa todo colapsado',
        await metricsHeader.getAttribute('aria-expanded') === 'false' &&
        await signalHeader.getAttribute('aria-expanded') === 'false');

      await metricsHeader.click();
      check(profile.name, 'toque abre só o card tocado',
        await metricsHeader.getAttribute('aria-expanded') === 'true' &&
        await signalHeader.getAttribute('aria-expanded') === 'false');

      await signalHeader.click();
      check(profile.name, 'abrir outro card fecha o anterior',
        await signalHeader.getAttribute('aria-expanded') === 'true' &&
        await metricsHeader.getAttribute('aria-expanded') === 'false');

      await signalHeader.click();
      check(profile.name, 'tocar no card aberto fecha tudo',
        await signalHeader.getAttribute('aria-expanded') === 'false' &&
        await metricsHeader.getAttribute('aria-expanded') === 'false');

      const canvasAfterAccordion = await page.locator('canvas').first().boundingBox();
      const accordionStable = !!(canvasBefore && canvasAfterAccordion &&
        Math.abs(canvasBefore.x - canvasAfterAccordion.x) <= 1 &&
        Math.abs(canvasBefore.y - canvasAfterAccordion.y) <= 1 &&
        Math.abs(canvasBefore.width - canvasAfterAccordion.width) <= 1 &&
        Math.abs(canvasBefore.height - canvasAfterAccordion.height) <= 1);
      check(profile.name, 'superfície estável durante toques no acordeão', accordionStable,
        canvasAfterAccordion ? `${Math.round(canvasAfterAccordion.width)}×${Math.round(canvasAfterAccordion.height)}` : 'geometria indisponível');
```

- [ ] **Step 2: Commit**

```bash
git add scripts/smoke-layout.mjs
git commit -m "$(cat <<'EOF'
test: smoke cobre acordeão da gaveta (exclusividade + rect estável)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

O smoke roda contra `localhost:3060` (serviço deployado) — a execução fica na Task 5, depois do deploy aprovado. Os checks novos só rodam nos perfis com `drawer` (iphone-portrait e iphone-landscape); o desktop não passa por esse bloco.

---

### Task 5: Gate final + deploy (com aval de Anders) + smoke

- [ ] **Step 1: Gate completo local**

Run: `npx tsc --noEmit && node --import tsx --test src/services/*.test.ts src/exercises/*.test.ts && npm run build`
Expected: tudo verde (133/133)

- [ ] **Step 2: Pedir aval de deploy a Anders**

Deploy só com aprovação explícita. Apresentar o resumo da mudança e aguardar.

- [ ] **Step 3: Deploy (após aval)**

```bash
APP_BASE_PATH=/gaze npm run build && sudo systemctl restart linhafixa.service && sleep 2 && systemctl is-active linhafixa.service
```

Expected: `active`. (`APP_BASE_PATH` é lido em **build-time** pelo vite.config.ts; o restart usa o env do serviço em /etc/linhafixa.env — não ler esse arquivo.)

- [ ] **Step 4: Smoke completo**

Run: `node scripts/smoke-layout.mjs`
Expected: todos os checks OK (55 atuais + 10 novos = 65/65)

- [ ] **Step 5: Atualizar BACKLOG e pedir revisão**

Marcar o BUNDLE D2 como "pronto pra revisão" no `BACKLOG.md` (PACK Layout Mobile) e atualizar `.remember/now.md`. Validação final: Anders no iPhone Pro Max (portrait + landscape) em https://ultrassom.ai/gaze — resumo vivo legível em 390px, toque nos cards, rotação com card aberto mantém estado.

```bash
git add BACKLOG.md
git commit -m "$(cat <<'EOF'
docs: BACKLOG — BUNDLE D2 pronto pra revisão

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Self-review (feito na escrita)

- **Cobertura do spec:** §1 seções como dados → Task 3; §2 desktop flat / mobile acordeão → Tasks 2-3; §3 comportamento (exclusivo, estado local, toggleSection pura) → Tasks 1-2; §4 invariantes (overlay, beginCalibration colapsa, fixos fora do acordeão) → Task 3 Step 4 + smoke; §5 bordas (rotação mantém estado — estado no componente que não remonta; truncate no resumo — Task 2; interpret sem details no mobile — Task 3); §6 testes → Tasks 1 e 4. Risco (re-render por frame) fica pra validação no iPhone; plano B (throttle) só se aparecer jank.
- **Tipos consistentes:** `SectionId` definido na Task 1, consumido nas Tasks 2-3; `DiagnosticsSection` definido na Task 2, consumido na Task 3.
- **Exceção consciente ao "no placeholders":** os comentários "verbatim" na Task 3 apontam linhas exatas do arquivo atual (`:853-860` etc.) para um refactor de **mover sem alterar** — copiar o código aqui duplicaria ~100 linhas que o executor precisa mover do próprio arquivo, criando risco de drift.

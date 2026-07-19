# BUNDLE Layout Mobile — chrome compacto no iPhone portrait

**Data:** 2026-07-18 · **Aprovação de escopo:** Anders (abordagem cirúrgica, sem redesign)
**Gate final:** revisão visual do Anders no iPhone (após deploy).

## Status (2026-07-18)

- **Implementado** no working tree (Tasks 1–6, itens 6.1 e 6.2 inclusos).
- **Gate GREEN:** lint ok · testes 276/276 · build 85382/180000 gzip · smoke
  layout 108/108 (95 antigos + 13 novos), validade 72/72, assessment 7/7,
  loading 43/43 · `real-tab-hidden` BLOCKED pré-existente (ambiente), sem falha
  funcional.
- **Deployado:** `linhafixa.service` restartado; `https://ultrassom.ai/gaze/` 200
  (prod e localhost:3060).
- **Commitado** em 2026-07-19 com autorização do Anders.
- **Pendente:** revisão visual do Anders no iPhone (gate do BUNDLE).
- Nota: os `baseline-*.png` citados abaixo já foram removidos da raiz do repo.

## Contexto e evidência

Baseline capturada via Playwright em `https://ultrassom.ai/gaze/` a 390×844:

- `/assessment` tem **2070px de altura**; o conteúdo (`<main>` h1) só começa em ~330px
  porque a sidebar mobile empilha cartão de marca + nav + card explicativo.
- O card escuro "Workspace de avaliacao" usa headline `text-3xl` (30px) e `p-6/p-8`
  desktop-first — desproporcional em 390px.
- No workspace vivo (embedded, `100dvh`), há **chrome duplicado**: o
  `AssessmentSessionSurface` renderiza card `rounded-[2rem]` + cabeçalho
  ("AVALIACAO" / título de estágio) e logo abaixo o `EyeTrackingTestScreen` renderiza
  outro header (voltar + "Sessao de avaliacao"). Canvas começa em ~100px.

Screenshots de baseline: `baseline-assessment-full.png`, `baseline-workspace-live.png`
(raiz do repo, temporários — remover no fim, não commitar).

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/smoke-layout.mjs` | Modificar | Novos checks de chrome mobile (shell e workspace) |
| `src/components/assessment/AssessmentSessionSurface.tsx` | Modificar | Sem card/header próprio quando `constrainedHeight`; exportar `SESSION_TITLES` |
| `src/screens/EyeTrackingTestScreen.tsx` | Modificar | Header único com título de estágio dinâmico quando embedded |
| `src/components/app/AppSidebar.tsx` | Modificar | Sidebar mobile compacta (marca slim, nav densa, explicativo só desktop) |
| `src/components/app/AppShell.tsx` | Modificar | Título da página escalonado mobile-first |
| `src/screens/AssessmentWorkspaceScreen.tsx` | Modificar | Cards do /assessment com tipografia/espaçamento mobile-first + testid |

Sem arquivos novos. Testes de layout vivem no smoke (componentes não têm unit test
neste projeto; o gate real é `npm run smoke` contra o build servido em 4175).

## Ciclo TDD adaptado

O smoke roda contra o **build** (`npm run smoke` sobe `dist/server.cjs` em 4175).
Rebuild por task seria ~4 builds; o ciclo aqui é: **Task 1 escreve todos os checks e
comprova o RED numa rodada única**; Tasks 2–4 implementam; **Task 5 comprova o GREEN
completo**. Vermelho e verde continuam observados de verdade, só que em lote.

Comando do ciclo (usado nas Tasks 1 e 5):

```bash
APP_BASE_PATH=/gaze npm run build && npm run smoke
```

---

### Task 1: Checks de chrome mobile no smoke-layout (RED)

**Arquivos:**
- Modificar: `scripts/smoke-layout.mjs` (dentro de `runViewport`, após `acceptConsent(page)` e após o bloco "Layout mode and reading surface")

- [x] **1. Escrever checks que falham.** Logo após `await acceptConsent(page);` (linha ~190), ainda ANTES do `page.goto(.../eye-tracking-test)`, inserir:

```js
    // --- Shell /assessment: chrome mobile compacto (BUNDLE Layout Mobile) ---
    // md: do Tailwind é 768px; iphone-landscape (844px) usa estilos desktop de shell.
    const mobileShell = profile.width < 768;
    if (mobileShell) {
      const mainH1 = await page.locator('main h1').first().boundingBox();
      check(profile.name, 'conteúdo do /assessment começa no topo (h1 y ≤ 160px)',
        !!mainH1 && mainH1.y <= 160, mainH1 ? `y=${Math.round(mainH1.y)}` : 'ausente');
      const explainerVisible = await page.getByText('Avaliacao primeiro').isVisible().catch(() => false);
      check(profile.name, 'card explicativo da sidebar oculto no mobile', !explainerVisible);
    } else {
      const explainerVisible = await page.getByText('Avaliacao primeiro').isVisible().catch(() => false);
      check(profile.name, 'card explicativo da sidebar presente no desktop', explainerVisible);
    }
    const headlinePx = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="workspace-headline"]');
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    });
    if (mobileShell) {
      check(profile.name, 'headline do card escuro escalada pra mobile (≤ 24px)',
        headlinePx !== null && headlinePx <= 24, `font-size=${headlinePx}px`);
    } else {
      check(profile.name, 'headline do card escuro mantém escala desktop (≥ 28px)',
        headlinePx !== null && headlinePx >= 28, `font-size=${headlinePx}px`);
    }
```

  E dentro do bloco da superfície de leitura, logo após o check `'canvas com área não nula'` (linha ~201), inserir:

```js
    // Workspace embedded: header único e compacto acima da superfície (sem o
    // cabeçalho duplicado do AssessmentSessionSurface). Só perfis touch — no
    // desktop a superfície é centrada e o y varia com a folga vertical.
    if (profile.touch) {
      check(profile.name, 'chrome acima da superfície ≤ 64px (header único)',
        !!canvasBox && canvasBox.y <= 64,
        canvasBox ? `canvas y=${Math.round(canvasBox.y)}` : 'ausente');
      check(profile.name, 'superfície ocupa ≥ 75% da altura do viewport',
        !!canvasBox && canvasBox.height >= profile.height * 0.75,
        canvasBox ? `h=${Math.round(canvasBox.height)} (${Math.round((canvasBox.height / profile.height) * 100)}%)` : 'ausente');
    }
```

- [x] **2. Rodar e ver falhar:** `APP_BASE_PATH=/gaze npm run build && npm run smoke`
  Falhas esperadas (as demais passam):
  - `iphone-portrait`: `conteúdo do /assessment começa no topo` (y≈330), `headline ≤ 24px` (30px), `chrome acima da superfície ≤ 64px` (y≈100), e `headline`/testid ausente (`font-size=nullpx`) em todos os perfis até a Task 4.
  - `iphone-landscape`: `chrome acima da superfície ≤ 64px`; headline desktop falha por testid ausente.
  - `desktop`/`desktop-portrait`: `headline ≥ 28px` falha por testid ausente (null).

### Task 2: Header único no workspace embedded

**Arquivos:**
- Modificar: `src/components/assessment/AssessmentSessionSurface.tsx`
- Modificar: `src/screens/EyeTrackingTestScreen.tsx:1375-1383`

- [x] **1. `AssessmentSessionSurface.tsx`** — exportar os títulos e zerar o chrome no modo `constrainedHeight`. Substituir `const SESSION_TITLES` por `export const SESSION_TITLES` e substituir o corpo do componente (mantendo o markup atual para o caso não-constrained):

```tsx
export function AssessmentSessionSurface({
  stage,
  text,
  blockReason,
  constrainedHeight = false,
  children,
}: {
  stage: AssessmentStage;
  text: string;
  blockReason: string | null;
  constrainedHeight?: boolean;
  children: ReactNode;
}) {
  if (constrainedHeight) {
    // Embedded (100dvh): o título de estágio vive no header único do workspace
    // (EyeTrackingTestScreen); aqui nenhum card/moldura — toda a altura é da sessão.
    return (
      <section className="flex h-full min-h-0 flex-col bg-slate-950 text-white">
        {blockReason ? (
          <p className="px-4 pt-2 text-sm font-medium text-amber-300">{blockReason}</p>
        ) : null}
        <div className="flex-1 min-h-0">{children}</div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-[2rem] border border-slate-800 bg-slate-950 text-white shadow-xl px-0 py-6 md:p-8 md:min-h-[720px]">
      <div className="mb-3 flex items-center justify-between gap-4 px-6 md:px-0">
        <div>
          <h1 className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
            Avaliacao
          </h1>
          <h2 className="mt-2 text-2xl font-bold">{SESSION_TITLES[stage]}</h2>
        </div>
      </div>
      <p className="mb-2 text-sm font-medium text-slate-300 px-6 md:px-0">{text}</p>
      {blockReason ? (
        <p className="mb-4 text-sm font-medium text-amber-300 px-6 md:px-0">{blockReason}</p>
      ) : null}
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}
```

  (As constantes `shellSpacing`/`chromePadding`/`titleSpacing` somem — os valores do
  ramo não-constrained ficam inline, idênticos ao render atual.)

- [x] **2. `EyeTrackingTestScreen.tsx`** — título de estágio dinâmico no header único.
  Adicionar ao import existente de `@/components/assessment/AssessmentSessionSurface`
  o símbolo `SESSION_TITLES`, e trocar o `<h1>` do header interno (linha ~1375):

```tsx
              <h1 className={`${embedded ? 'text-base' : 'text-lg'} font-bold`}>
                {embedded ? SESSION_TITLES[workspaceSnapshot.stage] : 'Dinâmica ocular de leitura'}
              </h1>
```

- [x] **3. Conferência estática:** `npx tsc --noEmit` (rápida; o RED/GREEN de smoke fecha na Task 5).

### Task 3: Sidebar e AppShell mobile-first

**Arquivos:**
- Modificar: `src/components/app/AppSidebar.tsx`
- Modificar: `src/components/app/AppShell.tsx:19-22`

- [x] **1. `AppSidebar.tsx`** — padding, marca slim, nav densa, explicativo só desktop:
  - `<aside>`: `className="border-b border-slate-200 bg-white/95 p-3 shadow-sm md:min-h-screen md:border-b-0 md:border-r md:p-6"`
  - Cartão de marca (bloco `flex items-center gap-3 ...`):

```tsx
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 md:rounded-3xl md:px-4 md:py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white md:h-11 md:w-11 md:rounded-2xl">
          <Activity className="h-4 w-4 md:h-5 md:w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Linha Fixa
          </p>
          <p className="hidden text-sm font-semibold text-slate-900 md:block">
            Navegacao clinica
          </p>
        </div>
      </div>
```

  - `<nav>`: `className="mt-3 flex gap-2 overflow-x-auto pb-1 md:mt-6 md:flex-col md:gap-3 md:overflow-visible md:pb-0"`
  - Nos dois ramos de item (link e desabilitado), trocar `px-4 py-3` por `px-3 py-2 md:px-4 md:py-3` (mantendo o resto das classes).
  - Card explicativo final: `className="mt-6 hidden rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 md:mt-10 md:block"`

- [x] **2. `AppShell.tsx`** — título escalonado:

```tsx
        <header className="mb-5 md:mb-6">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">{subtitle}</p>
        </header>
```

- [x] **3. Conferência estática:** `npx tsc --noEmit`.

### Task 4: Cards do /assessment proporcionais no mobile

**Arquivos:**
- Modificar: `src/screens/AssessmentWorkspaceScreen.tsx:141-277`

- [x] **1. Grid principal:** `className="grid gap-4 md:gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]"`; nos dois wrappers `space-y-6` (section e aside), usar `space-y-4 md:space-y-6`.
- [x] **2. Card escuro** (`section` da linha ~150): `className="rounded-3xl bg-slate-900 p-5 text-white shadow-lg md:rounded-[2rem] md:p-8"`
  - Headline (h2 da linha ~157): `className="mt-4 text-xl font-bold tracking-tight md:text-3xl"` e adicionar `data-testid="workspace-headline"`.
  - `strong` "Estado atual": `className="text-lg md:text-xl"`.
  - Grid interno (linha ~180): `className="mt-6 grid gap-3 md:mt-8 md:gap-4 md:grid-cols-3"`; os três `article`: `rounded-2xl border border-white/10 bg-white/10 p-4 md:rounded-3xl md:p-5`.
- [x] **3. Cards do aside** (3 `article`s, linhas ~234, ~250, ~264): `rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:rounded-[2rem] md:p-6`; os `h2` internos (linhas ~238, ~254): `mt-3 text-xl font-bold text-slate-900 md:text-2xl`.
- [x] **4. `AssessmentSetupPanel.tsx` fica como está** (proporções já razoáveis em 390px — decisão de escopo cirúrgico).
- [x] **5. Conferência estática:** `npx tsc --noEmit`.

### Task 5: Gate completo (GREEN)

- [x] **1.** `npm run lint`
- [x] **2.** `npm test` (esperado: 276/276)
- [x] **3.** `APP_BASE_PATH=/gaze npm run build` (budget ≤ 180KB gzip — mudanças são só classe/markup, sem risco de estourar)
- [x] **4.** `npm run smoke` — esperado: todos os checks novos verdes nos 4 perfis, além dos 95 existentes (nota conhecida: flakiness rara de "geometria indisponível" — re-rodar uma vez se aparecer).
- [x] **5.** Screenshots pós-fix nos mesmos viewports da baseline (comparação antes/depois pro Anders).
- [x] **6.** Remover `baseline-*.png` e `.playwright-mcp/` da raiz do repo.
- [ ] **7. Commit** — só com autorização explícita do Anders. **PENDENTE** (aguarda autorização).

### Task 6: Deploy pra revisão visual (gate do BUNDLE)

- [x] **1.** Build já feito com `APP_BASE_PATH=/gaze` (obrigatório — armadilha conhecida).
- [x] **2.** `sudo systemctl restart linhafixa.service` e conferir `https://ultrassom.ai/gaze/` 200.
- [ ] **3.** Avisar Anders: **pronto pra revisão** no iPhone (portrait): /assessment, workspace vivo, leitura. BUNDLE só fecha com o OK dele. **PENDENTE** — revisão visual do Anders é o gate final do BUNDLE.

## Riscos

- **`canvasBox.y ≤ 64` no landscape:** o header único em 844×390 é mais apertado; se o check falhar por 2-4px, ajustar o header embedded (`mb-2` → `mb-1`) — não afrouxar o check.
- **Smoke flakiness pré-existente** ("ponto de calibração — geometria indisponível"): re-rodar; se repetir, registrar como `PRE_EXISTING_FAILURE` (já documentada no BACKLOG).
- **Desktop embedded perde o eyebrow "AVALIACAO":** intencional — título de estágio continua visível no header único; conferir visualmente no screenshot desktop da Task 5.

## Self-review (feito na escrita)

- Cobertura: os 3 ofensores da spec têm task (T2 chrome duplicado; T3 sidebar; T4 cards). ✓
- Sem placeholders/TBD; código real em cada task. ✓
- Consistência: `SESSION_TITLES` exportado na T2 e importado na T2.2; `data-testid="workspace-headline"` criado na T4.2 e consumido na T1. `workspaceSnapshot` já existe no escopo do render (linha 1361). ✓

# Gaveta de Diagnóstico Mobile (DiagnosticsDrawer) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Nota de Anders (rules/subagents.md):** este repo tem codebase existente — execução deve ser **inline** (executing-plans), não via subagentes.

**Goal:** No mobile, substituir o painel fixo de 42vh por uma gaveta colapsável overlay (sheet no portrait, side no landscape), ampliando a superfície de leitura/calibração sem jamais redimensioná-la, e enxugar o chrome da calibração.

**Architecture:** Um helper puro de classes (`drawerLayout`) garante por teste o invariante central — a faixa colapsada fica no fluxo flex (rect estável) e o painel expandido é overlay `absolute` ancorado nela. O componente `DiagnosticsDrawer` é casca burra controlada pelo pai; `EyeTrackingTestScreen` guarda o estado e distribui o conteúdo existente entre faixa e painel sem alterar lógica de dados. `CalibrationOverlay` ganha `compactChrome` opt-in.

**Tech Stack:** React 19 + Tailwind v4, testes com `node:test` + `tsx` (sem infra de teste de componente — casca coberta por helper puro + smoke Playwright).

**Spec:** `docs/superpowers/specs/2026-07-04-mobile-calibration-drawer-design.md`

## Global Constraints

- **Desktop intocado:** o branch `isDesktopDiagnosticsLayout` (`EyeTrackingTestScreen.tsx:735`) renderiza o `<aside>` atual com as mesmas classes — zero mudança visual/geométrica no desktop.
- **Overlay, não reflow:** `drawerLayout(v, true).root === drawerLayout(v, false).root` (idem `strip`) — testado. Expandir a gaveta nunca altera o bounding box do canvas.
- **Sem lógica na casca:** `DiagnosticsDrawer` não conhece dados; estado `expanded` mora no screen.
- **Copy exata:** faixa sheet ~56px (`min-h-[56px]`), painel sheet `max-h-[60vh]`, coluna side `w-12` (48px), painel side `w-80` (320px).
- **Gate por task:** `npx tsc --noEmit` + `npm run test`; gate final adiciona `npm run build` + deploy 3060 + `npm run smoke`.
- **Commits:** um por task, mensagem focada no porquê, footer `Co-Authored-By: Claude <noreply@anthropic.com>`, via HEREDOC.
- **Validação final humana:** iPhone Pro Max de Anders (portrait + landscape) — a task 5 termina em "pronto pra revisão", nunca "fechado".

---

### Task 1: Helper puro `drawerLayout` (TDD)

**Files:**
- Create: `src/services/diagnosticsDrawerLayout.ts`
- Test: `src/services/diagnosticsDrawerLayout.test.ts` (coberto pelo glob de `npm run test`)

**Interfaces:**
- Consumes: nada.
- Produces: `type DrawerVariant = 'sheet' | 'side'`; `interface DrawerLayout { root: string; strip: string; panel: string; panelOpen: boolean }`; `function drawerLayout(variant: DrawerVariant, expanded: boolean): DrawerLayout`. Task 2 consome tudo.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/services/diagnosticsDrawerLayout.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawerLayout } from './diagnosticsDrawerLayout';

test('sheet: faixa fica no fluxo e painel expande como overlay para cima', () => {
  const collapsed = drawerLayout('sheet', false);
  const expanded = drawerLayout('sheet', true);
  assert.ok(!collapsed.root.includes('absolute'), 'root no fluxo flex, não overlay');
  assert.ok(collapsed.strip.includes('min-h-[56px]'));
  assert.ok(expanded.panel.includes('absolute'), 'painel é overlay');
  assert.ok(expanded.panel.includes('bottom-full'), 'painel abre para cima da faixa');
  assert.ok(expanded.panel.includes('max-h-[60vh]'));
  assert.ok(expanded.panel.includes('overflow-y-auto'));
});

test('side: coluna fina no fluxo e painel de 320px desliza da direita', () => {
  const collapsed = drawerLayout('side', false);
  const expanded = drawerLayout('side', true);
  assert.ok(!collapsed.root.includes('absolute'));
  assert.ok(collapsed.strip.includes('w-12'), 'coluna colapsada ~48px');
  assert.ok(expanded.panel.includes('absolute'));
  assert.ok(expanded.panel.includes('right-full'), 'painel abre por cima da superfície, à esquerda da coluna');
  assert.ok(expanded.panel.includes('w-80'), 'painel de ~320px');
});

test('invariante de geometria: root e strip não mudam com expanded', () => {
  for (const variant of ['sheet', 'side'] as const) {
    assert.equal(drawerLayout(variant, false).root, drawerLayout(variant, true).root);
    assert.equal(drawerLayout(variant, false).strip, drawerLayout(variant, true).strip);
  }
});

test('panelOpen espelha expanded', () => {
  assert.equal(drawerLayout('sheet', false).panelOpen, false);
  assert.equal(drawerLayout('side', true).panelOpen, true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test`
Expected: FAIL — `Cannot find module './diagnosticsDrawerLayout'`

- [ ] **Step 3: Implementar o helper**

```ts
// src/services/diagnosticsDrawerLayout.ts
export type DrawerVariant = 'sheet' | 'side';

export interface DrawerLayout {
  root: string;
  strip: string;
  panel: string;
  panelOpen: boolean;
}

// O invariante central do design: root e strip são idênticos nos dois estados —
// a faixa colapsada vive no fluxo flex e reserva espaço fixo, enquanto o painel
// expandido é overlay absoluto ancorado nela. Assim o rect da superfície de
// leitura (e a assinatura de calibração) nunca muda por causa da gaveta.
const LAYOUTS: Record<DrawerVariant, Omit<DrawerLayout, 'panelOpen'>> = {
  sheet: {
    root: 'relative w-full shrink-0 border-t border-white/10 bg-slate-800/80',
    strip: 'flex items-center gap-2 px-3 py-2 min-h-[56px]',
    panel: 'absolute bottom-full left-0 right-0 z-30 max-h-[60vh] overflow-y-auto border-t border-white/10 bg-slate-800/95 backdrop-blur p-4 flex flex-col gap-4',
  },
  side: {
    root: 'relative h-full shrink-0 border-l border-white/10 bg-slate-800/80',
    strip: 'flex flex-col items-center gap-2 px-1.5 py-3 h-full w-12',
    panel: 'absolute right-full top-0 bottom-0 z-30 w-80 overflow-y-auto border-l border-white/10 bg-slate-800/95 backdrop-blur p-4 flex flex-col gap-4',
  },
};

export function drawerLayout(variant: DrawerVariant, expanded: boolean): DrawerLayout {
  return { ...LAYOUTS[variant], panelOpen: expanded };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test`
Expected: PASS (94 testes existentes + 4 novos)

- [ ] **Step 5: Commit**

```bash
git add src/services/diagnosticsDrawerLayout.ts src/services/diagnosticsDrawerLayout.test.ts && git commit -m "$(cat <<'EOF'
feat: drawer layout helper com invariante overlay-não-reflow testado

A gaveta de diagnóstico mobile precisa expandir sem redimensionar a
superfície de leitura — o rect estável é o que mantém a assinatura de
calibração válida. O helper puro torna esse invariante testável fora
do DOM (não há infra de teste de componente no projeto).

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Componente `DiagnosticsDrawer` (casca burra)

**Files:**
- Create: `src/components/DiagnosticsDrawer.tsx`

**Interfaces:**
- Consumes: `drawerLayout`, `DrawerVariant` de `@/services/diagnosticsDrawerLayout` (Task 1).
- Produces: `DiagnosticsDrawer({ variant, expanded, onToggle, chips, actions?, children })` — Task 3 consome. `actions` é extensão pragmática do design aprovado: os botões Calibrar/Capturar ficam na faixa colapsada e precisam de um slot próprio ao lado dos `chips`. Renderiza `<aside>` como raiz (o smoke localiza o painel via `document.querySelector('aside')`). Painel expandido carrega `data-testid="drawer-panel"` (Task 5 mede alinhamento e visibilidade por ele). Puçador tem `aria-label` "Expandir diagnóstico"/"Recolher diagnóstico" (Task 5 clica por ele).

- [ ] **Step 1: Implementar o componente**

```tsx
// src/components/DiagnosticsDrawer.tsx
import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { drawerLayout, type DrawerVariant } from '@/services/diagnosticsDrawerLayout';

interface DiagnosticsDrawerProps {
  variant: DrawerVariant;
  expanded: boolean;
  onToggle: () => void;
  /** Sempre visível na faixa colapsada (status do pipeline). */
  chips: React.ReactNode;
  /** Ações primárias fixas na faixa (Calibrar/Capturar) — um toque, sem abrir a gaveta. */
  actions?: React.ReactNode;
  /** Conteúdo do painel; só renderiza expandido. */
  children: React.ReactNode;
}

// Casca de layout controlada pelo pai: nenhum estado ou dado próprio. O painel
// expandido é overlay (ver diagnosticsDrawerLayout), então abrir/fechar a gaveta
// nunca move a superfície de leitura que fica ao lado/acima.
export function DiagnosticsDrawer({ variant, expanded, onToggle, chips, actions, children }: DiagnosticsDrawerProps) {
  const layout = drawerLayout(variant, expanded);
  const Chevron = variant === 'sheet'
    ? (expanded ? ChevronDown : ChevronUp)
    : (expanded ? ChevronRight : ChevronLeft);
  return (
    <aside className={layout.root}>
      {layout.panelOpen && (
        <div className={layout.panel} data-testid="drawer-panel">
          {children}
        </div>
      )}
      <div className={layout.strip}>
        {chips}
        {actions}
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Recolher diagnóstico' : 'Expandir diagnóstico'}
          className={`${variant === 'sheet' ? 'ml-auto' : 'mt-auto'} shrink-0 p-2 rounded-full bg-white/10 hover:bg-white/20`}
        >
          <Chevron className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: sem erros (componente ainda não é usado; o gate visual vem nas tasks 3 e 5)

- [ ] **Step 3: Commit**

```bash
git add src/components/DiagnosticsDrawer.tsx && git commit -m "$(cat <<'EOF'
feat: casca DiagnosticsDrawer (sheet/side) controlada pelo pai

Estado mora no screen; a casca só posiciona faixa + painel overlay.
data-testid e aria-labels são o contrato com o smoke de layout.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Integração no `EyeTrackingTestScreen`

**Files:**
- Modify: `src/screens/EyeTrackingTestScreen.tsx` (imports `:22-50`; container `:846`; aside `:907-1098`; `startCapture` `:605`; `beginCalibration` `:756`)

**Interfaces:**
- Consumes: `DiagnosticsDrawer` (Task 2), `DrawerVariant` (Task 1), `isLandscape` (`:214`), `isDesktopDiagnosticsLayout` (`:735`).
- Produces: estado `drawerExpanded: boolean` (default `false`); no compacto o `<aside>` 42vh é substituído pela gaveta. Lógica de dados intocada — só distribuição de JSX.

- [ ] **Step 1: Estado, variante e auto-colapso**

Adicionar junto aos states existentes (perto de `:116`):

```tsx
const [drawerExpanded, setDrawerExpanded] = useState(false);
```

Depois de `isDesktopDiagnosticsLayout` (`:735`):

```tsx
const drawerVariant: DrawerVariant = isLandscape ? 'side' : 'sheet';
```

Import: `import { DiagnosticsDrawer } from '@/components/DiagnosticsDrawer';` e `import type { DrawerVariant } from '@/services/diagnosticsDrawerLayout';`.

Primeira linha de `startCapture` (`:605`) e de `beginCalibration` (`:756`):

```tsx
setDrawerExpanded(false);
```

(Cinto de segurança: a expansão é overlay, o rect não muda — mas capturar/calibrar com a gaveta aberta esconderia o estímulo.)

- [ ] **Step 2: Extrair fragmentos compartilhados desktop/compacto**

Antes do `return` (após o `Chip` local em `:815`), extrair os dados dos chips e os cartões, para que desktop e gaveta rendam o mesmo conteúdo sem duplicação:

```tsx
const chipData: { ok: boolean; label: string; neutral?: boolean }[] = [
  { ok: cameraState === 'running', label: cameraState === 'running' ? 'Câmera' : 'Câmera off' },
  { ok: live.faceFound, label: 'Rosto' },
  { ok: live.eyesFound, label: 'Olhos' },
  { ok: calibrated, label: calibrated ? `Calib ~${accuracyDeg != null ? accuracyDeg.toFixed(1) : '?'}°` : 'Sem calib', neutral: !calibrated },
  { ok: motionQuality.status === 'stable', label: motionStatusLabel(motionQuality.status), neutral: motionQuality.status === 'unavailable' },
];

// Coluna side tem 48px: chips viram pontos de status com o rótulo no title.
const StatusDot = ({ ok, label, neutral }: { ok: boolean; label: string; neutral?: boolean }) => (
  <span
    title={label}
    aria-label={label}
    className={`h-2.5 w-2.5 rounded-full shrink-0 ${neutral ? 'bg-slate-500' : ok ? 'bg-emerald-400' : 'bg-rose-400'}`}
  />
);
```

`diagnosticsCards` = fragmento com o miolo atual do aside, movido verbatim (grid de métricas `:941-950`, cartão de captação funcional `:952-977`, `<details>` `:979-1000`, cartão de condições `:1003-1039`):

```tsx
const diagnosticsCards = (
  <>
    {/* ...os quatro blocos atuais, movidos sem alteração de conteúdo... */}
  </>
);
```

`secondaryActions` = fragmento com o switch de modo (`:1044-1055`), aviso `captureBlockReason` (`:1081-1083`), botão "Capturas salvas" (`:1085-1090`) e "Parar câmera" (`:1092-1096`), também movidos verbatim.

- [ ] **Step 3: Ações e chips da faixa colapsada**

```tsx
const drawerChips = drawerVariant === 'sheet' ? (
  <div className="flex flex-nowrap items-center gap-2 overflow-x-auto min-w-0">
    {chipData.map(c => <Chip key={c.label} {...c} />)}
  </div>
) : (
  <div className="flex flex-col items-center gap-2">
    {chipData.map(c => <StatusDot key={c.label} {...c} />)}
  </div>
);

const drawerActions = (
  <div className={`flex items-center gap-1.5 shrink-0 ${drawerVariant === 'side' ? 'flex-col' : ''}`}>
    <button
      onClick={beginCalibration}
      disabled={cameraState !== 'running' && cameraState !== 'idle'}
      aria-label={calibrated ? 'Recalibrar' : 'Calibrar'}
      className="p-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-40 rounded-xl"
    >
      <Crosshair className="w-4 h-4" />
    </button>
    {!capturing ? (
      <button
        onClick={startCapture}
        disabled={!canStartCapture}
        aria-label={testMode === 'recall' ? 'Ler e responder' : 'Iniciar captura de leitura'}
        className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl"
      >
        <Play className="w-4 h-4" />
      </button>
    ) : (
      <button
        onClick={finishCapture}
        aria-label="Terminei de ler"
        className="flex items-center gap-1 p-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold"
      >
        <Check className="w-4 h-4" />
        {drawerVariant === 'sheet' && <span>{Math.floor(captureElapsed / 1000)}s</span>}
      </button>
    )}
  </div>
);
```

- [ ] **Step 4: Substituir o render**

Container (`:846`) — compacto landscape vira `flex-row` (superfície + coluna à direita):

```tsx
<div className={`flex-1 flex min-h-0 ${isDesktopDiagnosticsLayout ? 'flex-row justify-center gap-4 p-4' : isLandscape ? 'flex-row' : 'flex-col'}`}>
```

O `<aside>` (`:907-1098`) vira o branch:

```tsx
{isDesktopDiagnosticsLayout ? (
  <aside className="w-72 border-l max-h-none shrink-0 bg-slate-800/80 border-white/10 p-4 flex flex-col gap-4">
    {/* preview (:911-917), chips row com chipData.map + chip Escala,
        wrapper rolável (:939) com {diagnosticsCards},
        bloco de ações fixas (:1043) com os botões grandes atuais + {secondaryActions} */}
  </aside>
) : (
  <DiagnosticsDrawer
    variant={drawerVariant}
    expanded={drawerExpanded}
    onToggle={() => setDrawerExpanded(e => !e)}
    chips={drawerChips}
    actions={drawerActions}
  >
    {diagnosticsCards}
    {captureBlockReason && (
      <p className="text-xs text-amber-300 font-medium text-center px-2">{captureBlockReason}</p>
    )}
    {secondaryActions}
  </DiagnosticsDrawer>
)}
```

Regras da migração:
- Classes do aside desktop **byte a byte iguais** às atuais (só sem os ternários compactos, que morrem com o branch).
- Botões grandes Calibrar/Iniciar captura/Terminei (`:1057-1080`) ficam **somente** no desktop; no compacto a versão é a da faixa (`drawerActions`).
- Nenhum handler, estado ou efeito muda além do `setDrawerExpanded`.
- Rotação com gaveta aberta: `drawerVariant` recalcula via `isLandscape`, `drawerExpanded` persiste — nada a fazer, só não resetar o estado.

- [ ] **Step 5: Gate**

Run: `npx tsc --noEmit && npm run test`
Expected: sem erros; 98 testes PASS

- [ ] **Step 6: Commit**

```bash
git add src/screens/EyeTrackingTestScreen.tsx && git commit -m "$(cat <<'EOF'
feat: gaveta de diagnóstico substitui painel 42vh no mobile

Superfície de leitura/calibração ganha a tela quase toda; métricas
ficam a um toque na gaveta overlay (sheet portrait, side landscape).
Calibrar/Capturar migram pra faixa colapsada — ação primária sem abrir
gaveta. Auto-colapso antes de calibrar/capturar é cinto de segurança:
o overlay já garante rect estável.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Chrome enxuto no `CalibrationOverlay`

**Files:**
- Modify: `src/components/CalibrationOverlay.tsx` (props `:19-25`; frame/badge `:281-297`; texto-guia `:305-312`)
- Modify: `src/screens/EyeTrackingTestScreen.tsx:793-799` (passar a prop)

**Interfaces:**
- Consumes: nada novo.
- Produces: prop `compactChrome?: boolean` (default `false` — SettingsScreen e ExercisePlayerScreen, que também usam o overlay, ficam intocados). Frame ganha `data-testid="calibration-frame"` (contrato com Task 5, que hoje localiza o frame pelo texto do badge que este task oculta).

- [ ] **Step 1: Prop e chrome condicional**

Na interface e assinatura:

```tsx
interface CalibrationOverlayProps {
  viewingDistanceCm: number;
  onComplete: () => void;
  onSkip: () => void;
  keepCameraOnClose?: boolean;
  surfaceRect?: SurfaceRect;
  /** Mobile: oculta badge/contador e reduz o texto-guia a uma linha fora do rect. */
  compactChrome?: boolean;
}

export function CalibrationOverlay({ viewingDistanceCm, onComplete, onSkip, keepCameraOnClose = false, surfaceRect, compactChrome = false }: CalibrationOverlayProps) {
```

No frame (`:281-297`): adicionar `data-testid="calibration-frame"` no div da moldura e embrulhar badge + contador:

```tsx
<div
  className="pointer-events-none absolute rounded-2xl border-2 border-blue-300/80 bg-slate-950/20 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_24px_70px_rgba(15,23,42,0.55)]"
  style={surfaceRectStyle(surface)}
  data-testid="calibration-frame"
  aria-hidden="true"
>
  {!compactChrome && (
    <>
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-slate-950/85 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-100 shadow-lg backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-blue-300" />
        Área calibrada do teste
      </div>
      <div className="absolute right-4 top-4 rounded-full bg-slate-950/75 px-3 py-1.5 text-[11px] font-semibold text-slate-200 backdrop-blur">
        {Math.round(surface.width)}×{Math.round(surface.height)} px
      </div>
    </>
  )}
  {/* cantos decorativos: ficam nos dois modos */}
```

Texto-guia (`:305-312`) vira condicional — compacto é uma linha, fora do rect quando há folga (senão top=8 cai sobreposto, e o fundo semitransparente já cobre esse caso):

```tsx
{compactChrome ? (
  <div
    className="absolute left-1/2 -translate-x-1/2 z-10 rounded-full bg-slate-950/70 px-3 py-1 text-xs text-slate-200 backdrop-blur whitespace-nowrap"
    style={{ top: `${Math.max(8, surface.top - 36)}px` }}
  >
    Olhe para o ponto azul · {index + 1}/{totalThisMode}
  </div>
) : (
  <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2 text-center text-white px-4">
    <p className="text-base md:text-xl font-semibold mb-1">
      {phase === 'calibrating' ? 'Calibrando posição do olhar' : 'Verificando mapeamento'}
    </p>
    <p className="text-slate-300 text-xs md:text-sm">
      Olhe para o ponto azul dentro da área marcada · {index + 1}/{totalThisMode}
    </p>
  </div>
)}
```

- [ ] **Step 2: Passar a prop no test screen**

Em `EyeTrackingTestScreen.tsx:793-799` (gate idêntico ao do layout — "desktop zero mudança"):

```tsx
<CalibrationOverlay
  viewingDistanceCm={profile?.viewingDistanceCm || 40}
  onComplete={() => setShowCalibration(false)}
  onSkip={() => setShowCalibration(false)}
  keepCameraOnClose
  surfaceRect={calibrationSurfaceRect ?? undefined}
  compactChrome={!isDesktopDiagnosticsLayout}
/>
```

Atenção: `isDesktopDiagnosticsLayout` é computado depois do early-return `if (showCalibration)` (`:791`) — mover o cálculo de `diagnosticsLayout`/`isDesktopDiagnosticsLayout` (`:734-735`) para **antes** do `if (showCalibration)`, o que é seguro (só lê state/props).

- [ ] **Step 3: Gate**

Run: `npx tsc --noEmit && npm run test`
Expected: sem erros; 98 PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/CalibrationOverlay.tsx src/screens/EyeTrackingTestScreen.tsx && git commit -m "$(cat <<'EOF'
feat: chrome de calibração enxuto no mobile (compactChrome)

Badge e contador W×H consumiam área útil do rect pequeno do iPhone;
o guia vira uma linha posicionada fora da superfície quando há folga.
Opt-in por prop: Settings e ExercisePlayer seguem com o chrome cheio.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Smoke estendido + gate completo + deploy

**Files:**
- Modify: `scripts/smoke-layout.mjs`

**Interfaces:**
- Consumes: `data-testid="drawer-panel"` e aria-labels do puçador (Task 2), `data-testid="calibration-frame"` (Task 4), `<aside>` como raiz da gaveta (Task 2).
- Produces: gate automatizado dos dois estados da gaveta nos dois viewports iPhone.

- [ ] **Step 1: Atualizar perfis e checks de painel**

Nos `VIEWPORTS`, adicionar `drawer`:

```js
const VIEWPORTS = [
  { name: 'iphone-portrait', width: 390, height: 844, touch: true, expectDesktopPanel: false, drawer: 'sheet', checkCalibration: true },
  { name: 'iphone-landscape', width: 844, height: 390, touch: true, expectDesktopPanel: false, drawer: 'side', checkCalibration: false },
  { name: 'desktop', width: 1440, height: 860, touch: false, expectDesktopPanel: true, checkCalibration: true },
  { name: 'desktop-portrait', width: 1077, height: 1436, touch: false, expectDesktopPanel: true, checkCalibration: false, expectPortraitSurface: true },
];
```

Substituir o bloco `if (panel) { ... }` (posição/alinhamento) por variante:

```js
if (panel) {
  if (profile.drawer === 'sheet') {
    check(profile.name, 'gaveta sheet colapsada no rodapé (faixa fina, largura total)',
      panel.aside.y > profile.height * 0.7 && panel.aside.width > profile.width * 0.9 && panel.aside.height < 120,
      `aside y=${Math.round(panel.aside.y)} w=${Math.round(panel.aside.width)} h=${Math.round(panel.aside.height)}`);
  } else if (profile.drawer === 'side') {
    check(profile.name, 'gaveta side colapsada à direita (coluna fina, altura total)',
      panel.aside.x > profile.width * 0.8 && panel.aside.width < 80 && panel.aside.height > profile.height * 0.7,
      `aside x=${Math.round(panel.aside.x)} w=${Math.round(panel.aside.width)}`);
  } else {
    const sidePanel = panel.aside.x > profile.width * 0.6 && panel.aside.width < profile.width * 0.4;
    check(profile.name, 'painel lateral (desktop)', sidePanel,
      `aside x=${Math.round(panel.aside.x)} w=${Math.round(panel.aside.width)}`);
    const lefts = panel.rows.map(r => r.left);
    const rights = panel.rows.map(r => r.right);
    const spreadL = Math.max(...lefts) - Math.min(...lefts);
    const spreadR = Math.max(...rights) - Math.min(...rights);
    check(profile.name, 'cartões do painel alinhados (sem estreitamento)', spreadL <= 1.5 && spreadR <= 1.5,
      `spread esq=${spreadL.toFixed(1)}px dir=${spreadR.toFixed(1)}px em ${panel.rows.length} fileiras`);
  }
}
```

- [ ] **Step 2: Checks dos dois estados da gaveta (o coração do smoke novo)**

Logo após o bloco do painel, para perfis com `drawer`:

```js
if (profile.drawer) {
  const canvasBefore = await page.locator('canvas').first().boundingBox();
  await page.getByRole('button', { name: 'Expandir diagnóstico' }).click();
  const drawerPanel = page.getByTestId('drawer-panel');
  await drawerPanel.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
  const panelBox = await drawerPanel.boundingBox();
  check(profile.name, 'painel expandido visível', !!panelBox && panelBox.height > 100 && panelBox.width > 100,
    panelBox ? `${Math.round(panelBox.width)}×${Math.round(panelBox.height)}` : 'ausente');

  // Invariante do design: expandir é overlay — o canvas não pode mexer 1px.
  const canvasAfter = await page.locator('canvas').first().boundingBox();
  const stable = !!(canvasBefore && canvasAfter &&
    Math.abs(canvasBefore.x - canvasAfter.x) <= 1 && Math.abs(canvasBefore.y - canvasAfter.y) <= 1 &&
    Math.abs(canvasBefore.width - canvasAfter.width) <= 1 && Math.abs(canvasBefore.height - canvasAfter.height) <= 1);
  check(profile.name, 'superfície estável com gaveta expandida (overlay, não reflow)', stable,
    canvasBefore && canvasAfter ? `antes ${Math.round(canvasBefore.width)}×${Math.round(canvasBefore.height)} depois ${Math.round(canvasAfter.width)}×${Math.round(canvasAfter.height)}` : 'geometria indisponível');

  // Alinhamento dos cartões dentro do painel expandido (o "cartão estreitando" mobile).
  const spread = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="drawer-panel"]');
    if (!p) return null;
    const rows = [...p.children].map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
    if (!rows.length) return null;
    const lefts = rows.map(r => r.left);
    const rights = rows.map(r => r.right);
    return { l: Math.max(...lefts) - Math.min(...lefts), r: Math.max(...rights) - Math.min(...rights), n: rows.length };
  });
  check(profile.name, 'cartões da gaveta alinhados', !!spread && spread.l <= 1.5 && spread.r <= 1.5,
    spread ? `spread esq=${spread.l.toFixed(1)}px dir=${spread.r.toFixed(1)}px em ${spread.n} fileiras` : 'painel não medido');

  await page.getByRole('button', { name: 'Recolher diagnóstico' }).click();
  await drawerPanel.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  check(profile.name, 'gaveta recolhe de volta', !(await drawerPanel.isVisible().catch(() => false)));
}
```

- [ ] **Step 3: Frame de calibração via testid + checks do chrome compacto**

No bloco `if (overlayUp)`, trocar a localização do frame (o badge some no mobile):

```js
const frame = await page.getByTestId('calibration-frame').boundingBox();
```

(A localização do dot permanece.) Adicionar após os checks de geometria:

```js
const calibBadge = await page.getByText('Área calibrada do teste').isVisible().catch(() => false);
check(profile.name, profile.expectDesktopPanel ? 'badge de calibração presente (desktop)' : 'badge de calibração oculto (compacto)',
  calibBadge === profile.expectDesktopPanel);
const compactGuide = await page.getByText(/^Olhe para o ponto azul · \d+\/\d+$/).isVisible().catch(() => false);
check(profile.name, profile.expectDesktopPanel ? 'guia compacto ausente (desktop)' : 'guia de uma linha presente (compacto)',
  compactGuide !== profile.expectDesktopPanel);
```

Nota: o botão "Calibrar" no compacto é icon-only com `aria-label` — `getByRole('button', { name: 'Calibrar' })` continua funcionando via aria.

- [ ] **Step 4: Gate completo + deploy 3060**

```bash
npx tsc --noEmit && npm run test && npm run build
```
Expected: sem erros; 98 PASS; build OK.

Deploy (mesma porta 3060 já registrada — sem mudança de infra/APACHE.md):

```bash
kill $(pgrep -f 'node dist/server.cjs') 2>/dev/null; sleep 1; cd /root/Gaze && nohup npm run start >/tmp/gaze-server.log 2>&1 & sleep 2; curl -sf http://localhost:3060/gaze/ -o /dev/null && echo SERVER_OK
```
Expected: `SERVER_OK`

```bash
npm run smoke
```
Expected: `N/N checks OK` (contagem sobe com os checks novos), exit 0. Se o painel side de 320px estreitar cartões `grid-cols-2` (risco mapeado no spec), o check de alinhamento acusa — corrigir antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-layout.mjs && git commit -m "$(cat <<'EOF'
test: smoke cobre gaveta (2 estados × 2 variantes) e chrome compacto

O invariante overlay-não-reflow agora tem gate automatizado: expandir
a gaveta não pode mover o canvas 1px. Frame de calibração passa a ser
localizado por testid porque o badge — o localizador antigo — é
exatamente o que o mobile oculta.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Pronto pra revisão**

Atualizar `.remember/remember.md` com o estado real (comandos rodados, resultado do smoke) e chamar Anders pra validação no iPhone Pro Max (portrait + landscape, zoom natural) em `https://ultrassom.ai/gaze`. **Não declarar BUNDLE fechado** — fecha só com a confirmação dele.

---

## Self-Review (executado)

1. **Cobertura do spec:** §1 componente → Tasks 1-2; §2 screen → Task 3; §3 chrome → Task 4; §4 bordas → Task 3 Step 4 (rotação preserva `expanded`; desktop no branch) + Task 4 (nada novo na rotação durante calibração); §5 testes → Tasks 1 e 5. Sem lacunas.
2. **Placeholders:** o único bloco resumido é o miolo do `diagnosticsCards` (Task 3 Step 2), que é **movimentação verbatim** de linhas citadas (`:941-1039`) — o conteúdo exato está no arquivo fonte referenciado, não é código novo.
3. **Consistência de tipos:** `DrawerVariant`/`drawerLayout`/`DrawerLayout` (Task 1) = usados em Tasks 2-3; `compactChrome` (Task 4) = passado em Task 4 Step 2; testids/aria (Task 2/4) = consumidos em Task 5. OK.

## Riscos mapeados

- **Painel side 320px × `grid-cols-2`:** check de alinhamento do smoke acusa; ajuste pontual se furar.
- **`isDesktopDiagnosticsLayout` antes do early-return:** movimentação segura (só lê state), mas é a única mudança de ordem no fluxo — atenção no diff.
- **Faixa sheet com chips + 2 botões + puçador em 390px:** chips têm `overflow-x-auto`; se ficar apertado no aparelho real, encurtar rótulos dos chips é o fallback (decisão de Anders na revisão).

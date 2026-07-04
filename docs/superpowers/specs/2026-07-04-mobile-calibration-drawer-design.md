# Design — Gaveta de diagnóstico + superfície ampliada (mobile)

**Data:** 2026-07-04
**Status:** Aprovado por Anders (brainstorm da sessão anterior)
**Escopo:** Layout compacto (mobile/touch) do teste de rastreamento ocular. Desktop permanece intocado.

## Problema

No iPhone, o layout compacto divide a tela entre a superfície de leitura/calibração e o
`<aside>` de diagnóstico fixo em `max-h-[42vh]` (`src/screens/EyeTrackingTestScreen.tsx:907`).
A superfície fica pequena — justamente o recurso que a calibração e a captura mais precisam —
e o chrome da calibração (badge, contador W×H, texto-guia de duas linhas) consome espaço útil
dentro do surface rect.

## Solução

### 1. Componente novo: `DiagnosticsDrawer`

`src/components/DiagnosticsDrawer.tsx` — só a casca de layout, sem lógica de dados.

```
┌─ portrait ──────────────┐   ┌─ landscape ─────────────────┐
│                         │   │                       ┌────┐│
│   superfície leitura/   │   │  superfície           │chips││
│   calibração (cresce)   │   │  (altura toda)        │ ⋮  ││
│                         │   │                       │puçad││
├─────────────────────────┤   │                       └────┘│
│ chips ▪▪▪▪▪    [puçador]│   └─────────────────────────────┘
└─────────────────────────┘
```

**Props:** `variant: 'sheet' | 'side'` (desktop não passa pela gaveta — mantém o `<aside>`
atual intacto), `expanded`, `onToggle`, `chips: ReactNode` (sempre visível), `children`
(conteúdo que só aparece expandido). Controlado pelo pai — o estado mora no screen, a casca é burra.

- **sheet (portrait):** colapsada = faixa de ~56px com chips + puçador. Expandida = sobe até
  `max-h-[60vh]` por cima da superfície (`absolute` + z-index), **sem redimensionar o canvas** —
  expandir pra consultar métricas não mexe no `surfaceRect`.
- **side (landscape):** colapsada = coluna fina (~48px) à direita com chips na vertical + puçador.
  Expandida = painel de ~320px desliza da direita, também overlay.

★ **A decisão de overlay em vez de reflow é o coração do design:** o rect da superfície fica
estável independente do estado da gaveta, então a assinatura de calibração nunca diverge por
causa da UI.

### 2. Mudanças no `EyeTrackingTestScreen`

- Estado novo `drawerExpanded` (default `false`).
- No layout compacto, o `<aside>` atual (42vh, linha 907) é substituído pela `DiagnosticsDrawer`;
  o conteúdo interno (métricas, captação funcional, condições, botões de ação) migra pra dentro
  como `children` **sem alteração de lógica**.
- Botões de ação principais (Calibrar / Capturar — hoje em `:1057-1080`) saem do miolo rolável
  e ficam na faixa colapsada junto aos chips — ação primária a um toque, sem abrir gaveta.
- `beginCalibration` (`:756`) e `startCapture` (`:605`) fazem `setDrawerExpanded(false)` antes
  de capturar o rect (auto-colapso; como a expansão é overlay, é cinto de segurança, não
  requisito geométrico).
- Variante escolhida pelo `isLandscape` já existente (`:214`).

### 3. Chrome da calibração enxuto (mobile)

No `CalibrationOverlay`, quando compacto (mesma condição `IS_MOBILE`/touch):

- Badge "Área calibrada do teste" (`CalibrationOverlay.tsx:286-289`) e contador W×H px
  (`:290-292`) → **ocultos**.
- Texto-guia de duas linhas (`:305-312`) → uma linha única `Olhe para o ponto azul · 3/9`,
  fonte menor, posicionada fora do surface rect quando houver folga (senão sobreposta com
  fundo semitransparente como hoje).
- Cantos decorativos (`:293-296`) ficam — são leves e ajudam a enquadrar.

### 4. Casos de borda

- **Rotação durante calibração:** comportamento atual preservado (assinatura registra
  orientação; rotação invalida). Nada novo.
- **Gaveta expandida ao rotacionar:** variante troca sheet↔side mantendo `expanded` — sem
  estado perdido.
- **Desktop:** zero mudança (guard `isDesktopDiagnosticsLayout`, `:735`, continua o gate).

### 5. Testes e validação

- Testes unitários da casca: variante × estado renderiza classes/regiões esperadas (padrão dos
  testes de componente existentes; se não houver infra de teste de componente, teste do helper
  de classes).
- `scripts/smoke-layout.mjs` já existe — estender pros dois estados da gaveta se couber.
- Gate: `npx tsc --noEmit` + `npm run test` + build; validação final no iPhone Pro Max de
  Anders (portrait e landscape, zoom natural) via deploy na 3060.

## Risco

⚠️ Único risco real: conteúdo do painel hoje assume largura de coluna (grids `grid-cols-2`);
no painel lateral de 320px isso segue ok, mas conferir visualmente no smoke antes de chamar
Anders pra revisão.

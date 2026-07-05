# Design — D2: expandable cards na gaveta de diagnóstico (mobile)

**Data:** 2026-07-05
**Status:** Aprovado por Anders (brainstorm desta sessão)
**Escopo:** Painel expandido da gaveta mobile (`DiagnosticsDrawer`). Desktop permanece intocado.
**Depende de:** D1 (gaveta mobile, spec 2026-07-04) — já entregue e validado no iPhone.

## Problema

Com a gaveta expandida, o painel empilha tudo de uma vez: grid de 8 métricas, card de
Captação funcional, "Como interpretar", Condição da captura, switch de modo e botões
(`src/screens/EyeTrackingTestScreen.tsx:850-952`). No iPhone isso dá um scroll comprido —
pra conferir um único valor, Anders rola o painel inteiro.

## Solução

### 1. Seções como dados

O JSX monolítico `diagnosticsCards` vira uma lista tipada:

```ts
interface DiagnosticsSection {
  id: 'metrics' | 'signal' | 'conditions' | 'interpret';
  title: string;        // "Métricas", "Captação", "Condição", "Como interpretar"
  summary?: string;     // resumo vivo de 1 linha (interpret não tem)
  content: ReactNode;   // o card atual, sem alteração interna
}
```

Resumos derivam de estado que já existe — nenhum buffer ou cálculo novo:

- `metrics` → `30fps · H +0.42` (`live.fps`, `live.h`)
- `signal` → `78% · calibrado` (`liveSignal.sensitivityScore`, `sourceLabel`)
- `conditions` → `Normal · Reta` (`conditions.lighting`, `conditions.posture`)

### 2. Desktop flat, mobile acordeão

- **Desktop `<aside>`:** renderiza `sections.map(s => s.content)` — pixel igual a hoje.
  O `<details>` nativo de "Como interpretar" segue como está no desktop.
- **Gaveta mobile:** componente novo `DiagnosticsAccordion` recebe as seções e renderiza
  cada uma como card colapsável: cabeçalho `<button aria-expanded>` de 1 linha
  (título + resumo vivo + chevron), conteúdo só quando aberta.

```
┌────────────────────────────────────┐
│ ▸ Métricas        30fps · H +0.42  │
├────────────────────────────────────┤
│ ▾ Captação     78% · calibrado     │
│   ▓▓▓▓▓▓▓▓▓▓░░░  sensib. 78%       │
│   Evento: fixação · H range 0.31   │
├────────────────────────────────────┤
│ ▸ Condição       Normal · Reta     │
├────────────────────────────────────┤
│ ▸ Como interpretar                 │
├────────────────────────────────────┤
│ [switch modo] [capturas] [parar]   │  ← fixos, fora do acordeão
└────────────────────────────────────┘
```

### 3. Comportamento do acordeão

- **Um aberto por vez:** abrir um card fecha o outro. Tocar no aberto fecha tudo.
- **Estado local** (`useState<SectionId | null>` dentro do `DiagnosticsAccordion`),
  inicial `null`. Como o painel da gaveta só renderiza quando expandida (decisão do D1,
  `drawerLayout.panelOpen`), o estado reseta sozinho a cada abertura — "sempre começa
  colapsado" de graça, sem effect nem persistência.
- Alternância extraída em função pura `toggleSection(current, id)` → testável unitariamente.

★ **O resumo vivo no cabeçalho é o ganho central:** bate o olho na gaveta e vê se algo
degradou (fps caiu, sinal virou bruto) sem abrir card nenhum — a gaveta vira um painel
de status escaneável em vez de um scroll de consulta.

### 4. Invariantes preservadas

- Tudo acontece **dentro do painel overlay** — o `surfaceRect` do canvas não se move
  (invariante do D1, já vigiada pelo smoke).
- `beginCalibration` continua colapsando a gaveta inteira (`setDrawerExpanded(false)`).
- Switch de modo, aviso de captura bloqueada, "Capturas salvas" e "Parar câmera" ficam
  fixos abaixo do acordeão, fora dos cards.
- No card "Condição" aberto, os botões (iluminação/postura) e o input de nota funcionam
  como hoje — o acordeão não intercepta toques do conteúdo.

### 5. Casos de borda

- **Rotação com card aberto:** variante sheet↔side troca, acordeão mantém o card aberto
  (estado vive no componente, que não remonta na rotação com gaveta expandida).
- **Resumo apertado em 390px:** cabeçalho usa `truncate` no resumo; fallback mapeado é
  encurtar rótulos (mesmo playbook dos chips do D1).
- **"Como interpretar" na gaveta:** deixa de ser `<details>` e vira card do acordeão
  (um mecanismo só de expansão no mobile; no desktop segue `<details>`).

### 6. Testes e validação

- Unit: `toggleSection` (abre, troca, fecha no toque repetido).
- Smoke (`scripts/smoke-layout.mjs`): gaveta expandida → tocar card → só ele aberto →
  tocar outro → troca → canvas com rect estável durante tudo.
- Gate: `npx tsc --noEmit` + `npm run test` + `APP_BASE_PATH=/gaze npm run build` +
  restart `linhafixa.service` + smoke; validação final no iPhone Pro Max de Anders.

## Risco

⚠️ Resumo vivo re-renderiza o cabeçalho a cada frame com a gaveta aberta — custo igual ou
menor que hoje (os cards inteiros já re-renderizam abertos). Se aparecer jank no iPhone,
degradar resumo pra atualização throttled é o plano B.

# Design System Gaze — Tokens OKLCH + Dark Mode + Primitivas CVA

**Data:** 2026-07-19 · **Decisão de Anders:** big-bang completo (tokens semânticos, dark mode, CVA), escolhido via skill `tailwind-design-system`.

## Contexto

O Gaze já roda Tailwind **v4.1.14 CSS-first**, mas o `@theme` só define a fonte. Todo o design vive hardcoded: `slate-*`, `indigo-*`, `emerald/amber/rose/teal` repetidos em ~30 arquivos; cada tela redesenha card/badge/botão na mão (`rounded-3xl border border-slate-100 shadow-sm` clonado em toda parte). Não há `cn()`, CVA nem tokens.

### Decisões de arquitetura (fechadas neste plano)

1. **Zero drift visual na migração.** Tokens semânticos são definidos como CSS vars em `:root` **referenciando a paleta OKLCH nativa do v4** via `@theme inline` (padrão shadcn/v4). Utilities `bg-surface` compilam para `var(--surface)`, que flipa com `.dark`. A UI clara fica byte-idêntica até o dark mode ligar.
2. **Cores clínicas ficam literais.** Na superfície escura do teste ocular, cor é *sinal*, não estética: `ring-amber-400/70` = drift de distância (`ExerciseCanvas.tsx:341`), `bg-red-500/90` = cabeça instável (`ExerciseCanvas.tsx:343`), âmbar do blue-dot baseline (EMA pinada). **Nenhuma dessas muda de classe nem de semântica.** A migração da superfície escura toca só chrome neutro (fundos slate-900/950, textos slate-300).
3. **Dark mode por classe** (`@custom-variant dark`), aplicada em `<html>`, persistida em `localStorage` (`linhafixa_theme`), com fallback `prefers-color-scheme`. Não entra no profile do IndexedDB (é preferência de dispositivo, como o resto do perfil — mas theme precisa aplicar ANTES do React hidratar, senão flasha).
4. **Primitivas CVA testáveis como funções puras**: `buttonVariants({...})` retorna string → testável com node:test sem DOM, no padrão do projeto.
5. **Gate por fase**, não por arquivo: `npm run lint && npm test && APP_BASE_PATH=/gaze npm run build && npm run smoke`. Budget 180k gzip (hoje 85.3k; cva+clsx+tailwind-merge ≈ +6k). `real-tab-hidden` BLOCKED é pré-existente.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/index.css` | Modificar | Tokens `:root`/`.dark` + `@theme inline` + `@custom-variant dark` |
| `src/ui/cn.ts` (+`.test.ts`) | Criar | Merge de classes (clsx + tailwind-merge) |
| `src/services/theme.ts` (+`.test.ts`) | Criar | resolve/persist/apply do tema (puro + wrapper DOM) |
| `index.html` | Modificar | Script inline anti-flash (aplica `.dark` antes do bundle) |
| `src/components/ui/button.tsx` (+`.test.ts`) | Criar | `buttonVariants` CVA + componente |
| `src/components/ui/card.tsx` (+`.test.ts`) | Criar | `cardVariants` (surface/tone) + Card |
| `src/components/ui/badge.tsx` (+`.test.ts`) | Criar | `badgeVariants` (tone) + Badge |
| `src/components/ui/stat-tile.tsx` (+`.test.ts`) | Criar | StatTile (valor + rótulo, os pares repetidos em Dashboard/Player) |
| `src/components/app/AppShell.tsx`, `AppSidebar.tsx` | Modificar | Migrar p/ tokens |
| `src/screens/{Dashboard,History,AssessmentWorkspace,Settings,ExerciseLibrary,Consent}Screen.tsx` | Modificar | Migrar p/ tokens + primitivas |
| `src/components/{QuickContextForm,RecallQuiz,CaptureValiditySummary,CalibrationReusePrompt,Diagnostics*}.tsx` | Modificar | Migrar p/ tokens + primitivas |
| `src/screens/{ExercisePlayer,EyeTrackingTest}Screen.tsx`, `src/components/{CalibrationOverlay,ExerciseCanvas}.tsx` | Modificar | Só chrome neutro → tokens dark-surface; sinais clínicos intocados |
| `src/screens/SettingsScreen.tsx` | Modificar | Toggle de tema |
| `package.json` | Modificar | deps + glob de teste `src/components/ui/*.test.ts`, `src/ui/*.test.ts` |

## Tabela de mapeamento (fonte de verdade da migração)

| Hardcoded hoje | Token | Claro | Escuro |
|---|---|---|---|
| `bg-slate-50` (página), `bg-slate-100` (shell) | `bg-app` / `bg-app-inset` | slate-50 / slate-100 | slate-950 / slate-900 |
| `bg-white` (cards) | `bg-surface` | white | slate-900 |
| `bg-slate-50` (sub-blocos dentro de card) | `bg-surface-sunken` | slate-50 | slate-800 |
| `border-slate-100` / `border-slate-200` | `border-line` / `border-line-strong` | slate-100/200 | slate-800/700 |
| `text-slate-800`/`900` (títulos) | `text-strong` | slate-800 | slate-100 |
| `text-slate-500`/`600``/700` (corpo) | `text-mild` | slate-600 | slate-300 |
| `text-slate-400` (faint/uppercase labels) | `text-faint` | slate-400 | slate-500 |
| `bg-slate-900` (painéis escuros hero, botão primário) | `bg-ink` (+`text-ink-foreground`) | slate-900 | slate-800 |
| `indigo-*` (accent IA/ocular) | `accent` (`bg-accent`, `text-accent`, `bg-accent-soft`, `border-accent-line`) | indigo-600/50/100 | indigo-400/950/900 |
| `blue-600` (CTAs da superfície escura) | fica literal nesta rodada (superfície escura já é dark) | — | — |
| `emerald-*` (positivo) | Badge/Card `tone="positive"` | emerald-100/700 | emerald-950/300 |
| `amber-*` (atenção **não-clínica**: badges, avisos) | `tone="caution"` | amber-100/700 | amber-950/300 |
| `rose-*` (inválido/erro) | `tone="alert"` | rose-100/700 | rose-950/300 |
| `teal-*` (postural) | `tone="postural"` | teal-… | teal-… |
| `ring-amber-400/70`, `bg-red-500/90`, cores de canvas/dot | **INTOCADOS** (sinal clínico) | — | — |

Regra de execução: migração é find→replace **guiado por esta tabela**, arquivo a arquivo, lendo cada ocorrência (nada de sed cego — contexto decide entre `text-mild` e `text-faint`).

---

## Fase 0 — Fundamentos (deps, cn, tokens, dark variant)

### Task 1: Dependências + `cn()`

**Arquivos:** Criar `src/ui/cn.ts`, `src/ui/cn.test.ts`; Modificar `package.json` (deps + glob de teste).

- [ ] **1. Instalar deps:** `npm i class-variance-authority clsx tailwind-merge`
- [ ] **2. Ampliar glob de teste** em `package.json` (script `test`): incluir `src/ui/*.test.ts` e `src/components/ui/*.test.ts` ao lado dos globs atuais.
- [ ] **3. Teste que falha** — `src/ui/cn.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cn } from './cn';

test('merges conditional classes and dedupes tailwind conflicts', () => {
  assert.equal(cn('p-2', 'p-4'), 'p-4');
  assert.equal(cn('text-strong', false && 'hidden', 'font-bold'), 'text-strong font-bold');
  assert.equal(cn('bg-surface', { 'opacity-50': true, 'hidden': false }), 'bg-surface opacity-50');
});
```
- [ ] **4. Rodar e ver falhar:** `npx tsx --test src/ui/cn.test.ts` → ERR_MODULE_NOT_FOUND.
- [ ] **5. Implementação** — `src/ui/cn.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Única porta de merge de classes do app: clsx resolve condicionais,
// twMerge resolve conflitos de utility (p-2 + p-4 → p-4).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```
- [ ] **6. Rodar e ver passar**, depois gate rápido: `npm run lint && npm test`.

### Task 2: Tokens semânticos + dark variant em `src/index.css`

**Arquivos:** Modificar `src/index.css` (substituição completa do bloco de tema).

- [ ] **1. Escrever o CSS** (conteúdo integral novo de `src/index.css`):
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

/* Valores crus por tema. Referenciam a paleta OKLCH nativa do v4, então o
   modo claro fica byte-idêntico ao design atual (zero drift na migração). */
:root {
  --app: var(--color-slate-50);
  --app-inset: var(--color-slate-100);
  --surface: #ffffff;
  --surface-sunken: var(--color-slate-50);
  --line: var(--color-slate-100);
  --line-strong: var(--color-slate-200);
  --strong: var(--color-slate-800);
  --mild: var(--color-slate-600);
  --faint: var(--color-slate-400);
  --ink: var(--color-slate-900);
  --ink-foreground: #ffffff;
  --accent: var(--color-indigo-600);
  --accent-soft: var(--color-indigo-50);
  --accent-line: var(--color-indigo-100);
  --accent-strong: var(--color-indigo-700);
}

.dark {
  --app: var(--color-slate-950);
  --app-inset: var(--color-slate-900);
  --surface: var(--color-slate-900);
  --surface-sunken: var(--color-slate-800);
  --line: var(--color-slate-800);
  --line-strong: var(--color-slate-700);
  --strong: var(--color-slate-100);
  --mild: var(--color-slate-300);
  --faint: var(--color-slate-500);
  --ink: var(--color-slate-800);
  --ink-foreground: var(--color-slate-100);
  --accent: var(--color-indigo-400);
  --accent-soft: var(--color-indigo-950);
  --accent-line: var(--color-indigo-900);
  --accent-strong: var(--color-indigo-300);
}

/* Expõe os tokens como cores do Tailwind: bg-surface, text-strong, border-line… */
@theme inline {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --color-app: var(--app);
  --color-app-inset: var(--app-inset);
  --color-surface: var(--surface);
  --color-surface-sunken: var(--surface-sunken);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-strong: var(--strong);
  --color-mild: var(--mild);
  --color-faint: var(--faint);
  --color-ink: var(--ink);
  --color-ink-foreground: var(--ink-foreground);
  --color-accent: var(--accent);
  --color-accent-soft: var(--accent-soft);
  --color-accent-line: var(--accent-line);
  --color-accent-strong: var(--accent-strong);
}

body {
  font-family: var(--font-sans);
  background-color: var(--app);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```
- [ ] **2. Validar:** `APP_BASE_PATH=/gaze npm run build` verde; `npm run smoke` verde (nada usa os tokens ainda — mudança precisa ser invisível).

### Task 3: Serviço de tema + anti-flash

**Arquivos:** Criar `src/services/theme.ts`, `src/services/theme.test.ts`; Modificar `index.html`.

- [ ] **1. Teste que falha** — `src/services/theme.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, THEME_STORAGE_KEY } from './theme';

test('stored value wins over system preference', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
});

test('falls back to system preference when nothing stored', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
});

test('ignores garbage in storage', () => {
  assert.equal(resolveTheme('blue', true), 'dark');
});

test('storage key is stable', () => {
  assert.equal(THEME_STORAGE_KEY, 'linhafixa_theme');
});
```
- [ ] **2. Rodar e ver falhar:** `npx tsx --test src/services/theme.test.ts`.
- [ ] **3. Implementação** — `src/services/theme.ts`:
```ts
export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'linhafixa_theme';

// Puro: valor salvo válido vence; senão segue o sistema.
export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

export function getTheme(): Theme {
  return resolveTheme(
    localStorage.getItem(THEME_STORAGE_KEY),
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
```
- [ ] **4. Rodar e ver passar.**
- [ ] **5. Anti-flash em `index.html`** — script inline no `<head>`, antes do bundle (chave literal, duplicada de propósito: roda antes de qualquer módulo):
```html
<script>
  try {
    var t = localStorage.getItem('linhafixa_theme');
    var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
</script>
```
- [ ] **6. Gate da fase 0 completo** + commit (`feat(ds): fundamentos — tokens semânticos, dark variant, cn e serviço de tema`).

---

## Fase 1 — Primitivas CVA

### Task 4: Button

**Arquivos:** Criar `src/components/ui/button.tsx`, `src/components/ui/button.test.ts`.

- [ ] **1. Teste que falha** — `src/components/ui/button.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buttonVariants } from './button';

test('default is the ink primary button', () => {
  const cls = buttonVariants({});
  assert.match(cls, /bg-ink/);
  assert.match(cls, /text-ink-foreground/);
  assert.match(cls, /font-bold/);
});

test('variants map to token families', () => {
  assert.match(buttonVariants({ variant: 'accent' }), /bg-accent/);
  assert.match(buttonVariants({ variant: 'outline' }), /border-line-strong/);
  assert.match(buttonVariants({ variant: 'ghost' }), /text-faint/);
});

test('sizes control padding and radius', () => {
  assert.match(buttonVariants({ size: 'lg' }), /py-4/);
  assert.match(buttonVariants({ size: 'sm' }), /py-2/);
});
```
- [ ] **2. Rodar e ver falhar.**
- [ ] **3. Implementação** — `src/components/ui/button.tsx` (variantes derivadas dos botões reais de hoje: primário `bg-slate-900 text-white rounded-xl font-bold`, accent `bg-indigo-600 hover:bg-indigo-700`, outline `bg-white border border-slate-200`, ghost `text-slate-400 hover:text-slate-200`):
```tsx
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/ui/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-ink-foreground hover:opacity-90',
        accent: 'bg-accent text-white hover:bg-accent-strong',
        outline: 'bg-surface border border-line-strong text-mild hover:bg-surface-sunken',
        ghost: 'text-faint hover:text-mild font-medium',
      },
      size: {
        sm: 'px-4 py-2 text-sm',
        md: 'px-6 py-3',
        lg: 'px-10 py-4 text-lg w-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```
- [ ] **4. Rodar e ver passar** (`npx tsx --test src/components/ui/button.test.ts`).

### Task 5: Card, Badge e StatTile

**Arquivos:** Criar `src/components/ui/card.tsx`, `badge.tsx`, `stat-tile.tsx` + um `.test.ts` para cada.

- [ ] **1. Testes que falham** (um arquivo por primitiva; padrão do de Button):
```ts
// card.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardVariants } from './card';

test('default card is the rounded-3xl surface', () => {
  const cls = cardVariants({});
  assert.match(cls, /bg-surface/);
  assert.match(cls, /rounded-3xl/);
  assert.match(cls, /border-line/);
});

test('tones swap the border and background family', () => {
  assert.match(cardVariants({ tone: 'accent' }), /border-accent-line/);
  assert.match(cardVariants({ tone: 'sunken' }), /bg-surface-sunken/);
});
```
```ts
// badge.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeVariants } from './badge';

test('badge tones map to the status palette', () => {
  assert.match(badgeVariants({ tone: 'positive' }), /emerald/);
  assert.match(badgeVariants({ tone: 'caution' }), /amber/);
  assert.match(badgeVariants({ tone: 'alert' }), /rose/);
  assert.match(badgeVariants({ tone: 'neutral' }), /bg-surface-sunken/);
});

test('badge base is the pill', () => {
  assert.match(badgeVariants({}), /rounded-full/);
  assert.match(badgeVariants({}), /text-xs font-bold/);
});
```
```ts
// stat-tile.test.ts — só o contrato de classes do wrapper
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statTileClasses } from './stat-tile';

test('stat tile exposes value+label styling', () => {
  assert.match(statTileClasses.value, /font-bold/);
  assert.match(statTileClasses.value, /text-strong/);
  assert.match(statTileClasses.label, /text-faint/);
});
```
- [ ] **2. Rodar e ver falhar.**
- [ ] **3. Implementações:**
```tsx
// card.tsx
import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/ui/cn';

export const cardVariants = cva('rounded-3xl border p-6 shadow-sm', {
  variants: {
    tone: {
      surface: 'bg-surface border-line',
      sunken: 'bg-surface-sunken border-line',
      accent: 'bg-accent-soft border-accent-line',
      positive: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950 dark:border-emerald-900',
      caution: 'bg-amber-50 border-amber-100 dark:bg-amber-950 dark:border-amber-900',
      alert: 'bg-rose-50 border-rose-100 dark:bg-rose-950 dark:border-rose-900',
    },
  },
  defaultVariants: { tone: 'surface' },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, tone, ...props }: CardProps) {
  return <div className={cn(cardVariants({ tone }), className)} {...props} />;
}
```
```tsx
// badge.tsx
import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/ui/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-sunken text-mild',
        accent: 'bg-accent-soft text-accent-strong',
        positive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        caution: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
        alert: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
        postural: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
```
```tsx
// stat-tile.tsx — o par valor+rótulo repetido em Dashboard/Player/History
import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';

export const statTileClasses = {
  value: 'text-lg md:text-xl font-bold text-strong',
  label: 'text-xs md:text-sm text-faint font-medium mt-1',
} as const;

export function StatTile({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className={statTileClasses.value}>{value}</div>
      <div className={statTileClasses.label}>{label}</div>
    </div>
  );
}
```
- [ ] **4. Rodar e ver passar**, gate da fase 1 completo + commit (`feat(ds): primitivas CVA — Button, Card, Badge, StatTile`).

---

## Fase 2 — Migração das telas claras (tabela de mapeamento como contrato)

Cada task: substituir hardcoded→token/primitiva **lendo cada ocorrência** (a tabela decide), rodar gate completo, commitar. Sem mudança de layout, espaçamento ou copy — só famílias de cor e extração de primitivas onde o markup é idêntico ao da primitiva.

### Task 6: AppShell + AppSidebar
- [ ] `bg-slate-100`→`bg-app-inset`, `text-slate-900`→`text-strong`, bordas→`line`, painéis `bg-slate-900`→`bg-ink`.
- [ ] Gate + conferência visual (smoke layout é o guarda-chuva).
- [ ] Commit (`refactor(ds): AppShell/Sidebar em tokens`).

### Task 7: DashboardScreen
- [ ] Badges de status (`emerald/amber/rose` pills) → `<Badge tone=…>`; pares valor/rótulo (`CapStat`, `AuditFact` internos) → `StatTile` onde o markup bater; cards `bg-white rounded-3xl…` → `<Card>`; famílias de texto→tokens. `toneStyles` do `SummaryBubble` migra para variantes de Badge/Card.
- [ ] Gate + commit.

### Task 8: History + AssessmentWorkspace (+ assessment/*)
- [ ] Mesmo contrato da Task 7 (as três `assessment/*` incluídas).
- [ ] Gate + commit.

### Task 9: Settings + Library + Consent + QuickContextForm + RecallQuiz + CaptureValiditySummary + CalibrationReusePrompt + Diagnostics*
- [ ] Mesmo contrato; inputs/selects de Settings ganham `bg-surface-sunken border-line-strong text-strong`.
- [ ] Gate + commit.

---

## Fase 3 — Superfície escura (chrome neutro apenas)

### Task 10: Player + EyeTrackingTest + CalibrationOverlay + ExerciseCanvas
- [ ] Migrar **somente** chrome neutro (fundos `bg-slate-900/950` de containers, textos `slate-300/400`) para os tokens (`bg-ink`/`text-mild` já resolvem, pois no dark são as mesmas famílias).
- [ ] **Proibido tocar:** `ring-amber-400/70` (drift), `bg-red-500/90` (cabeça instável), cores desenhadas no canvas, dot azul/âmbar, `bg-blue-600` dos CTAs da superfície escura.
- [ ] Gate + commit.

---

## Fase 4 — Toggle de tema

### Task 11: Toggle em Settings
- [ ] Bloco "Tema do aplicativo" em `SettingsScreen.tsx` usando `getTheme()/setTheme()`; select claro/escuro (sem "auto" na v1 — `resolveTheme` já cobre fallback quando nada salvo).
- [ ] Smoke: rodar suite completa nos dois temas não é automatizável hoje — validação dark é manual (tablet/desktop), registrada como REVISAO SUGERIDA.
- [ ] Gate + commit (`feat(ds): dark mode com toggle em Settings`).

## Riscos & detecção precoce

- **Asserções do smoke em classes/layout** → rodar smoke a cada task de migração, não só no fim; qualquer falha aponta a task exata.
- **Drift visual no claro** → tokens referenciam a mesma paleta; se algum tom divergir, é erro de mapeamento na tabela (conferir lado a lado no browser).
- **Budget gzip** → medir no gate da Fase 1 (deps novas); esperado ≤ 92k/180k.
- **Dark mode em telas não migradas** → até a Fase 2 terminar, o toggle não entra (Task 11 é a última de propósito).

## Verificação final

Gate completo + deploy (`sudo systemctl restart linhafixa.service`) **só após revisão de Anders**, com conferência manual dark/claro no tablet e iPhone.

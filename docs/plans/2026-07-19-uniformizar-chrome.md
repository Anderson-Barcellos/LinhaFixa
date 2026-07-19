# BUNDLE A "Uniformizar chrome" — todas as seções dentro do AppShell

> **Status 2026-07-19: EXECUTADO (as-built).** Tasks 1-5 completas. Gate: lint ✓, 290/290 tests (+2), build ok, smoke 108L+72V+7WF+43LD (heading "Estatísticas" preservado). HomeScreen deletado via `git rm` (staged). Aguardando revisão do Anders; sem commit e sem deploy.

**Data:** 2026-07-19 · **Execução:** inline (Claude, sem subagentes) · **PACK:** Frontend pós-Codex (frente B "Estatísticas+" fica em alto nível na fila)

## Contexto

Só `/assessment` e `/history` usam o `AppShell`; `/dashboard`, `/settings` e `/library` ficaram no layout antigo (header próprio + seta pra `/`, que redireciona pra `/assessment`). O sidebar novo aponta pra dentro do layout antigo. Extras: `HomeScreen.tsx` é código morto (sem rota/import); aba "Hoje" (`/`) duplica "Avaliação" via redirect; cards da Biblioteca têm descrição placeholder idêntica.

**Restrição de smoke:** `scripts/smoke-loading.mjs:38` exige heading "Estatísticas" na rota `/dashboard` — o título da página permanece "Estatísticas" (a aba do sidebar segue "Progresso", distinção já testada em `assessmentShell.test.ts:13`).

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/services/appSections.test.ts` | Criar | Contrato: hrefs únicos e nenhum apontando pro redirect `/` |
| `src/services/appSections.ts` | Modificar | Remover seção `home` |
| `src/components/app/AppSidebar.tsx` | Modificar | Remover ícone `home` (satisfies exige simetria) |
| `src/screens/DashboardScreen.tsx` | Modificar | Envolver no AppShell; header antigo sai, botão Exportar fica |
| `src/screens/SettingsScreen.tsx` | Modificar | Envolver no AppShell |
| `src/screens/ExerciseLibraryScreen.tsx` | Modificar | AppShell + descrições reais por exercício |
| `src/screens/HomeScreen.tsx` | **Deletar** | Código morto (nenhuma rota/import; recuperável via git) |

### Task 1: Contrato das seções (TDD) + remover "Hoje"

- [ ] **1. Teste que falha** (`src/services/appSections.test.ts`):
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SECTIONS } from './appSections.ts';

test('nenhuma seção aponta pra rota-redirect "/"', () => {
  assert.equal(APP_SECTIONS.some(s => s.href === '/'), false);
});
test('hrefs das seções são únicos', () => {
  const hrefs = APP_SECTIONS.map(s => s.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});
```
- [ ] **2. Ver falhar** — `node --import tsx --test src/services/appSections.test.ts` (primeiro teste falha: `home` → `/`)
- [ ] **3.** Remover `{ id: 'home', ... }` de `appSections.ts` e `home: House` (+ import `House`) de `AppSidebar.tsx`.
- [ ] **4. Ver passar** + `npm run lint`.

### Task 2: Dashboard no AppShell

- [ ] Trocar o wrapper (`DashboardScreen.tsx:160-175`): `<div className="min-h-screen..."><div className="max-w-5xl">` + header com seta → `<AppShell currentPath={...} title="Estatísticas" subtitle="Histórico de treinos, capturas e sintomas.">`. Botão "Exportar Histórico (JSON)" vira linha própria no topo do conteúdo (`flex justify-end mb-6`). Imports: `AppShell`, `useLocation`; remover `ArrowLeft`/`navigate('/')` do header (navigate segue usado? conferir — se não, remover import).
- [ ] Gate: `npm run lint`.

### Task 3: Settings no AppShell

- [ ] Mesmo padrão (`SettingsScreen.tsx:57-65`): título "Ajustes & Perfil", subtitle curto; conteúdo (card `bg-white p-8...`) vira filho direto. Early-return da calibração permanece fora do shell (overlay fullscreen).
- [ ] Gate: `npm run lint`.

### Task 4: Biblioteca no AppShell + descrições reais

- [ ] Mesmo padrão; descrições por exercício num `Record<string, string>`:
  - `fixation`: "Sustentar o olhar num alvo fixo — mede estabilidade da fixação."
  - `saccades`: "Saltos rápidos entre alvos alternados — mede latência e precisão sacádica."
  - `smooth_pursuit`: "Seguir um alvo em movimento contínuo — mede perseguição suave."
  - `assistedReading`: "Leitura guiada por trechos — mede sacadas e regressões no texto."
- [ ] Gate: `npm run lint`.

### Task 5: Deletar HomeScreen morto + gate final

- [ ] `rm src/screens/HomeScreen.tsx` (verificado: zero imports/rotas).
- [ ] Gate: `npm run lint` && `npm test` && `APP_BASE_PATH=/gaze npm run build` && `npm run smoke`.

## Riscos

- Smoke-loading do `/dashboard` depende do heading "Estatísticas" — mantido no title do AppShell.
- `satisfies Record<...>` no `SECTION_ICONS` quebra se remover a seção sem remover o ícone — Task 1 faz os dois juntos.
- AppShell muda o fundo de `bg-slate-50` pra `bg-slate-100` nessas telas — cosmético esperado, cards brancos continuam legíveis.

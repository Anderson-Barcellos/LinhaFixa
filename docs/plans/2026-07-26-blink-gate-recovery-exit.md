# Blink Gate Recovery Exit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O blink gate deve reabrir logo após a pálpebra reabrir de verdade, em vez de cobrar 500ms fixos de toda piscada quando o baseline de repouso fica entre exit (0.25) e enter (0.5).

**Architecture:** Nova saída do estado `closed` por *recuperação estável*: score contínuo abaixo do enter por `BLINK_RECOVERY_STABLE_MS` (120ms) prova reabertura palpebral e transita para `hold` — sem depender do exit threshold que um baseline elevado (0.29) nunca cruza. `MAX_BLINK_MS=500` permanece como backstop para score errático oscilando em torno do enter. Nenhuma mudança de API: `update(score, tMs)` e consumidores (CalibrationOverlay, ExerciseCanvas, useCameraPipeline) intocados.

**Tech Stack:** TypeScript, node:test (runner do projeto: `npm test`), tsx.

## Global Constraints

- Todas as janelas do gate em **ms, nunca em frames** (fps-independência é invariante do módulo — comentário de topo de `blinkGate.ts`).
- Compatibilidade integral com os 10 testes existentes de `src/services/blinkGate.test.ts` (verificada assert a assert na fase de plano).
- Execução na `main`, fluxo estabelecido do projeto (12 últimos commits diretos na main; deploy é etapa separada via `linhafixa.service`).
- Gate do projeto: `npm test` (445 testes) + `npx tsc --noEmit` limpos antes de cada commit.

---

### Task 1: Saída por recuperação estável no blink gate

**Files:**
- Modify: `src/services/blinkGate.ts` (estado `closed`, linhas 48-59; constantes no topo; `reset` e transições para `closed`)
- Test: `src/services/blinkGate.test.ts`

**Interfaces:**
- Consumes: `createBlinkGateTracker(opts)`, `isBlinking(score, enter)` de `./faceTracking` (já importado).
- Produces: `BLINK_RECOVERY_STABLE_MS = 120` (export novo), `BlinkGateOptions.recoveryStableMs?: number` (opção nova). Nenhuma assinatura existente muda.

- [x] **Step 1: Escrever os testes vermelhos**

Acrescentar ao final dos testes de tracker em `src/services/blinkGate.test.ts` (antes do teste de `purgeLeadingBlinkSamples`), e adicionar `BLINK_RECOVERY_STABLE_MS` ao import de `./blinkGate`:

```ts
test('stable recovery below enter reopens the gate well before MAX_BLINK_MS', () => {
  // Regressão de 25/07: com baseline 0.29 (entre exit e enter), a única saída era
  // a por duração, avaliada só após MAX_BLINK_MS — toda piscada custava ~667ms.
  // Contrato: score estável abaixo do enter por BLINK_RECOVERY_STABLE_MS prova a
  // reabertura palpebral e arma o hold, sem esperar o backstop.
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);                                  // piscada real
  assert.equal(gate.update(0.29, 200), true);           // recuperação começa: ainda rejeita
  // Estabilidade completa neste frame → hold armado (ainda rejeita durante o hold)
  assert.equal(gate.update(0.29, 200 + BLINK_RECOVERY_STABLE_MS), true);
  const reopenAt = 200 + BLINK_RECOVERY_STABLE_MS + BLINK_HOLD_MS + 1;
  assert.ok(reopenAt < MAX_BLINK_MS, 'o contrato exige reabertura antes do backstop');
  assert.equal(gate.update(0.29, reopenAt), false);     // reaberto — sem pagar os 500ms
});

test('a score bouncing back above enter resets the recovery stability window', () => {
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);
  gate.update(0.29, 100);                               // recuperação começa (janela em 100)
  gate.update(0.6, 150);                                // voltou a fechar: janela descartada
  assert.equal(gate.update(0.29, 200), true);           // nova janela começa em 200
  // 100ms depois: janela nova (200) ainda não fecha os 120ms — segue rejeitando
  assert.equal(gate.update(0.29, 200 + BLINK_RECOVERY_STABLE_MS - 20), true);
  // Janela nova completa + hold → reabre
  gate.update(0.29, 200 + BLINK_RECOVERY_STABLE_MS);
  assert.equal(gate.update(0.29, 200 + BLINK_RECOVERY_STABLE_MS + BLINK_HOLD_MS + 1), false);
});
```

- [x] **Step 2: Rodar e confirmar que falham**

Run: `node --import tsx --test src/services/blinkGate.test.ts`
Expected: os dois testes novos FAIL (o primeiro em `update(0.29, 320) === true` porém reabertura em 421 devolve `true`; import de `BLINK_RECOVERY_STABLE_MS` falha antes disso — erro de símbolo inexistente já é o vermelho); os 10 existentes PASS.

- [x] **Step 3: Implementação mínima**

Em `src/services/blinkGate.ts`:

Constante nova após `MAX_BLINK_MS` (linha 14):

```ts
// Estabilidade mínima de score abaixo do enter para aceitar que a pálpebra
// reabriu. Necessária porque um baseline de repouso entre exit e enter (0.29
// acontece) nunca cruza o exit — sem ela, toda piscada custaria maxBlinkMs
// inteiro. ~4 frames a 30fps; em ms, não frames, como todas as janelas daqui.
export const BLINK_RECOVERY_STABLE_MS = 120;
```

Opção nova em `BlinkGateOptions`:

```ts
export interface BlinkGateOptions {
  enterThreshold?: number;
  exitThreshold?: number;
  holdMs?: number;
  maxBlinkMs?: number;
  recoveryStableMs?: number;
  enabled?: boolean;
}
```

Em `createBlinkGateTracker`, ler a opção junto das demais e acrescentar o rastreio da janela de estabilidade:

```ts
  const recoveryStableMs = opts.recoveryStableMs ?? BLINK_RECOVERY_STABLE_MS;
```

```ts
  let state: 'open' | 'closed' | 'hold' = 'open';
  let holdUntil = 0;
  let closedSince = 0;
  let belowEnterSince: number | null = null;
```

Estado `closed` reescrito (substitui o bloco atual das linhas 48-60):

```ts
      if (state === 'closed') {
        // Fail-open só para ENTRAR: um null no meio da piscada vira hold, não reabertura.
        if (score == null || score <= exit) {
          state = 'hold'; holdUntil = tMs + holdMs; belowEnterSince = null;
        } else if (!isBlinking(score, enter)) {
          // Recuperação estável: o score saiu da zona de piscada e se manteve fora
          // por recoveryStableMs — a pálpebra reabriu, mesmo que o baseline (0.29
          // acontece) nunca cruze o exit. Sem esta saída, quem repousa entre exit
          // e enter pagaria maxBlinkMs inteiro em TODA piscada.
          if (belowEnterSince === null) belowEnterSince = tMs;
          const stableRecovery = tMs - belowEnterSince >= recoveryStableMs;
          // Backstop fisiológico: score oscilando em torno do enter nunca acumula
          // estabilidade; passado maxBlinkMs o que sobra é baseline, não piscada.
          const overdue = tMs - closedSince > maxBlinkMs;
          if (stableRecovery || overdue) {
            state = 'hold'; holdUntil = tMs + holdMs; belowEnterSince = null;
          }
        } else {
          belowEnterSince = null; // ainda piscando: janela de recuperação descartada
        }
        return true;
      }
```

Transições para `closed` zeram a janela — em `open` (linha 45) e em `hold` (linha 62):

```ts
        if (isBlinking(score, enter)) { state = 'closed'; closedSince = tMs; belowEnterSince = null; return true; }
```

(mesma linha nos dois estados), e no `reset`:

```ts
    reset() { state = 'open'; holdUntil = 0; closedSince = 0; belowEnterSince = null; },
```

- [x] **Step 4: Rodar a suite do módulo e confirmar verde**

Run: `node --import tsx --test src/services/blinkGate.test.ts`
Expected: 12/12 PASS (10 existentes + 2 novos).

- [x] **Step 5: Gate completo do projeto**

Run: `npm test` e `npx tsc --noEmit`
Expected: 447/447 PASS (445 + 2 novos), tsc sem erros.

- [x] **Step 6: Commit**

```bash
git add src/services/blinkGate.ts src/services/blinkGate.test.ts docs/plans/2026-07-26-blink-gate-recovery-exit.md
git commit -m "$(cat <<'EOF'
fix: reopen the blink gate on stable score recovery, not only on timeout

The duration exit added for elevated baselines (adba410) is only evaluated
after MAX_BLINK_MS, so for a resting score between exit and enter (0.29
happens) every blink cost a fixed ~667ms of discarded samples — 3-4x the
physiological blink. A score that left the blink zone and stayed out for
BLINK_RECOVERY_STABLE_MS (120ms) proves the eyelid reopened; the gate now
arms the hold from that evidence, keeping MAX_BLINK_MS as the backstop for
scores oscillating around the enter threshold.

Simulated cost for a 200ms blink at baseline 0.29: 667ms -> ~420ms closed.

TDD red->green; 447/447 tests, tsc clean.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Task 2: Verificação observável da regressão relatada

Sem commit — evidência de comportamento, espelhando a simulação que confirmou o diagnóstico.

- [x] **Step 1: Reexecutar a simulação de custo contra o código corrigido**

Run: `node --import tsx /tmp/claude-0/-root-Gaze/ef323506-75d1-4db0-a1c7-8ae6504fc583/scratchpad/blink-gate-sim.ts`
Expected: para baseline 0.29, gate fechado ≈433ms (piscada 150ms) e ≈467ms (200ms) — antes: 667ms fixos; piscada de 400ms permanece 667ms porque 400+120ms de estabilidade ultrapassa o backstop de 500ms, que então domina (desenho correto). Para baseline 0.15, valores inalterados (300-567ms — o caminho exit rápido não mudou). *Medido na execução de 26/07; a estimativa original (~420ms) não contava a granularidade de frame de 33ms a 30fps.*

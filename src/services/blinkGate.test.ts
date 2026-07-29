import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBlinkGateTracker,
  purgeLeadingBlinkSamples,
  BLINK_HOLD_MS,
  BLINK_LEADING_PURGE_MS,
  BLINK_RECOVERY_STABLE_MS,
  MAX_BLINK_MS,
} from './blinkGate';
import { commitDerivedBlinkThresholds, resetDerivedBlinkThresholds } from './blinkBaseline';

test('tracker enters rejection only above the strict enter threshold', () => {
  const gate = createBlinkGateTracker();
  assert.equal(gate.update(0.3, 0), false);   // abaixo de 0.5: aberto
  assert.equal(gate.update(0.5, 16), false);  // limite não é piscada (compat gate atual)
  assert.equal(gate.update(0.6, 33), true);   // entrou
});

test('hysteresis keeps rejecting between exit and enter thresholds', () => {
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);
  assert.equal(gate.update(0.4, 16), true);   // 0.25 < 0.4 < 0.5: segue rejeitando
  assert.equal(gate.update(0.3, 33), true);
});

test('temporal hold keeps rejecting for holdMs after the score drops', () => {
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);
  assert.equal(gate.update(0.1, 20), true);                       // caiu → hold armado
  assert.equal(gate.update(0.05, 20 + BLINK_HOLD_MS - 1), true);  // dentro do hold
  assert.equal(gate.update(0.05, 20 + BLINK_HOLD_MS + 1), false); // hold expirou
});

test('a new blink during hold re-enters rejection', () => {
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);
  gate.update(0.1, 20);              // hold
  assert.equal(gate.update(0.8, 40), true);
  assert.equal(gate.update(0.4, 60), true); // e a histerese vale de novo
});

test('an elevated resting baseline does not lock the gate closed forever', () => {
  // Rosto real do Anders: eyeBlink em repouso ~0.29, ACIMA do exit (0.25). Sem um
  // limite de duração, o estado 'closed' nunca reabre e todo frame vira descarte.
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);                                 // piscada de verdade
  assert.equal(gate.update(0.29, 100), true);          // dentro da piscada: rejeita
  // Passado o tempo máximo de uma piscada, com o score já abaixo do enter, o que
  // resta é baseline — não piscada. O gate arma o hold e volta a aceitar.
  assert.equal(gate.update(0.29, MAX_BLINK_MS + 1), true);
  assert.equal(gate.update(0.29, MAX_BLINK_MS + BLINK_HOLD_MS + 2), false);
});

test('a real blink still gets the full hysteresis before the duration limit', () => {
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);
  // Borda de descida dentro da janela fisiológica: histerese manda, ainda rejeita.
  assert.equal(gate.update(0.4, MAX_BLINK_MS - 50), true);
});

test('a score still above the enter threshold keeps rejecting past the limit', () => {
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);
  // Olho genuinamente fechado (score alto) não é baseline: o limite não reabre.
  assert.equal(gate.update(0.9, MAX_BLINK_MS + 1), true);
  assert.equal(gate.update(0.9, MAX_BLINK_MS * 3), true);
});

test('null score never starts a rejection (fail-open) but does not abort a blink', () => {
  const gate = createBlinkGateTracker();
  assert.equal(gate.update(null, 0), false);
  gate.update(0.9, 16);
  assert.equal(gate.update(null, 33), true); // null no meio da piscada → hold, não reabre
});

test('disabled tracker never rejects and reset clears state', () => {
  const off = createBlinkGateTracker({ enabled: false });
  assert.equal(off.update(0.99, 0), false);
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);
  gate.reset();
  assert.equal(gate.update(0.3, 16), false); // estado limpo: 0.3 não rejeita
});

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

test('gate criado ANTES do commit adota os limiares derivados no update seguinte', () => {
  // O gate do pipeline nasce antes da calibração existir: a resolução precisa
  // ser em tempo de update, não de criação.
  resetDerivedBlinkThresholds();
  const gate = createBlinkGateTracker();
  assert.equal(gate.update(0.45, 0), false);       // default: 0.45 < 0.5 não entra
  commitDerivedBlinkThresholds({ enter: 0.40, exit: 0.30 });
  assert.equal(gate.update(0.45, 16), true);       // derivado: 0.45 > 0.40 entra
  resetDerivedBlinkThresholds();
});

test('limiar explícito nas opções vence o derivado', () => {
  commitDerivedBlinkThresholds({ enter: 0.40, exit: 0.30 });
  const gate = createBlinkGateTracker({ enterThreshold: 0.7 });
  assert.equal(gate.update(0.5, 0), false);        // 0.5 < 0.7 explícito
  resetDerivedBlinkThresholds();
});

test('exit derivado acima do baseline reabre pelo caminho projetado', () => {
  // Critério de aceite 2 do spec: baseline 0.29 sai da piscada cruzando o exit
  // derivado (0.34), sem depender do backstop de recoveryStableMs.
  commitDerivedBlinkThresholds({ enter: 0.49, exit: 0.34 });
  const gate = createBlinkGateTracker();
  gate.update(0.9, 0);                              // piscada real
  assert.equal(gate.update(0.29, 40), true);        // 0.29 <= exit 0.34 → hold armado
  assert.equal(gate.update(0.29, 40 + BLINK_HOLD_MS + 1), false); // reaberto após o hold
  resetDerivedBlinkThresholds();
});

test('wasRisingEdge marca só o frame da transição aberto→fechado', () => {
  resetDerivedBlinkThresholds();
  const gate = createBlinkGateTracker();
  assert.equal(gate.update(0.3, 0), false);
  assert.equal(gate.wasRisingEdge(), false);
  assert.equal(gate.update(0.9, 16), true);
  assert.equal(gate.wasRisingEdge(), true);         // este frame é a borda
  assert.equal(gate.update(0.9, 33), true);
  assert.equal(gate.wasRisingEdge(), false);        // segue fechado, sem nova borda
  gate.reset();
  assert.equal(gate.wasRisingEdge(), false);
});

test('purgeLeadingBlinkSamples drops only the trailing window in place', () => {
  const samples = [{ t: 0 }, { t: 400 }, { t: 950 }, { t: 990 }];
  purgeLeadingBlinkSamples(samples, 1000, BLINK_LEADING_PURGE_MS);
  assert.deepEqual(samples, [{ t: 0 }, { t: 400 }]); // 950/990 estão nos últimos 80ms
});

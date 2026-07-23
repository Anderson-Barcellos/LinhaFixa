import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBlinkGateTracker,
  purgeLeadingBlinkSamples,
  BLINK_HOLD_MS,
  BLINK_LEADING_PURGE_MS,
} from './blinkGate';

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

test('purgeLeadingBlinkSamples drops only the trailing window in place', () => {
  const samples = [{ t: 0 }, { t: 400 }, { t: 950 }, { t: 990 }];
  purgeLeadingBlinkSamples(samples, 1000, BLINK_LEADING_PURGE_MS);
  assert.deepEqual(samples, [{ t: 0 }, { t: 400 }]); // 950/990 estão nos últimos 80ms
});

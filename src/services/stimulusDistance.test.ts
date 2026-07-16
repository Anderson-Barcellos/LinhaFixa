import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStimulusDistanceTracker } from './stimulusDistance';

test('freezes at the measured EMA once stable for the convergence window', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  let snap = tracker.snapshot();
  for (let t = 0; t <= 1200; t += 100) snap = tracker.update(55, t);
  assert.equal(snap.phase, 'frozen');
  assert.equal(snap.distanceSource, 'measured');
  assert.ok(Math.abs(snap.frozenDistanceCm! - 55) < 1);
  assert.equal(snap.distanceCm, snap.frozenDistanceCm);
});

test('uses the profile distance while stabilizing (no font jump before freeze)', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  const snap = tracker.update(60, 0);
  assert.equal(snap.phase, 'stabilizing');
  assert.equal(snap.distanceCm, 40);
  assert.equal(snap.distanceSource, null);
});

test('falls back to profile at the timeout when no face was ever measured', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 45 });
  tracker.update(null, 0);
  const snap = tracker.update(null, 3000);
  assert.equal(snap.phase, 'frozen');
  assert.equal(snap.distanceSource, 'profile');
  assert.equal(snap.frozenDistanceCm, 45);
});

test('freezes at the EMA at timeout when samples exist but never converged', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  // Rampa monotônica: a EMA sobe continuamente, o span da janela nunca fecha ≤5%,
  // então o freeze só pode vir do timeout de 3s (determinístico, sem depender da
  // atenuação da EMA sobre oscilações).
  let snap = tracker.snapshot();
  for (let t = 0; t <= 3000; t += 100) snap = tracker.update(40 + t / 50, t);
  assert.equal(snap.phase, 'frozen');
  assert.equal(snap.distanceSource, 'measured');
});

test('drift hysteresis: enters above 15%, stays between 12-15%, exits below 12%', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  let t = 0;
  for (; t <= 1200; t += 100) tracker.update(50, t);       // congela ~50
  let snap = tracker.snapshot();
  assert.equal(snap.phase, 'frozen');

  for (; t <= 5000; t += 100) snap = tracker.update(60, t); // 20% além → drift
  assert.equal(snap.inDrift, true);

  for (; t <= 9000; t += 100) snap = tracker.update(56.5, t); // ~13%: dentro da banda, mantém
  assert.equal(snap.inDrift, true);

  for (; t <= 13000; t += 100) snap = tracker.update(52, t); // 4% → sai do drift
  assert.equal(snap.inDrift, false);
});

test('accumulates max deviation and % of time in drift after freeze', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  let t = 0;
  for (; t <= 1200; t += 100) tracker.update(50, t);
  for (; t <= 4000; t += 100) tracker.update(65, t);        // fase em drift
  for (; t <= 8000; t += 100) tracker.update(50, t);        // volta
  const snap = tracker.snapshot();
  assert.ok(snap.maxDeviationPct >= 15, `max ${snap.maxDeviationPct}`);
  assert.ok(snap.driftTimePct > 0 && snap.driftTimePct < 100, `pct ${snap.driftTimePct}`);
});

test('frozen distance never changes after freezing (stimulus constancy contract)', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  let t = 0;
  for (; t <= 1200; t += 100) tracker.update(50, t);
  const frozen = tracker.snapshot().frozenDistanceCm;
  for (; t <= 6000; t += 100) tracker.update(90, t);
  assert.equal(tracker.snapshot().frozenDistanceCm, frozen);
  assert.equal(tracker.snapshot().distanceCm, frozen);
});

test('does not converge-freeze from null updates repeating a single sample', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  // One real sample, then nothing but nulls (face lost). A null update must not
  // re-push the same EMA into the convergence window — that would fake a flat,
  // "converged" span from a single stale/noisy reading.
  let snap = tracker.update(55, 0);
  for (let t = 100; t <= 2900; t += 100) snap = tracker.update(null, t);
  assert.equal(snap.phase, 'stabilizing');

  // The 3s timeout is untouched: with an EMA on record it still freezes 'measured'.
  snap = tracker.update(null, 3000);
  assert.equal(snap.phase, 'frozen');
  assert.equal(snap.distanceSource, 'measured');
});

test('rejects non-finite and non-positive samples', () => {
  const tracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  let snap = tracker.update(NaN, 0);
  snap = tracker.update(-5, 100);
  snap = tracker.update(0, 200);
  assert.equal(snap.phase, 'stabilizing');
  assert.equal(snap.distanceSource, null);

  // Now feed genuinely valid samples: convergence proceeds as if the invalid
  // ones never happened (they never touched the EMA).
  for (let t = 300; t <= 1500; t += 100) snap = tracker.update(50, t);
  assert.equal(snap.phase, 'frozen');
  assert.ok(Math.abs(snap.frozenDistanceCm! - 50) < 1, `frozen ${snap.frozenDistanceCm}`);
});

test('hysteresis boundaries are strict: exactly 15% does not enter, exactly 12% does not exit', () => {
  // Enter boundary: feeding exactly 57.5 (15% above the 50cm freeze) makes the EMA
  // approach 57.5 asymptotically FROM BELOW, so dev stays < 15% forever — the
  // strict `>` on enter must never fire.
  const enterTracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  let t = 0;
  for (; t <= 1200; t += 100) enterTracker.update(50, t);
  assert.equal(enterTracker.snapshot().frozenDistanceCm, 50);
  let snap = enterTracker.snapshot();
  for (let i = 0; i < 100; i++) { t += 100; snap = enterTracker.update(57.5, t); }
  assert.equal(snap.inDrift, false);

  // Exit boundary: enter drift at 60, then switch to exactly 56 (12% above 50).
  // The EMA decays toward 56 asymptotically FROM ABOVE, so dev stays > 12% forever —
  // the strict `<` on exit must never fire.
  const exitTracker = createStimulusDistanceTracker({ profileDistanceCm: 40 });
  t = 0;
  for (; t <= 1200; t += 100) exitTracker.update(50, t);
  assert.equal(exitTracker.snapshot().frozenDistanceCm, 50);
  snap = exitTracker.snapshot();
  for (let i = 0; i < 30; i++) { t += 100; snap = exitTracker.update(60, t); }
  assert.equal(snap.inDrift, true);
  for (let i = 0; i < 100; i++) { t += 100; snap = exitTracker.update(56, t); }
  assert.equal(snap.inDrift, true);
});

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

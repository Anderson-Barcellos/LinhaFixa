import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cameraStopInterruptionReason, canBeginCaptureCalibration, createCaptureLifecycleLock } from './captureLifecycle';

test('canBeginCaptureCalibration blocks every recalibration path during an active capture', () => {
  assert.equal(canBeginCaptureCalibration({ capturing: true, cameraState: 'running' }), false);
  assert.equal(canBeginCaptureCalibration({ capturing: true, cameraState: 'idle' }), false);
});

test('canBeginCaptureCalibration preserves the existing idle/running camera policy outside capture', () => {
  assert.equal(canBeginCaptureCalibration({ capturing: false, cameraState: 'running' }), true);
  assert.equal(canBeginCaptureCalibration({ capturing: false, cameraState: 'idle' }), true);
  assert.equal(canBeginCaptureCalibration({ capturing: false, cameraState: 'starting' }), false);
  assert.equal(canBeginCaptureCalibration({ capturing: false, cameraState: 'unavailable' }), false);
});

test('capture lifecycle grants one owner and rejects double finish', () => {
  const lifecycle = createCaptureLifecycleLock();
  const owner = lifecycle.begin();
  assert.equal(typeof owner, 'number');
  assert.equal(lifecycle.begin(), null);
  assert.equal(lifecycle.finish(owner!), true);
  assert.equal(lifecycle.finish(owner!), false);
  assert.equal(lifecycle.activeOwner(), null);
});

test('hidden then visible never resumes or concatenates an interrupted capture', () => {
  const lifecycle = createCaptureLifecycleLock();
  const interruptedOwner = lifecycle.begin()!;
  assert.equal(lifecycle.finish(interruptedOwner), true);
  assert.equal(lifecycle.activeOwner(), null, 'visible transition has no owner to resume');

  const explicitRestartOwner = lifecycle.begin()!;
  assert.notEqual(explicitRestartOwner, interruptedOwner);
  assert.equal(lifecycle.finish(interruptedOwner), false, 'old owner cannot finish the new record');
  assert.equal(lifecycle.finish(explicitRestartOwner), true);
});

test('navigation teardown owns the active capture exactly once', () => {
  const lifecycle = createCaptureLifecycleLock();
  const owner = lifecycle.begin()!;
  assert.equal(lifecycle.finish(owner), true);
  assert.equal(lifecycle.finish(owner), false);
});

test('camera stop action labels only an active capture and the owner persists once', () => {
  const lifecycle = createCaptureLifecycleLock();
  assert.equal(cameraStopInterruptionReason(false), null);
  assert.equal(cameraStopInterruptionReason(true), 'camera-stopped-during-capture');
  const owner = lifecycle.begin()!;
  let persisted = 0;
  if (lifecycle.finish(owner)) persisted += 1;
  if (lifecycle.finish(owner)) persisted += 1;
  assert.equal(persisted, 1);
});

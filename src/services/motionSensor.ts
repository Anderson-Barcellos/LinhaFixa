export type MotionPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';
export type MotionStatus = 'unavailable' | 'stable' | 'moved' | 'shaking';
export type MotionConfidence = 'high' | 'medium' | 'low';

export interface MotionOrientation {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface MotionSnapshot {
  supported: boolean;
  permission: MotionPermissionState;
  active: boolean;
  timestamp: number | null;
  orientation: MotionOrientation | null;
  baseline: MotionOrientation | null;
  recentAcceleration: number | null;
  recentRotationRate: number | null;
}

export interface MotionQuality {
  status: MotionStatus;
  confidence: MotionConfidence;
  deltaDeg: number | null;
}

interface MagnitudeSample {
  t: number;
  value: number;
}

const SAMPLE_WINDOW_MS = 1000;
const SHAKE_ACCELERATION_THRESHOLD = 0.35;
const SHAKE_ROTATION_THRESHOLD = 20;
const MEDIUM_DELTA_THRESHOLD_DEG = 6;
const LOW_DELTA_THRESHOLD_DEG = 12;

let permissionState: MotionPermissionState = 'prompt';
let active = false;
let latestOrientation: MotionOrientation | null = null;
let latestTimestamp: number | null = null;
let baselineOrientation: MotionOrientation | null = null;
let accelerationSamples: MagnitudeSample[] = [];
let rotationSamples: MagnitudeSample[] = [];

export function normalizeAngleDeltaDeg(current: number, baseline: number): number {
  let delta = current - baseline;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

export function computeOrientationDeltaDeg(
  current: MotionOrientation | null,
  baseline: MotionOrientation | null,
): number | null {
  if (!current || !baseline) return null;
  const alpha = normalizeAngleDeltaDeg(current.alpha, baseline.alpha);
  const beta = current.beta - baseline.beta;
  const gamma = current.gamma - baseline.gamma;
  return round1(Math.hypot(alpha, beta, gamma));
}

export function classifyMotionQuality(input: {
  supported: boolean;
  permission: MotionPermissionState;
  active: boolean;
  current: MotionOrientation | null;
  baseline: MotionOrientation | null;
  recentAcceleration: number | null;
  recentRotationRate: number | null;
}): MotionQuality {
  if (!input.supported || input.permission === 'unsupported' || input.permission === 'denied' || !input.active || !input.current) {
    return { status: 'unavailable', confidence: 'low', deltaDeg: null };
  }

  const deltaDeg = computeOrientationDeltaDeg(input.current, input.baseline);
  const acceleration = input.recentAcceleration ?? 0;
  const rotation = input.recentRotationRate ?? 0;

  if (acceleration >= SHAKE_ACCELERATION_THRESHOLD || rotation >= SHAKE_ROTATION_THRESHOLD) {
    return { status: 'shaking', confidence: 'low', deltaDeg };
  }

  if (deltaDeg == null) {
    return { status: 'stable', confidence: 'medium', deltaDeg: null };
  }

  if (deltaDeg >= LOW_DELTA_THRESHOLD_DEG) {
    return { status: 'moved', confidence: 'low', deltaDeg };
  }

  if (deltaDeg >= MEDIUM_DELTA_THRESHOLD_DEG) {
    return { status: 'moved', confidence: 'medium', deltaDeg };
  }

  return { status: 'stable', confidence: 'high', deltaDeg };
}

export async function requestMotionPermissionFromGesture(): Promise<MotionPermissionState> {
  if (!isMotionSupported()) {
    permissionState = 'unsupported';
    return permissionState;
  }

  const motionCtor = (globalThis as any).DeviceMotionEvent;
  const orientationCtor = (globalThis as any).DeviceOrientationEvent;
  const requests: Promise<'granted' | 'denied'>[] = [];

  if (typeof motionCtor?.requestPermission === 'function') {
    requests.push(motionCtor.requestPermission());
  }
  if (typeof orientationCtor?.requestPermission === 'function') {
    requests.push(orientationCtor.requestPermission());
  }

  if (requests.length === 0) {
    permissionState = 'granted';
    return permissionState;
  }

  try {
    const results = await Promise.all(requests);
    permissionState = results.every(result => result === 'granted') ? 'granted' : 'denied';
  } catch {
    permissionState = 'denied';
  }

  return permissionState;
}

export function startMotionSensor(): void {
  if (!isMotionSupported() || active) return;
  window.addEventListener('deviceorientation', handleOrientation);
  window.addEventListener('devicemotion', handleMotion);
  active = true;
}

export function stopMotionSensor(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener('deviceorientation', handleOrientation);
    window.removeEventListener('devicemotion', handleMotion);
  }
  active = false;
}

export function getMotionSnapshot(): MotionSnapshot {
  return {
    supported: isMotionSupported(),
    permission: permissionState,
    active,
    timestamp: latestTimestamp,
    orientation: latestOrientation ? { ...latestOrientation } : null,
    baseline: baselineOrientation ? { ...baselineOrientation } : null,
    recentAcceleration: recentAverage(accelerationSamples),
    recentRotationRate: recentAverage(rotationSamples),
  };
}

export function setMotionBaseline(_label: 'calibration' = 'calibration'): void {
  baselineOrientation = latestOrientation ? { ...latestOrientation } : null;
}

export function getMotionQuality(): MotionQuality {
  const snapshot = getMotionSnapshot();
  return classifyMotionQuality({
    supported: snapshot.supported,
    permission: snapshot.permission,
    active: snapshot.active,
    current: snapshot.orientation,
    baseline: snapshot.baseline,
    recentAcceleration: snapshot.recentAcceleration,
    recentRotationRate: snapshot.recentRotationRate,
  });
}

function isMotionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'DeviceMotionEvent' in window || 'DeviceOrientationEvent' in window;
}

function handleOrientation(event: DeviceOrientationEvent): void {
  if (event.alpha == null || event.beta == null || event.gamma == null) return;
  latestOrientation = {
    alpha: event.alpha,
    beta: event.beta,
    gamma: event.gamma,
  };
  latestTimestamp = performance.now();
}

function handleMotion(event: DeviceMotionEvent): void {
  const now = performance.now();
  const acceleration = vectorMagnitude(event.acceleration);
  const rotation = rotationMagnitude(event.rotationRate);

  if (acceleration != null) {
    accelerationSamples.push({ t: now, value: acceleration });
    pruneSamples(accelerationSamples, now);
  }
  if (rotation != null) {
    rotationSamples.push({ t: now, value: rotation });
    pruneSamples(rotationSamples, now);
  }
  latestTimestamp = now;
}

function vectorMagnitude(v: DeviceMotionEventAcceleration | null): number | null {
  if (!v || v.x == null || v.y == null || v.z == null) return null;
  return Math.hypot(v.x, v.y, v.z);
}

function rotationMagnitude(v: DeviceMotionEventRotationRate | null): number | null {
  if (!v || v.alpha == null || v.beta == null || v.gamma == null) return null;
  return Math.hypot(v.alpha, v.beta, v.gamma);
}

function recentAverage(samples: MagnitudeSample[]): number | null {
  if (samples.length === 0) return null;
  return round2(samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length);
}

function pruneSamples(samples: MagnitudeSample[], now: number): void {
  while (samples.length && now - samples[0].t > SAMPLE_WINDOW_MS) {
    samples.shift();
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type CaptureCalibrationCameraState = 'idle' | 'starting' | 'running' | 'unavailable';

export function canBeginCaptureCalibration(input: {
  capturing: boolean;
  cameraState: CaptureCalibrationCameraState;
}): boolean {
  return !input.capturing
    && (input.cameraState === 'running' || input.cameraState === 'idle');
}

export interface CaptureLifecycleLock {
  begin(): number | null;
  finish(owner: number): boolean;
  activeOwner(): number | null;
}

export function createCaptureLifecycleLock(): CaptureLifecycleLock {
  let generation = 0;
  let owner: number | null = null;
  return {
    begin() {
      if (owner !== null) return null;
      generation += 1;
      owner = generation;
      return owner;
    },
    finish(candidate) {
      if (owner === null || candidate !== owner) return false;
      owner = null;
      return true;
    },
    activeOwner() {
      return owner;
    },
  };
}

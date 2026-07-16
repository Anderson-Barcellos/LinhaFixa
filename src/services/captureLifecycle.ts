export type CaptureCalibrationCameraState = 'idle' | 'starting' | 'running' | 'unavailable';

export function canBeginCaptureCalibration(input: {
  capturing: boolean;
  cameraState: CaptureCalibrationCameraState;
}): boolean {
  return !input.capturing
    && (input.cameraState === 'running' || input.cameraState === 'idle');
}

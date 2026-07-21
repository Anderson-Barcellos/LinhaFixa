import { suggestDeviceClass, type DeviceCapabilities } from './deviceClass';
import { currentOrientation, type OrientationKind } from './ocularSignalContract';

export interface MeasurementViewportSnapshot {
  height: number;
  orientation: OrientationKind;
}

export function measurementViewportSnapshot(input: {
  innerWidth: number;
  innerHeight: number;
  visualViewportHeight?: number | null;
}): MeasurementViewportSnapshot {
  const visibleHeight = input.visualViewportHeight ?? input.innerHeight;
  return {
    height: Math.max(1, Math.min(visibleHeight, input.innerHeight)),
    orientation: currentOrientation(input.innerWidth, input.innerHeight),
  };
}

export function requiresPhonePortrait(
  input: DeviceCapabilities,
): boolean {
  return suggestDeviceClass(input) === 'phone'
    && currentOrientation(input.width, input.height) === 'landscape';
}

import type { DeviceClass, DeviceClassSource, UserProfile } from '@/types';

export interface DeviceCapabilities {
  width: number;
  height: number;
  maxTouchPoints: number;
  coarsePointer: boolean;
}

export interface DeviceClassDecision {
  deviceClass: DeviceClass;
  deviceClassSource: Extract<DeviceClassSource, 'confirmed' | 'suggested'>;
  trendEligible: boolean;
}

export function suggestDeviceClass(input: DeviceCapabilities): DeviceClass {
  const shortestSide = Math.min(input.width, input.height);
  const touchLike = input.maxTouchPoints > 0 || input.coarsePointer;
  if (!touchLike) return 'desktop';
  if (shortestSide <= 480) return 'phone';
  return 'tablet';
}

export function resolveDeviceClass(
  profile: Pick<UserProfile, 'deviceClass' | 'deviceClassSource'> | null | undefined,
  capabilities: DeviceCapabilities,
): DeviceClassDecision {
  if (profile?.deviceClass && profile.deviceClassSource === 'confirmed') {
    return {
      deviceClass: profile.deviceClass,
      deviceClassSource: 'confirmed',
      trendEligible: true,
    };
  }
  return {
    deviceClass: suggestDeviceClass(capabilities),
    deviceClassSource: 'suggested',
    trendEligible: false,
  };
}

export function confirmDeviceClass(deviceClass: DeviceClass): {
  deviceClass: DeviceClass;
  deviceClassSource: 'confirmed';
} {
  return { deviceClass, deviceClassSource: 'confirmed' };
}

export function inferLegacyDeviceClass(input: {
  layoutMode: unknown;
  viewport?: { width?: unknown; height?: unknown };
}): { deviceClass: DeviceClass; deviceClassSource: 'legacy-inferred' } | null {
  const width = input.viewport?.width;
  const height = input.viewport?.height;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  const shortestSide = Math.min(width, height);
  if (input.layoutMode === 'desktop' && Math.max(width, height) >= 1024) {
    return { deviceClass: 'desktop', deviceClassSource: 'legacy-inferred' };
  }
  if (input.layoutMode !== 'compact') return null;
  if (shortestSide <= 480) {
    return { deviceClass: 'phone', deviceClassSource: 'legacy-inferred' };
  }
  if (shortestSide >= 768) {
    return { deviceClass: 'tablet', deviceClassSource: 'legacy-inferred' };
  }
  return null;
}

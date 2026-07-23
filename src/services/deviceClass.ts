import type { DeviceClass, DeviceClassSource, UserProfile } from '@/types';
import { DEFAULT_DISTANCE_CM } from './viewingDistance';

// Distância de visualização média (cm) por classe de dispositivo. Esse valor ancora
// a calibração do IPD (CalibrationOverlay) e serve de fallback do stimulus-distance
// quando a medição ao vivo não converge — logo, é a escala de referência do ângulo
// visual, não um mero placeholder. Desktop ~60cm é a referência da literatura webcam
// (50–70cm); phone 33 / tablet 45 vêm da ergonomia geral de leitura por aparelho.
const DEVICE_CLASS_VIEWING_DISTANCE_CM: Record<DeviceClass, number> = {
  phone: 33,
  tablet: 45,
  desktop: 60,
};

export function defaultViewingDistanceCm(deviceClass: DeviceClass | undefined | null): number {
  if (!deviceClass) return DEFAULT_DISTANCE_CM;
  return DEVICE_CLASS_VIEWING_DISTANCE_CM[deviceClass];
}

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

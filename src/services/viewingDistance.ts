const DEFAULT_DISTANCE_CM = 40;
const MIN_DISTANCE_CM = 20;
const MAX_DISTANCE_CM = 120;

export function normalizeViewingDistanceInput(value: string): string {
  return value.replace(/[^\d]/g, '');
}

export function clampViewingDistanceCm(value: string | number): number {
  const parsed = typeof value === 'number'
    ? value
    : Number.parseInt(normalizeViewingDistanceInput(value), 10);

  if (!Number.isFinite(parsed)) return DEFAULT_DISTANCE_CM;
  return Math.min(MAX_DISTANCE_CM, Math.max(MIN_DISTANCE_CM, Math.round(parsed)));
}

export function viewingDistanceInputValue(value: number | undefined): string {
  return String(clampViewingDistanceCm(value ?? DEFAULT_DISTANCE_CM));
}

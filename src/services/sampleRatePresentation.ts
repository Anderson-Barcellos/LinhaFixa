export function formatSampleRateHz(
  value: number | null | undefined,
  fallback = 'N/D',
): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} Hz`;
}

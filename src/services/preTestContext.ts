import { PreTestContext } from '@/types';

// Latest context tagged today across any record source (sessions from the
// player, validation captures from /assessment). Pure so it's testable without idb.
export function selectTodayPreContext(
  entries: Array<{ timestamp: number; context?: PreTestContext | null }>,
  now: Date = new Date(),
): PreTestContext | null {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  let best: { timestamp: number; context: PreTestContext } | null = null;
  for (const e of entries) {
    if (e.timestamp < startOfDay.getTime() || !e.context) continue;
    if (!best || e.timestamp > best.timestamp) best = { timestamp: e.timestamp, context: e.context };
  }
  return best?.context ?? null;
}

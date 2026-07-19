// Pure server-side guards for the OpenAI proxy endpoints in server.ts.
// No Express, no timers — everything takes explicit inputs so it stays testable.

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
}

export interface RateCheckResult {
  allowed: boolean;
  retryAfterSec?: number;
}

// Sliding-window limiter, in-memory per key (IP). Blocked hits are not
// recorded, so a client hammering while blocked doesn't extend its own ban.
export function createRateLimiter({ limit, windowMs }: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  function check(key: string, nowMs: number = Date.now()): RateCheckResult {
    const cutoff = nowMs - windowMs;
    const recent = (hits.get(key) ?? []).filter(t => t > cutoff);
    if (recent.length >= limit) {
      hits.set(key, recent);
      const oldest = recent[0];
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000)) };
    }
    recent.push(nowMs);
    hits.set(key, recent);
    return { allowed: true };
  }

  return { check };
}

export interface ClampOptions {
  min: number;
  max: number;
  fallback: number;
}

// Non-finite or ≤0 inputs fall back; numeric strings are accepted because the
// JSON body may carry the duration as a string.
export function clampDurationSec(value: unknown, { min, max, fallback }: ClampOptions): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Non-strings become '' so prompt interpolation never sees "[object Object]".
export function capText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxChars);
}

// Anything ≠ 'facil' is treated as 'dificil' — mirrors server.ts behavior.
export function normalizeComplexity(value: unknown): 'facil' | 'dificil' {
  return value === 'facil' ? 'facil' : 'dificil';
}

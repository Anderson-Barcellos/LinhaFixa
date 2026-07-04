import assert from 'node:assert/strict';
import test from 'node:test';
import { checkContextSafety } from './safety';
import { PreTestContext } from '@/types';

const base: PreTestContext = { venvanseTakenAt: '08:00', sleepHours: 7, mood: 3, feeling: 3 };

test('checkContextSafety blocks only the worst self-reported feeling', () => {
  const cases: { feeling: number; safe: boolean }[] = [
    { feeling: 1, safe: false },
    { feeling: 2, safe: true },
    { feeling: 3, safe: true },
    { feeling: 4, safe: true },
    { feeling: 5, safe: true },
  ];
  for (const { feeling, safe } of cases) {
    const verdict = checkContextSafety({ ...base, feeling });
    assert.equal(verdict.safe, safe, `feeling=${feeling}`);
    if (!safe) assert.match(verdict.reason ?? '', /péssimo/);
  }
});

test('low sleep, low mood or missed medication alone do not block (planner context, not gate)', () => {
  assert.equal(checkContextSafety({ ...base, sleepHours: 0 }).safe, true);
  assert.equal(checkContextSafety({ ...base, mood: 1 }).safe, true);
  assert.equal(checkContextSafety({ ...base, venvanseTakenAt: null }).safe, true);
});

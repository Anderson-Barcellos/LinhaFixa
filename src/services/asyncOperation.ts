export interface AsyncOperationGate {
  begin(): number;
  isCurrent(token: number): boolean;
  invalidate(): void;
  mount(): void;
  unmount(): void;
}

export function createAsyncOperationGate(): AsyncOperationGate {
  let generation = 0;
  let mounted = true;
  return {
    begin() {
      generation += 1;
      return generation;
    },
    isCurrent(token) {
      return mounted && token === generation;
    },
    invalidate() {
      generation += 1;
    },
    mount() {
      mounted = true;
    },
    unmount() {
      mounted = false;
      generation += 1;
    },
  };
}

export async function guardedAwait<T>(
  gate: AsyncOperationGate,
  token: number,
  promise: Promise<T>,
): Promise<{ current: true; value: T } | { current: false }> {
  const value = await promise;
  return gate.isCurrent(token) ? { current: true, value } : { current: false };
}

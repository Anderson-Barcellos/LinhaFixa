const RELOAD_AT_KEY = 'gaze:route-chunk-reload-at';
const RELOAD_COOLDOWN_MS = 30_000;

interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface RecoveryDependencies {
  now(): number;
  storage: RecoveryStorage;
  reload(): void;
}

export function isDynamicImportFailure(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(message);
}

export function createRouteChunkRecovery(deps: RecoveryDependencies) {
  let inMemoryReloadAt = 0;

  const readReloadAt = (): number => {
    try {
      const stored = Number(deps.storage.getItem(RELOAD_AT_KEY) ?? 0);
      return Number.isFinite(stored) ? Math.max(inMemoryReloadAt, stored) : inMemoryReloadAt;
    } catch {
      return inMemoryReloadAt;
    }
  };

  const rememberReloadAt = (timestamp: number): void => {
    inMemoryReloadAt = timestamp;
    try {
      deps.storage.setItem(RELOAD_AT_KEY, String(timestamp));
    } catch {
      // sessionStorage is optional; the in-memory guard still limits this runtime.
    }
  };

  const clearReloadAt = (): void => {
    inMemoryReloadAt = 0;
    try {
      deps.storage.removeItem(RELOAD_AT_KEY);
    } catch {
      // A successful route import must not fail because storage is unavailable.
    }
  };

  const tryReload = (error: unknown): boolean => {
    if (!isDynamicImportFailure(error)) return false;
    const now = deps.now();
    if (now - readReloadAt() < RELOAD_COOLDOWN_MS) return false;
    rememberReloadAt(now);
    deps.reload();
    return true;
  };

  return {
    tryReload,
    async load<T>(loader: () => Promise<T>): Promise<T> {
      try {
        const module = await loader();
        clearReloadAt();
        return module;
      } catch (error) {
        if (tryReload(error)) return new Promise<T>(() => {});
        throw error;
      }
    },
  };
}

let browserRecovery: ReturnType<typeof createRouteChunkRecovery> | null = null;

function getBrowserRecovery() {
  browserRecovery ??= createRouteChunkRecovery({
    now: () => Date.now(),
    storage: {
      getItem: key => window.sessionStorage.getItem(key),
      setItem: (key, value) => window.sessionStorage.setItem(key, value),
      removeItem: key => window.sessionStorage.removeItem(key),
    },
    reload: () => window.location.reload(),
  });
  return browserRecovery;
}

export function loadRouteModule<T>(loader: () => Promise<T>): Promise<T> {
  return getBrowserRecovery().load(loader);
}

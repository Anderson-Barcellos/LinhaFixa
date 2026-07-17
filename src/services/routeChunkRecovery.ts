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
  const tryReload = (error: unknown): boolean => {
    if (!isDynamicImportFailure(error)) return false;
    const previous = Number(deps.storage.getItem(RELOAD_AT_KEY) ?? 0);
    if (deps.now() - previous < RELOAD_COOLDOWN_MS) return false;
    deps.storage.setItem(RELOAD_AT_KEY, String(deps.now()));
    deps.reload();
    return true;
  };

  return {
    tryReload,
    async load<T>(loader: () => Promise<T>): Promise<T> {
      try {
        const module = await loader();
        deps.storage.removeItem(RELOAD_AT_KEY);
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
    storage: window.sessionStorage,
    reload: () => window.location.reload(),
  });
  return browserRecovery;
}

export function loadRouteModule<T>(loader: () => Promise<T>): Promise<T> {
  return getBrowserRecovery().load(loader);
}

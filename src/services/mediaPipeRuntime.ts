export type PreloadState = 'idle' | 'loading' | 'ready' | 'failed';

export function createRetryableSingleFlight<T>(load: () => Promise<T>) {
  let currentState: PreloadState = 'idle';
  let active: Promise<T> | null = null;
  let value: T | undefined;

  return {
    state: () => currentState,
    run(): Promise<T> {
      if (currentState === 'ready') return Promise.resolve(value as T);
      if (active) return active;
      currentState = 'loading';
      let pending: Promise<T>;
      try {
        pending = load();
      } catch (error) {
        pending = Promise.reject(error);
      }
      active = pending.then(
        result => {
          value = result;
          currentState = 'ready';
          return result;
        },
        error => {
          active = null;
          currentState = 'failed';
          throw error;
        },
      );
      return active;
    },
  };
}

const runtime = createRetryableSingleFlight(() => import('@mediapipe/tasks-vision'));

export const loadMediaPipeRuntime = () => runtime.run();
export const mediaPipeRuntimeState = () => runtime.state();

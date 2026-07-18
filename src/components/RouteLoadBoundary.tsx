import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isDynamicImportFailure } from '@/services/routeChunkRecovery';

interface Props { children: ReactNode }
interface State { error: unknown | null }

export class RouteLoadBoundary extends Component<Props, State> {
  declare readonly props: Readonly<Props>;
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isDynamicImportFailure(error)) console.warn('Lazy route failed to load.', info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (!isDynamicImportFailure(this.state.error)) throw this.state.error;
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-800">Atualização disponível</h1>
          <p className="mt-2 text-slate-600">Recarregue para abrir a versão atual do Gaze.</p>
          <button
            className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white"
            onClick={() => window.location.reload()}
          >
            Recarregar aplicação
          </button>
        </div>
      </main>
    );
  }
}

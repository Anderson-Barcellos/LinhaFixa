import { ArrowLeft, RotateCcw, Smartphone } from 'lucide-react';

export function PhonePortraitGate({ onExit }: { onExit: () => void }) {
  return (
    <section
      data-testid="phone-portrait-gate"
      aria-labelledby="phone-portrait-title"
      className="fixed inset-0 z-[80] flex h-[100dvh] w-[100dvw] overflow-hidden bg-slate-950 text-white"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      <div className="flex min-h-0 w-full flex-col p-3 sm:p-5">
        <header className="shrink-0">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-sm font-bold text-slate-100 hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Sair da sessão
          </button>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center py-2 text-center">
          <div className="flex max-w-xl items-center gap-5 rounded-[2rem] border border-indigo-300/25 bg-slate-900/90 px-5 py-4 shadow-2xl sm:px-8">
            <div className="relative hidden shrink-0 sm:block" aria-hidden="true">
              <Smartphone className="h-16 w-16 text-indigo-300" strokeWidth={1.6} />
              <RotateCcw className="absolute -bottom-1 -right-2 h-7 w-7 text-indigo-200" />
            </div>
            <div className="min-w-0 text-left">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">
                Medição no iPhone
              </p>
              <h1 id="phone-portrait-title" className="mt-1 text-xl font-bold sm:text-2xl">
                Gire para o modo retrato
              </h1>
              <p className="mt-2 text-sm leading-5 text-slate-300">
                Calibração, leitura e captura usam portrait no celular para preservar
                altura útil, enquadramento e geometria comparável.
              </p>
              <p className="mt-2 text-xs font-semibold text-indigo-200">
                Ao voltar para retrato, esta mesma sessão retoma automaticamente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

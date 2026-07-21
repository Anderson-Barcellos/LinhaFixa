import { BookOpenText, Camera, X } from 'lucide-react';

import { useModalDialog } from '@/hooks/useModalDialog';

export function AssessmentSetupPanel({
  latestSessionLabel,
  onStartCapture,
  onStartRecall,
  onWarmSession,
  onClose,
}: {
  latestSessionLabel: string | null;
  onStartCapture: () => void;
  onStartRecall: () => void;
  onWarmSession?: () => void;
  onClose: () => void;
}) {
  const dialogRef = useModalDialog({ open: true, onEscape: onClose });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm md:items-center md:p-6"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assessment-setup-title"
        tabIndex={-1}
        className="relative w-full max-w-2xl rounded-t-[2rem] border border-line-strong bg-surface p-6 shadow-2xl md:rounded-[2rem] md:p-8"
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
          Nova sessão
        </p>
        <h2 id="assessment-setup-title" className="mt-3 pr-12 text-2xl font-bold text-strong">
          Preparar nova sessão
        </h2>
        <p className="mt-2 text-sm font-medium text-mild">
          {latestSessionLabel ?? 'Sem capturas recentes salvas.'}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onPointerDown={onWarmSession}
            onFocus={onWarmSession}
            onClick={onStartCapture}
            className="flex min-h-28 items-start gap-4 rounded-2xl bg-ink p-5 text-left text-ink-foreground transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-400 motion-reduce:transition-none"
          >
            <Camera className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
            <span>
              <strong className="block">Captura simples</strong>
              <span className="mt-2 block text-sm leading-5 text-slate-300">
                Leitura ocular sem questionário posterior.
              </span>
            </span>
          </button>
          <button
            type="button"
            onPointerDown={onWarmSession}
            onFocus={onWarmSession}
            onClick={onStartRecall}
            className="flex min-h-28 items-start gap-4 rounded-2xl bg-accent p-5 text-left text-white transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 motion-reduce:transition-none"
          >
            <BookOpenText className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
            <span>
              <strong className="block">Ler e responder</strong>
              <span className="mt-2 block text-sm leading-5 text-indigo-100">
                Captura ocular vinculada a um teste de recall.
              </span>
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar preparação da sessão"
          className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full text-mild transition-colors hover:bg-app-inset hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

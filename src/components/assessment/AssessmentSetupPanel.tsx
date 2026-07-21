import { BookOpenText, Camera, X } from 'lucide-react';
import { useState } from 'react';

import { useModalDialog } from '@/hooks/useModalDialog';
import type { AssessmentMode } from '@/types';

export function AssessmentSetupPanel({
  latestSessionLabel,
  onStartCapture,
  onStartRecall,
  deviceClassConfirmed,
  suggestedDeviceLabel,
  onStartExploratory,
  onOpenSettings,
  onWarmSession,
  onClose,
}: {
  latestSessionLabel: string | null;
  onStartCapture: () => void;
  onStartRecall: () => void;
  deviceClassConfirmed: boolean;
  suggestedDeviceLabel: string;
  onStartExploratory: (mode: AssessmentMode) => void;
  onOpenSettings: () => void;
  onWarmSession?: () => void;
  onClose: () => void;
}) {
  const dialogRef = useModalDialog({ open: true, onEscape: onClose });
  const [selectedMode, setSelectedMode] = useState<AssessmentMode>('capture');

  const chooseMode = (mode: AssessmentMode) => {
    if (!deviceClassConfirmed) {
      setSelectedMode(mode);
      return;
    }
    if (mode === 'capture') onStartCapture();
    else onStartRecall();
  };

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
        className="relative max-h-[100svh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-[2rem] border border-line-strong bg-surface p-6 shadow-2xl md:rounded-[2rem] md:p-8"
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
            onClick={() => chooseMode('capture')}
            aria-pressed={!deviceClassConfirmed ? selectedMode === 'capture' : undefined}
            className={`flex min-h-28 items-start gap-4 rounded-2xl p-5 text-left text-ink-foreground transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-400 motion-reduce:transition-none ${
              !deviceClassConfirmed && selectedMode === 'capture'
                ? 'bg-ink ring-2 ring-accent'
                : 'bg-ink'
            }`}
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
            onClick={() => chooseMode('recall')}
            aria-pressed={!deviceClassConfirmed ? selectedMode === 'recall' : undefined}
            className={`flex min-h-28 items-start gap-4 rounded-2xl bg-accent p-5 text-left text-white transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 motion-reduce:transition-none ${
              !deviceClassConfirmed && selectedMode === 'recall' ? 'ring-2 ring-indigo-200' : ''
            }`}
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

        {!deviceClassConfirmed ? (
          <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <p className="text-sm font-semibold">
              Sugestão atual: {suggestedDeviceLabel}. Confirme a classe em Ajustes para uma sessão comparável.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onOpenSettings}
                className="rounded-xl border border-amber-400 px-4 py-2.5 text-sm font-bold hover:bg-amber-100"
              >
                Confirmar em Ajustes
              </button>
              <button
                type="button"
                onPointerDown={onWarmSession}
                onClick={() => onStartExploratory(selectedMode)}
                className="rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-800"
              >
                Executar como baseline exploratório
              </button>
            </div>
          </div>
        ) : null}

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

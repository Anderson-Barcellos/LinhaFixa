import React from 'react';

interface CalibrationReusePromptProps {
  reasons: string[];
  onRecalibrate: () => void;
  onContinueRaw: () => void;
}

export function CalibrationReusePrompt({
  reasons,
  onRecalibrate,
  onContinueRaw,
}: CalibrationReusePromptProps) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white">
      <div className="w-full max-w-2xl rounded-3xl border border-amber-400/30 bg-slate-800 p-8 md:p-12 shadow-2xl">
        <p className="text-sm font-bold uppercase tracking-widest text-amber-300 mb-3">
          Configuração alterada
        </p>
        <h2 className="text-3xl font-bold mb-4">Esta calibração não combina com a tela atual</h2>
        <p className="text-slate-300 text-lg mb-6">
          Para manter as medidas espaciais honestas, recalibre nesta configuração ou continue
          apenas com o sinal bruto exploratório da câmera.
        </p>
        <ul className="rounded-2xl bg-slate-950/40 border border-slate-700 p-5 mb-8 space-y-2 text-amber-100">
          {reasons.map(reason => <li key={reason}>• {reason}</li>)}
        </ul>
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={onRecalibrate}
            className="px-6 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold transition-colors"
          >
            Recalibrar agora
          </button>
          <button
            type="button"
            onClick={onContinueRaw}
            className="px-6 py-4 rounded-xl border border-slate-500 bg-slate-700 hover:bg-slate-600 font-bold transition-colors"
          >
            Continuar em modo bruto
          </button>
        </div>
      </div>
    </div>
  );
}

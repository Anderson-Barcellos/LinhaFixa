export function AssessmentSetupPanel({
  latestSessionLabel,
  onStartCapture,
  onStartRecall,
  onWarmSession,
}: {
  latestSessionLabel: string | null;
  onStartCapture: () => void;
  onStartRecall: () => void;
  onWarmSession?: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
        Preparacao
      </p>
      <h2 className="mt-3 text-2xl font-bold text-slate-900">
        Escolha como esta sessao vai acontecer
      </h2>
      <p className="mt-2 text-sm font-medium text-slate-500">
        {latestSessionLabel ?? 'Sem capturas recentes salvas.'}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onPointerDown={onWarmSession}
          onFocus={onWarmSession}
          onClick={onStartCapture}
          className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          Captura simples
        </button>
        <button
          type="button"
          onPointerDown={onWarmSession}
          onFocus={onWarmSession}
          onClick={onStartRecall}
          className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-500"
        >
          Ler e responder
        </button>
      </div>
    </section>
  );
}

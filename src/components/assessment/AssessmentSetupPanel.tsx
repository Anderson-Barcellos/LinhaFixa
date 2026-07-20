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
    <section className="rounded-[2rem] border border-line-strong bg-surface p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-faint">
        Preparacao
      </p>
      <h2 className="mt-3 text-2xl font-bold text-strong">
        Escolha como esta sessao vai acontecer
      </h2>
      <p className="mt-2 text-sm font-medium text-mild">
        {latestSessionLabel ?? 'Sem capturas recentes salvas.'}
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onPointerDown={onWarmSession}
          onFocus={onWarmSession}
          onClick={onStartCapture}
          className="rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-ink-foreground transition hover:bg-slate-800"
        >
          Captura simples
        </button>
        <button
          type="button"
          onPointerDown={onWarmSession}
          onFocus={onWarmSession}
          onClick={onStartRecall}
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-500"
        >
          Ler e responder
        </button>
      </div>
    </section>
  );
}

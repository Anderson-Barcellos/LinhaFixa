import type { ReactNode } from 'react';

import type { AssessmentStage } from '@/types';

export const SESSION_TITLES: Record<AssessmentStage, string> = {
  setup: 'Sessao pronta para iniciar',
  'loading-text': 'Preparando leitura',
  'text-ready': 'Leitura guiada',
  capturing: 'Captura em andamento',
  'generating-quiz': 'Gerando questionario',
  quiz: 'Questionario de recall',
  result: 'Resultado da sessao',
};

export function AssessmentSessionSurface({
  stage,
  text,
  blockReason,
  constrainedHeight = false,
  children,
}: {
  stage: AssessmentStage;
  text: string;
  blockReason: string | null;
  constrainedHeight?: boolean;
  children: ReactNode;
}) {
  if (constrainedHeight) {
    // Embedded (100dvh): o título de estágio vive no header único do workspace
    // (EyeTrackingTestScreen); aqui nenhum card/moldura — toda a altura é da sessão.
    return (
      <section className="flex h-full min-h-0 flex-col bg-slate-950 text-white">
        {blockReason ? (
          <p className="px-4 pt-2 text-sm font-medium text-amber-300">{blockReason}</p>
        ) : null}
        <div className="flex-1 min-h-0">{children}</div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-[2rem] border border-slate-800 bg-slate-950 text-white shadow-xl px-0 py-6 md:p-8 md:min-h-[720px]">
      <div className="mb-3 flex items-center justify-between gap-4 px-6 md:px-0">
        <div>
          <h1 className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
            Avaliacao
          </h1>
          <h2 className="mt-2 text-2xl font-bold">{SESSION_TITLES[stage]}</h2>
        </div>
      </div>
      <p className="mb-2 text-sm font-medium text-slate-300 px-6 md:px-0">{text}</p>
      {blockReason ? (
        <p className="mb-4 text-sm font-medium text-amber-300 px-6 md:px-0">{blockReason}</p>
      ) : null}
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

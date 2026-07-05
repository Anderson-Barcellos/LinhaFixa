import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toggleSection, type SectionId } from '@/services/diagnosticsAccordion';

export interface DiagnosticsSection {
  id: SectionId;
  title: string;
  /** Resumo vivo de 1 linha derivado de estado existente (fps, sinal, condição). */
  summary?: string;
  /** O card atual, sem alteração interna. */
  content: React.ReactNode;
}

// Acordeão da gaveta mobile: estado local, inicial fechado. Como o painel da
// gaveta só renderiza expandido (drawerLayout.panelOpen), o estado reseta
// sozinho a cada abertura — sem effect nem persistência. O resumo vivo no
// cabeçalho deixa a gaveta escaneável sem abrir card nenhum.
export function DiagnosticsAccordion({ sections }: { sections: DiagnosticsSection[] }) {
  const [open, setOpen] = useState<SectionId | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {sections.map(s => {
        const isOpen = open === s.id;
        const Chevron = isOpen ? ChevronDown : ChevronRight;
        return (
          <div key={s.id} className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
            <button
              onClick={() => setOpen(cur => toggleSection(cur, s.id))}
              aria-expanded={isOpen}
              data-testid={`accordion-${s.id}`}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5"
            >
              <Chevron className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="text-sm font-bold text-slate-200 shrink-0">{s.title}</span>
              {s.summary && (
                <span className="ml-auto min-w-0 truncate text-xs text-slate-400">{s.summary}</span>
              )}
            </button>
            {isOpen && <div className="px-2 pb-2">{s.content}</div>}
          </div>
        );
      })}
    </div>
  );
}

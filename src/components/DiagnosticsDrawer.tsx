import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { drawerLayout, type DrawerVariant } from '@/services/diagnosticsDrawerLayout';

interface DiagnosticsDrawerProps {
  variant: DrawerVariant;
  expanded: boolean;
  onToggle: () => void;
  /** Sempre visível na faixa colapsada (status do pipeline). */
  chips: React.ReactNode;
  /** Ações primárias fixas na faixa (Calibrar/Capturar) — um toque, sem abrir a gaveta. */
  actions?: React.ReactNode;
  /** Conteúdo do painel; só renderiza expandido. */
  children: React.ReactNode;
}

// Casca de layout controlada pelo pai: nenhum estado ou dado próprio. O painel
// expandido é overlay (ver diagnosticsDrawerLayout), então abrir/fechar a gaveta
// nunca move a superfície de leitura que fica ao lado/acima.
export function DiagnosticsDrawer({ variant, expanded, onToggle, chips, actions, children }: DiagnosticsDrawerProps) {
  const layout = drawerLayout(variant, expanded);
  const Chevron = variant === 'sheet'
    ? (expanded ? ChevronDown : ChevronUp)
    : (expanded ? ChevronRight : ChevronLeft);
  return (
    <aside className={layout.root}>
      {layout.panelOpen && (
        <div className={layout.panel} data-testid="drawer-panel">
          {children}
        </div>
      )}
      <div className={layout.strip}>
        {chips}
        {actions}
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Recolher diagnóstico' : 'Expandir diagnóstico'}
          className={`${variant === 'sheet' ? 'ml-auto' : 'mt-auto'} shrink-0 p-2 rounded-full bg-white/10 hover:bg-white/20`}
        >
          <Chevron className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}

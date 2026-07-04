export type DrawerVariant = 'sheet' | 'side';

export interface DrawerLayout {
  root: string;
  strip: string;
  panel: string;
  panelOpen: boolean;
}

// O invariante central do design: root e strip são idênticos nos dois estados —
// a faixa colapsada vive no fluxo flex e reserva espaço fixo, enquanto o painel
// expandido é overlay absoluto ancorado nela. Assim o rect da superfície de
// leitura (e a assinatura de calibração) nunca muda por causa da gaveta.
const LAYOUTS: Record<DrawerVariant, Omit<DrawerLayout, 'panelOpen'>> = {
  sheet: {
    root: 'relative w-full shrink-0 border-t border-white/10 bg-slate-800/80',
    strip: 'flex items-center gap-2 px-3 py-2 min-h-[56px]',
    panel: 'absolute bottom-full left-0 right-0 z-30 max-h-[60vh] overflow-y-auto border-t border-white/10 bg-slate-800/95 backdrop-blur p-4 flex flex-col gap-4',
  },
  side: {
    root: 'relative h-full shrink-0 border-l border-white/10 bg-slate-800/80',
    strip: 'flex flex-col items-center gap-2 px-1.5 py-3 h-full w-12',
    panel: 'absolute right-full top-0 bottom-0 z-30 w-80 overflow-y-auto border-l border-white/10 bg-slate-800/95 backdrop-blur p-4 flex flex-col gap-4',
  },
};

export function drawerLayout(variant: DrawerVariant, expanded: boolean): DrawerLayout {
  return { ...LAYOUTS[variant], panelOpen: expanded };
}

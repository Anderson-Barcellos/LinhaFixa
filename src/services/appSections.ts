export const APP_SECTIONS = [
  { id: 'home', label: 'Hoje', href: '/' },
  { id: 'training', label: 'Treino', href: '/player' },
  { id: 'assessment', label: 'Avaliacao', href: '/assessment' },
  { id: 'progress', label: 'Progresso', href: '/dashboard' },
  { id: 'history', label: 'Historico', href: '/dashboard?tab=history' },
  { id: 'settings', label: 'Configuracoes', href: '/settings' },
] as const;

export type AppSection = (typeof APP_SECTIONS)[number];

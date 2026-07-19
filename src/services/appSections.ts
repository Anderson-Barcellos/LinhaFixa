export const APP_SECTIONS = [
  { id: 'training', label: 'Treino', href: '/player', available: true },
  { id: 'assessment', label: 'Avaliacao', href: '/assessment', available: true },
  { id: 'progress', label: 'Progresso', href: '/dashboard', available: true },
  { id: 'history', label: 'Historico', href: '/history', available: true },
  { id: 'settings', label: 'Configuracoes', href: '/settings', available: true },
] as const;

export type AppSection = (typeof APP_SECTIONS)[number];

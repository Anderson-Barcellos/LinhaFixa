export const APP_SECTIONS = [
  { id: 'today', label: 'Hoje', href: '/assessment', available: true },
  { id: 'sessions', label: 'Sessões', href: '/history', available: true },
  { id: 'progress', label: 'Progresso', href: '/dashboard', available: true },
  { id: 'settings', label: 'Ajustes', href: '/settings', available: true },
] as const;

export type AppSection = (typeof APP_SECTIONS)[number];

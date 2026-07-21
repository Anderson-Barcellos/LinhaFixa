import {
  Activity,
  BookOpenText,
  ChartNoAxesCombined,
  Home,
  Settings,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { APP_SECTIONS } from '@/services/appSections';

const SECTION_ICONS = {
  today: Home,
  sessions: BookOpenText,
  progress: ChartNoAxesCombined,
  settings: Settings,
} satisfies Record<(typeof APP_SECTIONS)[number]['id'], typeof Home>;

function isSectionActive(currentPath: string, href: string): boolean {
  const currentUrl = new URL(currentPath, 'https://gaze.local');
  const targetUrl = new URL(href, 'https://gaze.local');

  if (targetUrl.search) {
    return (
      currentUrl.pathname === targetUrl.pathname
      && currentUrl.search === targetUrl.search
    );
  }

  return currentUrl.pathname === targetUrl.pathname;
}

export function AppSidebar({ currentPath }: { currentPath: string }) {
  return (
    <aside className="fixed inset-x-0 bottom-0 z-50 border-t border-line-strong bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur md:sticky md:top-0 md:h-[100svh] md:w-[9.25rem] md:self-start md:border-r md:border-t-0 md:p-3 md:shadow-none xl:w-[17.5rem] xl:p-6">
      <div className="hidden items-center gap-3 rounded-3xl bg-surface-sunken p-3 md:flex md:flex-col xl:flex-row">
        <Activity className="h-8 w-8 text-accent" aria-hidden="true" />
        <span className="hidden font-bold text-strong xl:inline">Linha Fixa</span>
      </div>

      <nav
        aria-label="Navegação principal"
        className="grid grid-cols-4 md:mt-6 md:grid-cols-1 md:gap-2"
      >
        {APP_SECTIONS.map(section => {
          const Icon = SECTION_ICONS[section.id];
          const active = isSectionActive(currentPath, section.href);
          return (
            <Link
              key={section.id}
              to={section.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 px-2 text-xs font-bold transition-colors motion-reduce:transition-none md:rounded-2xl md:py-3 xl:min-h-14 xl:flex-row xl:justify-start xl:gap-3 xl:px-4 xl:text-sm ${
                active
                  ? 'bg-ink text-ink-foreground'
                  : 'text-mild hover:bg-app-inset hover:text-strong'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{section.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

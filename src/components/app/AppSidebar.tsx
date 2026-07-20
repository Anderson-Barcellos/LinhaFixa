import {
  Activity,
  Clock3,
  Play,
  ScanEye,
  Settings,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { APP_SECTIONS } from '@/services/appSections';

const SECTION_ICONS = {
  training: Play,
  assessment: ScanEye,
  progress: TrendingUp,
  history: Clock3,
  settings: Settings,
} satisfies Record<(typeof APP_SECTIONS)[number]['id'], typeof Play>;

function isSectionActive(currentPath: string, href: string): boolean {
  const currentUrl = new URL(currentPath, 'https://gaze.local');
  const targetUrl = new URL(href, 'https://gaze.local');

  if (targetUrl.search) {
    return (
      currentUrl.pathname === targetUrl.pathname &&
      currentUrl.search === targetUrl.search
    );
  }

  return currentUrl.pathname === targetUrl.pathname;
}

export function AppSidebar({ currentPath }: { currentPath: string }) {
  return (
    <aside className="border-b border-line-strong bg-surface/95 p-3 shadow-sm md:min-h-screen md:border-b-0 md:border-r md:p-6">
      <div className="flex items-center gap-3 rounded-2xl border border-line-strong bg-surface-sunken px-3 py-2 md:rounded-3xl md:px-4 md:py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-ink-foreground md:h-11 md:w-11 md:rounded-2xl">
          <Activity className="h-4 w-4 md:h-5 md:w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mild">
            Linha Fixa
          </p>
          <p className="hidden text-sm font-semibold text-strong md:block">
            Navegacao clinica
          </p>
        </div>
      </div>

      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 md:mt-6 md:flex-col md:gap-3 md:overflow-visible md:pb-0">
        {APP_SECTIONS.map((section) => {
          const Icon = SECTION_ICONS[section.id];
          const active = isSectionActive(currentPath, section.href);
          const sharedClassName = `flex min-w-fit items-center gap-3 rounded-2xl px-3 py-2 md:px-4 md:py-3 text-sm font-semibold transition-colors ${
            active
              ? 'bg-ink text-ink-foreground shadow-sm'
              : 'bg-surface-sunken text-mild hover:bg-app-inset hover:text-strong'
          }`;

          if (!section.available) {
            return (
              <div
                key={section.id}
                aria-disabled="true"
                className="flex min-w-fit items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-sunken px-3 py-2 md:px-4 md:py-3 text-sm font-semibold text-faint"
              >
                <Icon className="h-4 w-4" />
                <span>{section.label}</span>
                <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
                  Em breve
                </span>
              </div>
            );
          }

          return (
            <Link
              key={section.id}
              to={section.href}
              className={sharedClassName}
            >
              <Icon className="h-4 w-4" />
              <span>{section.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 hidden rounded-3xl border border-line-strong bg-surface-sunken p-4 text-sm text-mild md:mt-10 md:block">
        <p className="font-semibold text-strong">Avaliacao primeiro</p>
        <p className="mt-2 leading-6">
          A shell nova organiza a entrada da avaliacao e encaminha para o
          workspace validado atual enquanto a integracao nativa ainda entra.
        </p>
      </div>
    </aside>
  );
}

import {
  Activity,
  Clock3,
  House,
  Play,
  ScanEye,
  Settings,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { APP_SECTIONS } from '@/services/appSections';

const SECTION_ICONS = {
  home: House,
  training: Play,
  assessment: ScanEye,
  progress: TrendingUp,
  history: Clock3,
  settings: Settings,
} satisfies Record<(typeof APP_SECTIONS)[number]['id'], typeof House>;

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
    <aside className="border-b border-slate-200 bg-white/95 p-4 shadow-sm md:min-h-screen md:border-b-0 md:border-r md:p-6">
      <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Linha Fixa
          </p>
          <p className="text-sm font-semibold text-slate-900">
            Navegacao clinica
          </p>
        </div>
      </div>

      <nav className="mt-6 flex gap-3 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
        {APP_SECTIONS.map((section) => {
          const Icon = SECTION_ICONS[section.id];
          const active = isSectionActive(currentPath, section.href);
          const sharedClassName = `flex min-w-fit items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
            active
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`;

          if (!section.available) {
            return (
              <div
                key={section.id}
                aria-disabled="true"
                className="flex min-w-fit items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400"
              >
                <Icon className="h-4 w-4" />
                <span>{section.label}</span>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
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

      <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 md:mt-10">
        <p className="font-semibold text-slate-900">Avaliacao primeiro</p>
        <p className="mt-2 leading-6">
          A shell nova organiza a entrada da avaliacao e encaminha para o
          workspace validado atual enquanto a integracao nativa ainda entra.
        </p>
      </div>
    </aside>
  );
}

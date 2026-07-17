import type { ReactNode } from 'react';

import { AppSidebar } from './AppSidebar';

export function AppShell({
  currentPath,
  title,
  subtitle,
  children,
}: {
  currentPath: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 md:grid md:grid-cols-[280px_minmax(0,1fr)]">
      <AppSidebar currentPath={currentPath} />
      <main className="min-w-0 p-4 md:p-8">
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">{subtitle}</p>
        </header>
        {children}
      </main>
    </div>
  );
}

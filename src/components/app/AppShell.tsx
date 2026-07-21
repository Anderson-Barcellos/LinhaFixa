import type { ReactNode } from 'react';

import { AppSidebar } from './AppSidebar';

export function AppShell({
  currentPath,
  title,
  subtitle,
  hideHeader = false,
  children,
}: {
  currentPath: string;
  title: string;
  subtitle: string;
  hideHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100svh] bg-app-inset pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-strong md:grid md:grid-cols-[9.25rem_minmax(0,1fr)] md:pb-0 xl:grid-cols-[17.5rem_minmax(0,1fr)]">
      <AppSidebar currentPath={currentPath} />
      <main className="min-w-0 p-4 md:p-6 xl:p-8">
        {!hideHeader ? (
          <header className="mb-5 md:mb-6">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
            <p className="mt-2 text-sm font-medium text-mild">{subtitle}</p>
          </header>
        ) : null}
        {children}
      </main>
    </div>
  );
}

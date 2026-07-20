import type { ReactNode } from 'react';
import { cn } from '@/ui/cn';

// O par valor+rótulo repetido em Dashboard/Player/History.
export const statTileClasses = {
  value: 'text-lg md:text-xl font-bold text-strong',
  label: 'text-xs md:text-sm text-faint font-medium mt-1',
} as const;

export function StatTile({ value, label, className }: { value: ReactNode; label: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className={statTileClasses.value}>{value}</div>
      <div className={statTileClasses.label}>{label}</div>
    </div>
  );
}

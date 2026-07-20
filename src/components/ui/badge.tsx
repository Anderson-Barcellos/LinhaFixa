import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/ui/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-sunken text-mild',
        accent: 'bg-accent-soft text-accent-strong',
        positive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
        caution: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
        alert: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
        postural: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

// Sem @types/react no projeto: atributos DOM via index signature (padrão da base).
export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  className?: string;
  [domAttr: string]: unknown;
}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

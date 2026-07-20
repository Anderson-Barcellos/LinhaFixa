import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/ui/cn';

export const cardVariants = cva('rounded-3xl border p-6 shadow-sm', {
  variants: {
    tone: {
      surface: 'bg-surface border-line',
      sunken: 'bg-surface-sunken border-line',
      accent: 'bg-accent-soft border-accent-line',
      positive: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950 dark:border-emerald-900',
      caution: 'bg-amber-50 border-amber-100 dark:bg-amber-950 dark:border-amber-900',
      alert: 'bg-rose-50 border-rose-100 dark:bg-rose-950 dark:border-rose-900',
    },
  },
  defaultVariants: { tone: 'surface' },
});

// Sem @types/react no projeto: atributos DOM via index signature (padrão da base).
export interface CardProps extends VariantProps<typeof cardVariants> {
  className?: string;
  [domAttr: string]: unknown;
}

export function Card({ className, tone, ...props }: CardProps) {
  return <div className={cn(cardVariants({ tone }), className)} {...props} />;
}

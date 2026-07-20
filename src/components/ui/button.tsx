import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/ui/cn';

// Variantes derivadas dos botões reais do app: primário ink (ex-slate-900),
// accent indigo (IA/ocular), outline claro e ghost discreto.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-ink-foreground hover:opacity-90',
        accent: 'bg-accent text-white hover:bg-accent-strong',
        outline: 'bg-surface border border-line-strong text-mild hover:bg-surface-sunken',
        ghost: 'text-faint hover:text-mild font-medium',
      },
      size: {
        sm: 'px-4 py-2 text-sm',
        md: 'px-6 py-3',
        lg: 'px-10 py-4 text-lg w-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

// Sem @types/react no projeto (React tipa como any), então os atributos DOM
// passam via index signature — o contrato tipado forte é variant/size/className.
export interface ButtonProps extends VariantProps<typeof buttonVariants> {
  className?: string;
  [domAttr: string]: unknown;
}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

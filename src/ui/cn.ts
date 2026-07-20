import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Única porta de merge de classes do app: clsx resolve condicionais,
// twMerge resolve conflitos de utility (p-2 + p-4 → p-4).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class lists safely: later classes win over earlier
 * conflicting ones (e.g. `cn('px-2', condition && 'px-4')` resolves to
 * `px-4`), which plain string concatenation cannot do.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

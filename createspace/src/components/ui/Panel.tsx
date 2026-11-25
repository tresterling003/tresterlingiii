import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** The big rounded container that holds tools and page content. */
export function Panel({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={cn('panel p-3.5 sm:p-6', className)}>
      {children}
    </section>
  );
}

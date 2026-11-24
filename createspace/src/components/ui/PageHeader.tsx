import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, actions, className }: Props) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-sm font-medium text-muted">{eyebrow}</div>}
        <h1 className="font-display text-[1.75rem] leading-tight font-bold sm:text-[2rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ title, count, actions, id }: { title: ReactNode; count?: number; actions?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 id={id} className="flex items-baseline gap-2 font-display text-lg font-semibold">
        {title}
        {count !== undefined && <span className="font-sans text-sm font-normal text-muted tabular-nums">{count}</span>}
      </h2>
      {actions}
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, children, actions, className }: Props) {
  return (
    <div
      role="status"
      className={cn(
        'flex animate-fade-in flex-col items-center rounded-lg border border-dashed border-line-strong px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-lg bg-surface-2 text-muted">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{children}</div>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

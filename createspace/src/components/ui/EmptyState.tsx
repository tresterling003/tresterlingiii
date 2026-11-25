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
        'flex animate-fade-in flex-col items-center rounded-[22px] border-2 border-dashed border-line px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-surface text-muted shadow-card">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-display text-lg">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{children}</div>}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

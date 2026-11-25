import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { STATUS } from '@/tools/status';
import type { ToolStatus } from '@/tools/types';

type Tone = 'neutral' | 'amber' | 'green' | 'blue' | 'outline';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface text-muted shadow-card',
  outline: 'border border-dashed border-line-strong text-muted',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200',
  green: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200',
  blue: 'bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-200',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusTone: Record<ToolStatus, Tone> = {
  'coming-soon': 'outline',
  'in-development': 'amber',
  beta: 'blue',
  available: 'green',
};

/** Always-visible label telling people whether a tool works yet. */
export function StatusBadge({ status, className }: { status: ToolStatus; className?: string }) {
  return (
    <Badge tone={statusTone[status]} className={className}>
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          status === 'coming-soon' ? 'bg-muted/60' : 'bg-current',
          status === 'in-development' && 'animate-pulse',
        )}
      />
      {STATUS[status].label}
    </Badge>
  );
}

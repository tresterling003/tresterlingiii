import { CATEGORIES } from '@/tools/categories';
import { TOOLS } from '@/tools/registry';
import type { CategoryId } from '@/tools/types';
import { cn } from '@/lib/cn';

interface Props {
  value: CategoryId | null;
  onChange: (value: CategoryId | null) => void;
  className?: string;
}

/** "All / Creative / Content / ..." chips. Counts are of all tools in each category. */
export function CategoryFilter({ value, onChange, className }: Props) {
  const options: Array<{ id: CategoryId | null; label: string; count: number }> = [
    { id: null, label: 'All', count: TOOLS.length },
    ...CATEGORIES.map((c) => ({ id: c.id, label: c.name, count: TOOLS.filter((t) => t.category === c.id).length })),
  ];

  return (
    <div
      role="group"
      aria-label="Filter by category"
      className={cn('-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0', className)}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors duration-150',
              active
                ? 'border-ink bg-ink text-ink-contrast'
                : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {opt.label}
            <span className={cn('text-xs tabular-nums', active ? 'opacity-70' : 'opacity-60')}>{opt.count}</span>
          </button>
        );
      })}
    </div>
  );
}

import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import type { ToolDefinition } from '@/tools/types';

const sizes = {
  sm: 'size-8 rounded-md [&_svg]:size-4',
  md: 'size-10 rounded-lg [&_svg]:size-5',
  lg: 'size-14 rounded-xl [&_svg]:size-7',
};

/** The tool's icon on a soft tile of its accent color. */
export function ToolIcon({ tool, size = 'md', className }: { tool: ToolDefinition; size?: keyof typeof sizes; className?: string }) {
  const Icon = tool.icon;
  return (
    <span
      aria-hidden="true"
      style={{ '--accent': tool.accent } as CSSProperties}
      className={cn(
        'grid shrink-0 place-items-center',
        'bg-[color-mix(in_oklab,var(--accent)_13%,transparent)] text-(--accent)',
        'dark:bg-[color-mix(in_oklab,var(--accent)_20%,transparent)] dark:text-[color-mix(in_oklab,var(--accent)_70%,white)]',
        sizes[size],
        className,
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  );
}

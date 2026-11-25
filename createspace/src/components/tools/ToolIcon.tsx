import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import type { ToolDefinition } from '@/tools/types';

const sizes = {
  sm: 'size-8 rounded-xl [&_svg]:size-4',
  md: 'size-11 rounded-2xl [&_svg]:size-5',
  lg: 'size-20 rounded-[22px] [&_svg]:size-9 sm:size-24 sm:[&_svg]:size-11',
};

/** The tool's icon on a soft tile of its accent color. */
export function ToolIcon({ tool, size = 'md', className }: { tool: ToolDefinition; size?: keyof typeof sizes; className?: string }) {
  const Icon = tool.icon;
  return (
    <span
      aria-hidden="true"
      style={{ '--accent': tool.accent } as CSSProperties}
      className={cn(
        'tile grid shrink-0 place-items-center tile-ink',
        sizes[size],
        className,
      )}
    >
      <Icon strokeWidth={2.3} fill="currentColor" fillOpacity={0.2} />
    </span>
  );
}

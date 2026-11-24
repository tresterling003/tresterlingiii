import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { getCategory } from '@/tools/categories';
import { cn } from '@/lib/cn';
import type { ToolDefinition } from '@/tools/types';
import { BookmarkButton } from './BookmarkButton';
import { ToolIcon } from './ToolIcon';

/**
 * One tool in a grid. The whole card is clickable (via the stretched title link),
 * while the bookmark button stays independently clickable on top.
 */
export function ToolCard({ tool }: { tool: ToolDefinition }) {
  const category = getCategory(tool.category);
  return (
    <article
      style={{ '--accent': tool.accent } as CSSProperties}
      className="group relative flex flex-col rounded-lg border border-line bg-surface p-4 shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--accent)_45%,var(--color-line))] hover:shadow-lift has-[a:focus-visible]:border-(--accent)"
    >
      {/* Crop-mark corners in the tool's accent, echoing the CreateSpace logo. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-px -left-px size-3 rounded-tl-lg border-t-2 border-l-2 border-(--accent) opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-has-[a:focus-visible]:opacity-100"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-px -bottom-px size-3 rounded-br-lg border-r-2 border-b-2 border-(--accent) opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-has-[a:focus-visible]:opacity-100"
      />

      <div className="flex items-start justify-between gap-3">
        <ToolIcon tool={tool} />
        <BookmarkButton tool={tool} className="-mt-1 -mr-1.5" />
      </div>

      <h3 className="mt-3 font-display text-base leading-snug font-semibold">
        <Link
          to={tool.route}
          className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          {tool.name}
        </Link>
      </h3>
      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{tool.description}</p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <span className="text-xs font-medium text-muted">{category.name}</span>
        <span className="flex items-center gap-1.5">
          {tool.tentative && <Badge tone="neutral">Tentative</Badge>}
          <StatusBadge status={tool.status} />
        </span>
      </div>
    </article>
  );
}

interface GridProps {
  tools: ToolDefinition[];
  label?: string;
  /** "narrow" when the grid shares the row with a sidebar column (dashboard). */
  width?: 'full' | 'narrow';
}

export function ToolGrid({ tools, label, width = 'full' }: GridProps) {
  return (
    <ul
      aria-label={label}
      className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', width === 'full' ? 'xl:grid-cols-3' : '2xl:grid-cols-3')}
    >
      {tools.map((tool, i) => (
        <li key={tool.id} className="flex animate-fade-up *:flex-1" style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}>
          <ToolCard tool={tool} />
        </li>
      ))}
    </ul>
  );
}

import { Lightbulb } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { STATUS } from '@/tools/status';
import type { ToolDefinition } from '@/tools/types';
import { BookmarkButton } from './BookmarkButton';

const tileBase =
  'group relative flex aspect-square flex-col items-center justify-center rounded-[22px] px-1.5 pt-3 pb-2 text-center transition-transform duration-200 ease-out hover:-translate-y-1 hover:scale-[1.03] active:scale-[0.97] has-[a:focus-visible]:outline-[3px] has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-brand';

/** Small status pill under the tile's name, e.g. "Coming soon". */
function TileChip({ children }: { children: ReactNode }) {
  return (
    <span className="mt-1.5 rounded-full bg-white/70 px-2 py-[3px] text-[0.625rem] leading-none font-extrabold whitespace-nowrap tile-ink sm:text-[0.6875rem] dark:bg-black/25">
      {children}
    </span>
  );
}

/**
 * A tool as a square pastel tile: big icon, name, status chip and bookmark.
 * The whole tile is clickable (stretched link); the bookmark stays separately clickable on top.
 */
export function ToolTile({ tool }: { tool: ToolDefinition }) {
  const Icon = tool.icon;
  return (
    <article style={{ '--accent': tool.accent } as CSSProperties} title={tool.description} className={cn(tileBase, 'tile')}>
      <BookmarkButton tool={tool} variant="tile" className="absolute top-1 right-1" />

      <Icon
        aria-hidden="true"
        strokeWidth={2.3}
        fill="currentColor"
        fillOpacity={0.2}
        className="size-[30%] tile-ink drop-shadow-[0_2px_0_rgb(255_255_255/0.5)] transition-transform duration-200 group-hover:scale-110 dark:drop-shadow-none"
      />
      <h3 className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-tight font-extrabold tile-ink sm:mt-2 sm:text-sm">
        <Link to={tool.route} className="outline-none after:absolute after:inset-0 after:rounded-[22px] after:content-['']">
          {tool.shortName ?? tool.name}
          {tool.shortName && <span className="sr-only"> ({tool.name})</span>}
        </Link>
      </h3>
      <p className="sr-only">{tool.description}</p>
      <TileChip>
        {STATUS[tool.status].label}
        {tool.tentative && <span className="sr-only">, tentative</span>}
      </TileChip>
    </article>
  );
}

/** Dashed "Suggest a tool" tile that sits at the end of the grid. */
export function RequestTile() {
  return (
    <Link
      to="/suggest"
      style={{ '--accent': '#8A8794' } as CSSProperties}
      className={cn(tileBase, 'border-2 border-dashed border-line-strong bg-surface/40 text-muted hover:border-muted hover:text-fg')}
    >
      <Lightbulb aria-hidden="true" strokeWidth={2.3} className="size-[28%]" />
      <span className="mt-1.5 text-[0.8125rem] leading-tight font-extrabold sm:mt-2 sm:text-sm">Suggest a tool</span>
      <span className="mt-1.5 text-[0.625rem] leading-none font-bold sm:text-[0.6875rem]">Tell us your idea</span>
    </Link>
  );
}

interface GridProps {
  tools: ToolDefinition[];
  label?: string;
  /** Append the "Request a tool" tile. */
  withRequest?: boolean;
  /** Fewer columns, for narrower spaces. */
  compact?: boolean;
}

export function ToolGrid({ tools, label, withRequest = false, compact = false }: GridProps) {
  return (
    <ul
      aria-label={label}
      className={cn(
        'grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4',
        compact ? 'lg:grid-cols-4' : 'lg:grid-cols-5',
      )}
    >
      {tools.map((tool, i) => (
        <li key={tool.id} data-tool={tool.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 14) * 22}ms` }}>
          <ToolTile tool={tool} />
        </li>
      ))}
      {withRequest && (
        <li className="animate-fade-up" style={{ animationDelay: `${Math.min(tools.length, 14) * 22}ms` }}>
          <RequestTile />
        </li>
      )}
    </ul>
  );
}

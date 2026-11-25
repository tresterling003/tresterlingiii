import { Bookmark } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { useFavorites } from '@/state/FavoritesProvider';
import type { ToolDefinition } from '@/tools/types';

interface Props {
  tool: ToolDefinition;
  /** "tile" sits in a tool tile's corner; "labeled" shows text too (tool pages). */
  variant?: 'tile' | 'labeled';
  className?: string;
}

export function BookmarkButton({ tool, variant = 'tile', className }: Props) {
  const { isFavorite, toggle } = useFavorites();
  const saved = isFavorite(tool.id);
  const [popKey, setPopKey] = useState(0);

  const label = saved ? `Remove ${tool.name} from favorites` : `Add ${tool.name} to favorites`;

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={label}
      title={saved ? 'Remove from favorites' : 'Add to favorites'}
      onClick={() => {
        if (!saved) setPopKey((k) => k + 1);
        toggle(tool.id);
      }}
      className={cn(
        'z-10 inline-flex shrink-0 items-center justify-center gap-2 rounded-full transition-[background-color,color,opacity] duration-150',
        variant === 'tile'
          ? cn(
              'size-9 hover:bg-white/60 dark:hover:bg-black/25',
              saved ? 'text-brand' : 'tile-ink opacity-60 hover:opacity-100 focus-visible:opacity-100',
            )
          : cn(
              'relative h-11 border border-line bg-surface px-4 text-sm font-bold shadow-card hover:bg-surface-2',
              saved ? 'text-brand' : 'text-muted hover:text-fg',
            ),
        className,
      )}
    >
      <Bookmark
        key={popKey}
        aria-hidden="true"
        className={cn(variant === 'tile' ? 'size-4' : 'size-[18px]', popKey > 0 && saved && 'animate-pop')}
        fill={saved ? 'currentColor' : 'none'}
        strokeWidth={2}
      />
      {variant === 'labeled' && <span className="text-fg">{saved ? 'Saved' : 'Save to favorites'}</span>}
    </button>
  );
}

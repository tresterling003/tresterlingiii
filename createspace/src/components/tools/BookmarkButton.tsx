import { Bookmark } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { useFavorites } from '@/state/FavoritesProvider';
import type { ToolDefinition } from '@/tools/types';

interface Props {
  tool: ToolDefinition;
  /** "icon" for cards; "labeled" shows text too (tool pages). */
  variant?: 'icon' | 'labeled';
  className?: string;
}

export function BookmarkButton({ tool, variant = 'icon', className }: Props) {
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
        'relative z-10 inline-flex shrink-0 items-center justify-center gap-2 rounded-md transition-colors duration-150',
        variant === 'icon'
          ? 'size-9 hover:bg-surface-2'
          : 'h-10 border border-line bg-surface px-3.5 text-sm font-medium shadow-card hover:border-line-strong hover:bg-surface-2',
        saved ? 'text-brand' : 'text-muted hover:text-fg',
        className,
      )}
    >
      <Bookmark
        key={popKey}
        aria-hidden="true"
        className={cn('size-[18px]', popKey > 0 && saved && 'animate-pop')}
        fill={saved ? 'currentColor' : 'none'}
        strokeWidth={2}
      />
      {variant === 'labeled' && <span className="text-fg">{saved ? 'Saved' : 'Save to favorites'}</span>}
    </button>
  );
}

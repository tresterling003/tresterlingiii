import { Search, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  /** Press "/" anywhere on the page to jump into this field. */
  shortcut?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search tools',
  label = 'Search tools',
  shortcut = false,
  size = 'md',
  className,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.closest('input, textarea, select, [contenteditable="true"]');
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  return (
    <div role="search" className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted', size === 'lg' ? 'left-4 size-5' : 'left-3 size-4')}
      />
      <input
        ref={ref}
        id={id}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        className={cn(
          'peer w-full rounded-lg border border-line bg-surface text-fg shadow-card transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted/80',
          'hover:border-line-strong focus:border-fg/40 focus:ring-4 focus:ring-brand/15',
          '[&::-webkit-search-cancel-button]:appearance-none',
          size === 'lg' ? 'h-13 pr-24 pl-12 text-base' : 'h-10 pr-20 pl-9 text-sm',
        )}
      />
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange('');
              ref.current?.focus();
            }}
            aria-label="Clear search"
            className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : (
          shortcut && (
            <kbd
              aria-hidden="true"
              title='Press "/" to search'
              className="mr-1 hidden h-6 min-w-6 place-items-center rounded border border-line bg-surface-2 px-1.5 font-sans text-xs text-muted sm:grid"
            >
              /
            </kbd>
          )
        )}
      </div>
    </div>
  );
}

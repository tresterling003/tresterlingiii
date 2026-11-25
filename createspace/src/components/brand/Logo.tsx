import { cn } from '@/lib/cn';

/**
 * The CreateSpace mark: two crop marks (the corners designers use to frame an artboard)
 * around an open space, with a single orange point of inspiration.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('shrink-0', className)}>
      <rect width="32" height="32" rx="8" className="fill-ink" />
      <path
        d="M9 15V9h6M23 17v6h-6"
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-ink-contrast"
      />
      <circle cx="20.5" cy="11.5" r="2.4" className="fill-brand" />
    </svg>
  );
}

export function Logo({ className, showTagline = false }: { className?: string; showTagline?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="size-8" />
      <span className="flex flex-col leading-none">
        <span className="text-[1.1875rem] font-extrabold tracking-tight">
          Create<span className="font-medium">Space</span>
        </span>
        {showTagline && <span className="mt-1 text-[0.6875rem] text-muted">Make space for creativity</span>}
      </span>
    </span>
  );
}

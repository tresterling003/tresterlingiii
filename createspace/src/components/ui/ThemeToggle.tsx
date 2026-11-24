import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/state/ThemeProvider';

export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-md text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg',
        withLabel ? 'h-9 w-full px-2.5 text-sm font-medium' : 'size-9 justify-center',
        className,
      )}
    >
      <span className="relative size-[18px]" aria-hidden="true">
        <Sun className="absolute inset-0 size-[18px] transition-all duration-300 dark:scale-50 dark:-rotate-90 dark:opacity-0" />
        <Moon className="absolute inset-0 size-[18px] scale-50 rotate-90 opacity-0 transition-all duration-300 dark:scale-100 dark:rotate-0 dark:opacity-100" />
      </span>
      {withLabel && <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>}
    </button>
  );
}

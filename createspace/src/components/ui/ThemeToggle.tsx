import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/state/ThemeProvider';

/** Sun/moon button. Shape and size come from `className`. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} className={className}>
      <span className="relative block size-[18px]" aria-hidden="true">
        <Sun className="absolute inset-0 size-[18px] transition-all duration-300 dark:scale-50 dark:-rotate-90 dark:opacity-0" />
        <Moon className="absolute inset-0 size-[18px] scale-50 rotate-90 opacity-0 transition-all duration-300 dark:scale-100 dark:rotate-0 dark:opacity-100" />
      </span>
    </button>
  );
}

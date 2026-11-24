import { Link, type LinkProps } from 'react-router';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-ink-contrast hover:bg-ink/85',
  secondary: 'border border-line bg-surface text-fg shadow-card hover:border-line-strong hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
};

const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm' };

interface StyleProps {
  variant?: Variant;
  size?: Size;
}

export const buttonClasses = ({ variant = 'secondary', size = 'md' }: StyleProps = {}, extra?: string) =>
  cn(base, variants[variant], sizes[size], extra);

export function Button({ variant, size, className, type = 'button', ...props }: StyleProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClasses({ variant, size }, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: StyleProps & LinkProps) {
  return <Link className={buttonClasses({ variant, size }, className)} {...props} />;
}

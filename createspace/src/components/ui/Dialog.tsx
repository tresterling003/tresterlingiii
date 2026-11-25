import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons along the bottom. */
  actions?: ReactNode;
}

/** A centered pop-up. Escape or clicking outside closes it; focus moves inside and returns after. */
export function Dialog({ title, onClose, children, actions }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('input, select, textarea, button[data-autofocus]') ?? box.current;
    first?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end p-3 sm:place-items-center">
      <div className="absolute inset-0 animate-fade-in bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="panel relative w-full max-w-md animate-fade-up p-5 outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display text-lg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
        {actions && <div className="mt-5 flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Text input styled to match the app. */
export function TextField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
  multiline?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  const cls =
    'w-full rounded-2xl border border-line bg-surface px-4 text-base font-semibold text-fg shadow-card outline-none transition-[border-color,box-shadow] placeholder:font-medium placeholder:text-muted/80 focus:border-line-strong focus:ring-4 focus:ring-brand/15';
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block px-1 text-sm font-extrabold">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} placeholder={placeholder} rows={4} className={`${cls} resize-y py-3`} />
      ) : (
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} placeholder={placeholder} className={`${cls} h-12`} />
      )}
      {(hint || maxLength) && (
        <div className="mt-1 flex justify-between gap-3 px-1 text-xs font-semibold text-muted">
          <span>{hint}</span>
          {maxLength && multiline && (
            <span className="tabular-nums">
              {value.length}/{maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

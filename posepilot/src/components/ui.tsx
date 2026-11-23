import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({ title, onClose, children, width = 520, footer, icon }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode; icon?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, button:not([aria-label="Close"])')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className="anim-in panel border rounded-xl shadow-panel flex flex-col max-h-[calc(100vh-32px)] w-full" style={{ maxWidth: width }}>
        <div className="flex items-center gap-2 px-4 h-12 border-b border-ink-700 shrink-0">
          {icon && <span className="text-accent">{icon}</span>}
          <h2 className="text-[14px] font-semibold flex-1">{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-ink-700 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label, size }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label?: string; size?: 'sm' }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" title={o.title} aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={size === 'sm' ? '!h-6 !px-2 !text-[11.5px]' : ''}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format, id }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; id?: string }) {
  return (
    <label className="flex items-center gap-2 min-w-0" htmlFor={id}>
      <span className="text-[11.5px] text-paper-dim whitespace-nowrap">{label}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="min-w-[60px] flex-1" />
      <span className="text-[11px] text-paper-mute tabular-nums w-9 text-right">{format ? format(value) : value}</span>
    </label>
  );
}

export function Section({ title, children, right, className = '' }: { title: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`px-3 py-3 border-b border-ink-700/70 ${className}`}>
      <div className="flex items-center mb-2 gap-2">
        <h3 className="label flex-1">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function KindDot({ kind }: { kind: string }) {
  const color: Record<string, string> = { original: 'bg-kind-original', ai: 'bg-kind-ai', rig: 'bg-kind-rig', inbetween: 'bg-kind-inbetween', drawn: 'bg-kind-drawn', coin: 'bg-kind-coin' };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color[kind] ?? 'bg-paper-mute'}`} aria-hidden />;
}

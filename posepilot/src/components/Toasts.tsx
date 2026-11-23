import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { dismissToast, useStore } from '../state/store';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const studio = useStore((s) => s.screen === 'studio');
  return (
    <div className={`fixed ${studio ? 'bottom-[184px]' : 'bottom-6'} left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none w-[min(560px,90vw)]`} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto anim-in flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-panel bg-ink-800 text-[12.5px] leading-snug ${t.kind === 'error' ? 'border-danger/50' : t.kind === 'success' ? 'border-ok/40' : 'border-ink-600'}`} data-testid={`toast-${t.kind}`}>
          <span className="mt-0.5 shrink-0">{t.kind === 'error' ? <AlertTriangle size={15} className="text-danger" /> : t.kind === 'success' ? <CheckCircle2 size={15} className="text-ok" /> : <Info size={15} className="text-accent" />}</span>
          <span className="flex-1">{t.text}</span>
          {t.action && <button className="btn !h-6 !px-2 !text-[11.5px] shrink-0" onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>}
          <button className="icon-btn !w-5 !h-5 shrink-0" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

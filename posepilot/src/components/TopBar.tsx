import { Check, CircleAlert, CircleHelp, Download, GraduationCap, Keyboard, Loader2, Redo2, Undo2, Info, Film } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { history } from '../state/history';
import { redo, renameProject, setScreen, undo, useStore, actions } from '../state/store';
import { Logo } from './Logo';

export function TopBar() {
  const project = useStore((s) => s.project);
  const saveStatus = useStore((s) => s.saveStatus);
  const screen = useStore((s) => s.screen);
  useStore((s) => s.historyTick);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);
  if (!project) return null;
  const open = (d: Parameters<typeof actions.set>[0]) => { actions.set(d); setMenu(false); };

  return (
    <header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-ink-700 bg-ink-900">
      <button className="flex items-center gap-2 pr-2" onClick={() => setScreen('start')} title="Home: projects & demos" aria-label="PosePilot home">
        <Logo />
      </button>
      <div className="w-px h-5 bg-ink-700" />
      {editing ? (
        <input
          autoFocus
          defaultValue={project.name}
          aria-label="Project name"
          className="field !py-1 !w-56 text-[13px]"
          onBlur={(e) => { renameProject(e.target.value); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
        />
      ) : (
        <button className="text-[13px] font-medium px-2 py-1 rounded hover:bg-ink-750 max-w-[220px] truncate" title="Rename project" onClick={() => setEditing(true)}>
          {project.name}
        </button>
      )}
      <SaveBadge status={saveStatus} />
      <div className="flex items-center ml-1">
        <button className="icon-btn" aria-label="Undo" title={`Undo${history.undoLabel ? `: ${history.undoLabel}` : ''} (Ctrl+Z)`} disabled={!history.canUndo} onClick={undo}><Undo2 size={16} /></button>
        <button className="icon-btn" aria-label="Redo" title={`Redo${history.redoLabel ? `: ${history.redoLabel}` : ''} (Ctrl+Shift+Z)`} disabled={!history.canRedo} onClick={redo}><Redo2 size={16} /></button>
      </div>
      <div className="flex-1" />
      <div className="seg" role="tablist" aria-label="Workspace">
        <button role="tab" aria-pressed={screen === 'quick'} aria-selected={screen === 'quick'} onClick={() => setScreen('quick')} title="Four big steps — made for a 45-minute class">Quick Animate</button>
        <button role="tab" aria-pressed={screen === 'studio'} aria-selected={screen === 'studio'} onClick={() => setScreen('studio')} title="Full editor with every tool">Studio</button>
      </div>
      <button className="btn btn-ghost" onClick={() => actions.set({ dialog: 'teacher' })} title="Lessons & assignments"><GraduationCap size={15} /> <span className="hidden xl:inline">Lessons</span></button>
      <div className="relative" ref={menuRef}>
        <button className="icon-btn" aria-label="Help" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><CircleHelp size={17} /></button>
        {menu && (
          <div className="absolute right-0 top-10 z-40 w-60 panel border rounded-lg shadow-panel py-1 anim-in" role="menu">
            <MenuItem icon={<Film size={14} />} label="How to import into Harmony" onClick={() => open({ dialog: 'harmony' })} />
            <MenuItem icon={<Keyboard size={14} />} label="Keyboard shortcuts" onClick={() => open({ dialog: 'shortcuts' })} />
            <MenuItem icon={<Info size={14} />} label="About AI & privacy" onClick={() => open({ dialog: 'about' })} />
          </div>
        )}
      </div>
      <button className="btn btn-primary" onClick={() => actions.set({ dialog: 'export' })}><Download size={15} /> Export</button>
    </header>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button role="menuitem" className="w-full flex items-center gap-2 px-3 h-8 text-left text-[12.5px] text-paper-dim hover:text-paper hover:bg-ink-750" onClick={onClick}>
      {icon} {label}
    </button>
  );
}

function SaveBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; text: string; cls: string }> = {
    saved: { icon: <Check size={12} />, text: 'Saved on this device', cls: 'text-paper-mute' },
    saving: { icon: <Loader2 size={12} className="animate-spin" />, text: 'Saving…', cls: 'text-paper-mute' },
    unsaved: { icon: <span className="w-1.5 h-1.5 rounded-full bg-paper-mute" />, text: 'Unsaved changes', cls: 'text-paper-mute' },
    error: { icon: <CircleAlert size={12} />, text: 'Not saved — export a project file', cls: 'text-danger' },
  };
  const m = map[status];
  return (
    <span className={`flex items-center gap-1.5 text-[11.5px] ${m.cls}`} role="status" aria-live="polite" data-testid="save-status" data-status={status}>
      {m.icon} <span className="hidden lg:inline">{m.text}</span>
    </span>
  );
}

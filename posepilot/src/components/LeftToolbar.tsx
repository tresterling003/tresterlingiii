import { Bone, Brush, Eraser, FolderOpen, Hand, ImagePlus, Layers, Move, SquareDashedMousePointer, FilePlus2, FileDown, Home, Coins } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadImageFile, UploadError } from '../lib/raster/image';
import { downloadBlob, safeName } from '../lib/export/sequence';
import { writeProjectFile } from '../lib/storage/projectFile';
import { getLayers } from '../state/layers';
import { beginImport, closeProject, importProjectFile, toast, useStore, actions } from '../state/store';
import type { Tool } from '../state/types';

export function LeftToolbar() {
  const tool = useStore((s) => s.tool);
  const onion = useStore((s) => s.onion);
  const fileRef = useRef<HTMLInputElement>(null);
  const [projOpen, setProjOpen] = useState(false);
  const setTool = (t: Tool) => actions.set({ tool: t });

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      beginImport(await loadImageFile(f), f.name, 'new-frame');
    } catch (e) {
      toast(e instanceof UploadError ? e.message : 'That image could not be opened.', 'error');
    }
  };

  return (
    <nav className="w-[52px] shrink-0 flex flex-col items-center gap-1 py-2 border-r border-ink-700 bg-ink-900" aria-label="Tools">
      <div className="relative">
        <ToolBtn label="Project" icon={<FolderOpen size={18} />} onClick={() => setProjOpen((o) => !o)} pressed={projOpen} />
        {projOpen && <ProjectMenu onClose={() => setProjOpen(false)} />}
      </div>
      <ToolBtn label="Import image" shortcut="I" icon={<ImagePlus size={18} />} onClick={() => fileRef.current?.click()} />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} data-testid="toolbar-import" />
      <Divider />
      <ToolBtn label="Draw" shortcut="B" icon={<Brush size={18} />} pressed={tool === 'draw'} onClick={() => setTool('draw')} />
      <ToolBtn label="Eraser" shortcut="E" icon={<Eraser size={18} />} pressed={tool === 'eraser'} onClick={() => setTool('eraser')} />
      <ToolBtn label="Select" shortcut="M" icon={<SquareDashedMousePointer size={18} />} pressed={tool === 'select'} onClick={() => setTool('select')} />
      <ToolBtn label="Move / rotate / scale" shortcut="V" icon={<Move size={18} />} pressed={tool === 'move'} onClick={() => setTool('move')} />
      <ToolBtn label="Pan (or two-finger scroll)" shortcut="H" icon={<Hand size={18} />} pressed={tool === 'hand'} onClick={() => setTool('hand')} />
      <Divider />
      <ToolBtn label={`Onion skin ${onion.enabled ? 'on' : 'off'}`} shortcut="O" icon={<Layers size={18} />} pressed={onion.enabled} onClick={() => actions.set({ onion: { ...onion, enabled: !onion.enabled } })} />
      <ToolBtn label="Pose Rig" shortcut="P" icon={<Bone size={18} />} pressed={tool === 'rig'} onClick={() => setTool('rig')} />
      <ToolBtn label="Coin Flip Assistant" icon={<Coins size={18} />} onClick={() => actions.set({ dialog: 'coin' })} />
    </nav>
  );
}

function Divider() {
  return <div className="w-6 h-px bg-ink-700 my-1" />;
}

function ToolBtn({ label, icon, pressed, onClick, shortcut }: { label: string; icon: ReactNode; pressed?: boolean; onClick: () => void; shortcut?: string }) {
  return (
    <button
      className={`group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${pressed ? 'bg-accent-glow text-accent-hi' : 'text-paper-dim hover:text-paper hover:bg-ink-750'}`}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {icon}
      <span className="pointer-events-none absolute left-[46px] z-50 whitespace-nowrap rounded-md bg-ink-700 px-2 py-1 text-[11.5px] text-paper opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity shadow-panel">
        {label} {shortcut && <span className="kbd ml-1">{shortcut}</span>}
      </span>
    </button>
  );
}

function ProjectMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    setTimeout(() => window.addEventListener('mousedown', close));
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);
  const saveFile = async () => {
    const p = actions.get().project!;
    downloadBlob(await writeProjectFile(p, getLayers), `${safeName(p.name)}.posepilot`);
    toast('Project file downloaded. Open it later from Project → Open project file.', 'success');
    onClose();
  };
  const item = 'w-full flex items-center gap-2 px-3 h-9 text-left text-[12.5px] text-paper-dim hover:text-paper hover:bg-ink-750';
  return (
    <div ref={ref} className="absolute left-[46px] top-0 z-50 w-60 panel border rounded-lg shadow-panel py-1 anim-in" role="menu">
      <button className={item} role="menuitem" onClick={() => { actions.set({ dialog: 'newProject' }); onClose(); }}><FilePlus2 size={14} /> New project…</button>
      <button className={item} role="menuitem" onClick={() => fileRef.current?.click()}><FolderOpen size={14} /> Open project file…</button>
      <button className={item} role="menuitem" onClick={saveFile}><FileDown size={14} /> Download project file</button>
      <div className="h-px bg-ink-700 my-1" />
      <button className={item} role="menuitem" onClick={() => { closeProject(); onClose(); }}><Home size={14} /> All projects & demos</button>
      <input ref={fileRef} type="file" accept=".posepilot,application/zip" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try { await importProjectFile(f); } catch (err) { toast((err as Error).message, 'error'); }
        onClose();
      }} />
    </div>
  );
}

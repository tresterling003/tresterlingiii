import { ChevronDown, Eye } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useStore, actions } from '../state/store';
import { isRigDriven } from './CanvasView';
import { Segmented, Slider } from './ui';

const SWATCHES = ['#1d1f24', '#ffffff', '#e5484d', '#f2b552', '#3fd08a', '#4d8dff'];

export function ToolOptions() {
  const tool = useStore((s) => s.tool);
  const brushColor = useStore((s) => s.brushColor);
  const brushSize = useStore((s) => s.brushSize);
  const eraserSize = useStore((s) => s.eraserSize);
  const activeLayer = useStore((s) => s.activeLayer);
  const artOpacity = useStore((s) => s.artOpacity);
  const project = useStore((s) => s.project);
  const frame = project?.frames.find((f) => f.id === project.currentId);
  const rigDriven = isRigDriven(frame);

  return (
    <div className="h-11 shrink-0 flex items-center gap-3 px-3 border-b border-ink-700 bg-ink-900/80 overflow-x-auto overflow-y-hidden" aria-label="Tool options">
      {tool === 'draw' && (
        <>
          <div className="flex items-center gap-1" role="group" aria-label="Brush colour">
            {SWATCHES.map((c) => (
              <button key={c} aria-label={`Colour ${c}`} aria-pressed={brushColor === c} onClick={() => actions.set({ brushColor: c })}
                className={`w-5 h-5 rounded-full border ${brushColor === c ? 'ring-2 ring-accent ring-offset-2 ring-offset-ink-900 border-transparent' : 'border-ink-500'}`} style={{ background: c }} />
            ))}
            <input type="color" value={brushColor} onChange={(e) => actions.set({ brushColor: e.target.value })} aria-label="Custom colour" className="!w-6 !h-6 ml-1" />
          </div>
          <div className="w-32"><Slider label="Size" value={brushSize} min={1} max={60} onChange={(v) => actions.set({ brushSize: v })} /></div>
        </>
      )}
      {tool === 'eraser' && <div className="w-36"><Slider label="Eraser" value={eraserSize} min={4} max={120} onChange={(v) => actions.set({ eraserSize: v })} /></div>}
      {(tool === 'draw' || tool === 'eraser' || tool === 'select' || tool === 'move') && (
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            label="Layer to edit"
            value={activeLayer}
            onChange={(v) => actions.set({ activeLayer: v })}
            options={[
              { value: 'art', label: rigDriven ? 'Pose (rig)' : 'Drawing', title: rigDriven ? 'This pose is drawn by the rig — edit it with the Pose Rig tool' : 'The drawing / generated pose itself' },
              { value: 'ink', label: 'My lines', title: 'A separate layer on top — perfect for tracing over a suggested pose' },
            ]}
          />
        </div>
      )}
      <div className="w-px h-5 bg-ink-700" />
      <div className="w-36" title="Fade the pose underneath while you trace over it on 'My lines'">
        <Slider label="Pose" value={Math.round(artOpacity * 100)} min={0} max={100} step={5} onChange={(v) => actions.set({ artOpacity: v / 100 })} format={(v) => `${v}%`} />
      </div>
      <div className="w-px h-5 bg-ink-700" />
      <OnionControl />
      <div className="flex-1" />
      <div className="flex items-center gap-2 shrink-0">
        <Segmented size="sm" label="Paper" value={project?.background ?? 'transparent'} onChange={(v) => actions.set((s) => ({ project: s.project ? { ...s.project, background: v } : null }))}
          options={[{ value: 'transparent', label: 'Clear', title: 'Transparent background (exports keep transparency)' }, { value: 'white', label: 'White' }]} />
      </div>
    </div>
  );
}

function OnionControl() {
  const onion = useStore((s) => s.onion);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setOnion = (p: Partial<typeof onion>) => actions.set({ onion: { ...onion, ...p } });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative flex items-center" ref={ref}>
      <button className="chip !h-7 !rounded-r-none" aria-pressed={onion.enabled} onClick={() => setOnion({ enabled: !onion.enabled })} title="Onion skin: see neighbouring frames as coloured ghosts (O)" data-testid="onion-toggle">
        <Eye size={12} /> Onion
        {onion.enabled && <span className="flex gap-0.5 ml-0.5">{onion.prev && <i className="w-1.5 h-1.5 rounded-full bg-[#ff5d5d]" />}{onion.next && <i className="w-1.5 h-1.5 rounded-full bg-[#3fd08a]" />}{onion.original && <i className="w-1.5 h-1.5 rounded-full bg-[#4d8dff]" />}</span>}
      </button>
      <button className="chip !h-7 !rounded-l-none !px-1.5 -ml-px" aria-label="Onion skin settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}><ChevronDown size={12} /></button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-64 panel border rounded-lg shadow-panel p-3 space-y-2.5 anim-in">
          <p className="label">Show as ghosts</p>
          <div className="flex flex-wrap gap-1.5">
            <button className="chip !h-6" aria-pressed={onion.prev} onClick={() => setOnion({ prev: !onion.prev, enabled: true })}><span className="w-2 h-2 rounded-full bg-[#ff5d5d]" /> Previous</button>
            <button className="chip !h-6" aria-pressed={onion.next} onClick={() => setOnion({ next: !onion.next, enabled: true })}><span className="w-2 h-2 rounded-full bg-[#3fd08a]" /> Next</button>
            <button className="chip !h-6" aria-pressed={onion.original} onClick={() => setOnion({ original: !onion.original, enabled: true })} title="Compare with the original drawing"><span className="w-2 h-2 rounded-full bg-[#4d8dff]" /> Original</button>
          </div>
          <Slider label="Opacity" value={Math.round(onion.opacity * 100)} min={5} max={90} step={5} onChange={(v) => setOnion({ opacity: v / 100, enabled: true })} format={(v) => `${v}%`} id="onion-opacity" />
        </div>
      )}
    </div>
  );
}

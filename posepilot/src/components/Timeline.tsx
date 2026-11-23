import { ChevronLeft, ChevronRight, Copy, Minus, Pause, Play, Plus, Repeat, Trash2, Sparkles, Bone } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { expandHolds } from '../lib/export/sequence';
import { addBlankFrame, addRigFrame, deleteFrame, duplicateFrame, moveFrame, selectFrame, setHold, setProjectFps, useStore, actions, stepFrame } from '../state/store';
import { KIND_LABEL, KIND_SHORT, type Frame } from '../state/types';
import { FrameThumb } from './FrameThumb';

const FPS_OPTIONS = [6, 8, 12, 24];
const KIND_CLS: Record<string, string> = {
  original: 'text-kind-original border-kind-original/40',
  ai: 'text-kind-ai border-kind-ai/50',
  rig: 'text-kind-rig border-kind-rig/50',
  inbetween: 'text-kind-inbetween border-kind-inbetween/50',
  drawn: 'text-kind-drawn border-kind-drawn/40',
  coin: 'text-kind-coin border-kind-coin/50',
};

/** Drives playback: advances the playhead over the hold-expanded frame list at the project fps. */
export function usePlayback() {
  const playing = useStore((s) => s.playing);
  const project = useStore((s) => s.project);
  const loop = useStore((s) => s.loop);
  const expanded = useMemo(() => (project ? expandHolds(project.frames, true) : []), [project?.frames]); // eslint-disable-line react-hooks/exhaustive-deps
  const fps = project?.fps ?? 12;
  useEffect(() => {
    if (!playing || !expanded.length) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = 1000 / fps;
    const tick = (t: number) => {
      acc += t - last;
      last = t;
      while (acc >= step) {
        acc -= step;
        const s = actions.get();
        let next = s.playhead + 1;
        if (next >= expanded.length) {
          if (!s.loop) { actions.set({ playing: false, playhead: expanded.length - 1 }); return; }
          next = 0;
        }
        actions.set({ playhead: next });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, fps, expanded.length, loop]);
  return expanded;
}

export function togglePlay() {
  const s = actions.get();
  if (!s.project) return;
  if (s.playing) {
    // stop on the drawing currently shown
    const exp = expandHolds(s.project.frames, true);
    const f = exp[s.playhead];
    actions.set({ playing: false, project: f ? { ...s.project, currentId: f.id } : s.project });
  } else {
    const exp = expandHolds(s.project.frames, true);
    const start = exp.findIndex((f) => f.id === s.project!.currentId);
    actions.set({ playing: true, playhead: start >= 0 && start < exp.length - 1 ? start : 0 });
  }
}

export function Timeline({ height = 168 }: { height?: number }) {
  const project = useStore((s) => s.project);
  const playing = useStore((s) => s.playing);
  const playhead = useStore((s) => s.playhead);
  const loop = useStore((s) => s.loop);
  const expanded = usePlayback();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [customFps, setCustomFps] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  if (!project) return null;
  const frames = project.frames;
  const shownId = playing ? expanded[playhead]?.id : project.currentId;
  const total = expanded.length;
  const secs = (total / project.fps).toFixed(1);

  return (
    <section className="shrink-0 border-t border-ink-700 bg-ink-900 flex flex-col" style={{ height }} aria-label="Timeline">
      <div className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-ink-700/70">
        <div className="flex items-center">
          <button className="icon-btn" aria-label="Previous frame" title="Previous frame (,)" onClick={() => stepFrame(-1)}><ChevronLeft size={16} /></button>
          <button className={`icon-btn !w-9 ${playing ? '!text-accent-hi' : ''}`} aria-label={playing ? 'Pause' : 'Play'} title="Play / pause (Space)" onClick={togglePlay} data-testid="play-button">
            {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </button>
          <button className="icon-btn" aria-label="Next frame" title="Next frame (.)" onClick={() => stepFrame(1)}><ChevronRight size={16} /></button>
          <button className="icon-btn" aria-label="Loop" aria-pressed={loop} title="Loop playback" onClick={() => actions.set({ loop: !loop })}><Repeat size={15} /></button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="label !normal-case !tracking-normal !text-[11.5px] !font-normal text-paper-dim">FPS</span>
          <div className="seg" role="group" aria-label="Frames per second">
            {FPS_OPTIONS.map((f) => (
              <button key={f} aria-pressed={!customFps && project.fps === f} onClick={() => { setCustomFps(false); setProjectFps(f); }} className="!h-6 !px-2 !text-[11.5px]">{f}</button>
            ))}
            <button aria-pressed={customFps || !FPS_OPTIONS.includes(project.fps)} onClick={() => setCustomFps(true)} className="!h-6 !px-2 !text-[11.5px]">Custom</button>
          </div>
          {(customFps || !FPS_OPTIONS.includes(project.fps)) && (
            <input type="number" min={1} max={60} value={project.fps} onChange={(e) => setProjectFps(Number(e.target.value) || 12)} className="field !w-16 !py-0.5 !h-6 text-[12px]" aria-label="Custom FPS" />
          )}
        </div>
        <span className="text-[11.5px] text-paper-mute tabular-nums" data-testid="timeline-stats">
          {frames.length} drawings · {total} frames · {secs}s {playing && <span className="text-accent-hi">· frame {playhead + 1}/{total}</span>}
        </span>
        <div className="flex-1" />
        <Legend />
        <button className="btn !h-7" onClick={() => addBlankFrame()} title="Add an empty frame to draw on"><Plus size={14} /> Frame</button>
        <button className="btn !h-7" onClick={() => addRigFrame()} title="Add a frame posed with the rig"><Bone size={14} /> Rig pose</button>
      </div>
      <div
        ref={scroller}
        className="flex-1 flex items-center gap-0 px-3 overflow-x-auto overflow-y-hidden"
        onDragOver={(e) => e.preventDefault()}
        onWheel={(e) => { if (scroller.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) scroller.current.scrollLeft += e.deltaY; }}
        role="listbox"
        aria-label="Frames"
      >
        {frames.map((f, i) => (
          <div key={f.id} className="flex items-center">
            {i > 0 && (
              <button
                className={`group w-6 h-20 flex items-center justify-center ${dropAt === i ? 'bg-accent/30 rounded' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDropAt(i); }}
                onDrop={(e) => { e.preventDefault(); if (dragId) moveFrame(dragId, frames.findIndex((x) => x.id === dragId) < i ? i - 1 : i); setDragId(null); setDropAt(null); }}
                onClick={() => actions.set({ dialog: 'inbetween', inbetweenTarget: frames[i - 1].id })}
                title={`Add in-betweens between "${frames[i - 1].label}" and "${f.label}"`}
                aria-label={`Add in-betweens between ${frames[i - 1].label} and ${f.label}`}
              >
                <span className="text-paper-mute group-hover:hidden">→</span>
                <span className="hidden group-hover:flex w-5 h-5 rounded-full bg-kind-inbetween/20 text-kind-inbetween items-center justify-center"><Sparkles size={11} /></span>
              </button>
            )}
            <FrameCard
              f={f}
              index={i}
              selected={f.id === shownId}
              onDragStart={() => setDragId(f.id)}
              onDragEnd={() => { setDragId(null); setDropAt(null); }}
              onDropBefore={() => { if (dragId && dragId !== f.id) moveFrame(dragId, i > frames.findIndex((x) => x.id === dragId) ? i - 1 : i); setDragId(null); setDropAt(null); }}
            />
          </div>
        ))}
        <div
          className={`w-8 h-24 shrink-0 ${dropAt === frames.length ? 'bg-accent/30 rounded' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDropAt(frames.length); }}
          onDrop={() => { if (dragId) moveFrame(dragId, frames.length - 1); setDragId(null); setDropAt(null); }}
        />
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div className="hidden 2xl:flex items-center gap-2 text-[10.5px] text-paper-mute mr-2">
      {(['original', 'ai', 'rig', 'inbetween', 'drawn'] as const).map((k) => (
        <span key={k} className={`px-1.5 rounded border ${KIND_CLS[k]}`} title={KIND_LABEL[k]}>{KIND_SHORT[k]}</span>
      ))}
    </div>
  );
}

function FrameCard({ f, index, selected, onDragStart, onDragEnd, onDropBefore }: { f: Frame; index: number; selected: boolean; onDragStart: () => void; onDragEnd: () => void; onDropBefore: () => void }) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDropBefore(); }}
      onClick={() => { actions.set({ playing: false }); selectFrame(f.id); }}
      onKeyDown={(e) => { if (e.key === 'Enter') selectFrame(f.id); }}
      className={`group relative shrink-0 w-[124px] rounded-lg p-1.5 cursor-pointer transition-colors border ${selected ? 'border-accent bg-accent-glow' : 'border-transparent hover:bg-ink-800'} ${f.kind === 'inbetween' ? 'opacity-90' : ''}`}
      data-testid="frame-card"
      data-kind={f.kind}
      title={`${f.label} — ${KIND_LABEL[f.kind]}${f.note ? `\n${f.note}` : ''}`}
    >
      <div className={`relative rounded overflow-hidden border ${f.kind === 'inbetween' ? 'border-dashed border-kind-inbetween/60' : 'border-ink-600'}`}>
        <FrameThumb id={f.id} width={110} />
        <span className={`absolute left-1 top-1 text-[9.5px] font-semibold px-1 rounded bg-ink-950/85 border ${KIND_CLS[f.kind]}`}>{KIND_SHORT[f.kind]}</span>
        <span className="absolute right-1 top-1 text-[9.5px] tabular-nums px-1 rounded bg-ink-950/85 text-paper-dim">{String(index + 1).padStart(2, '0')}</span>
        <div className="absolute right-1 bottom-1 hidden group-hover:flex gap-0.5">
          <button className="w-5 h-5 rounded bg-ink-950/90 text-paper-dim hover:text-paper flex items-center justify-center" aria-label={`Duplicate ${f.label}`} title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateFrame(f.id); }}><Copy size={11} /></button>
          <button className="w-5 h-5 rounded bg-ink-950/90 text-paper-dim hover:text-danger flex items-center justify-center" aria-label={`Delete ${f.label}`} title="Delete" onClick={(e) => { e.stopPropagation(); deleteFrame(f.id); }}><Trash2 size={11} /></button>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className="flex-1 truncate text-[11px] text-paper-dim" >{f.label}</span>
      </div>
      <div className="flex items-center gap-0.5 mt-0.5" onClick={(e) => e.stopPropagation()}>
        <button className="w-5 h-5 rounded text-paper-mute hover:text-paper hover:bg-ink-700 flex items-center justify-center" aria-label={`Shorter hold for ${f.label}`} onClick={() => setHold(f.id, f.hold - 1)}><Minus size={11} /></button>
        <span className="text-[10.5px] tabular-nums text-paper-dim w-12 text-center" title="How many frames this drawing is held (exposures)" data-testid="hold-value">hold {f.hold}</span>
        <button className="w-5 h-5 rounded text-paper-mute hover:text-paper hover:bg-ink-700 flex items-center justify-center" aria-label={`Longer hold for ${f.label}`} onClick={() => setHold(f.id, f.hold + 1)}><Plus size={11} /></button>
        <div className="flex-1 flex gap-px h-1.5 ml-1 overflow-hidden" aria-hidden>
          {Array.from({ length: Math.min(f.hold, 12) }).map((_, i) => <span key={i} className={`flex-1 rounded-sm ${selected ? 'bg-accent/70' : 'bg-ink-600'}`} />)}
        </div>
      </div>
    </div>
  );
}

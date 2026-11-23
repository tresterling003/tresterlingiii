import { ArrowLeft, ArrowRight, Brush, Check, Eraser, FileArchive, Film, Layers, Move, Pause, Play, Printer, Redo2, RefreshCw, Sparkles, Undo2, Upload, Wand2, Bone, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { history } from '../state/history';
import { addRigInbetweens, canRigInbetween, regenerateFrame, redo, selectFrame, setProjectFps, undo, useStore, actions } from '../state/store';
import { KIND_LABEL, KIND_SHORT } from '../state/types';
import { CanvasView, isRigDriven } from './CanvasView';
import { pickAndImport, printPoseSheet } from './Dialogs';
import { FrameThumb } from './FrameThumb';
import { GenerateButton, GenerationSettings, JobStatus, MotionPrompt, PlanCard } from './MotionPanel';
import { AssignmentBanner } from './RightPanel';
import { togglePlay, usePlayback } from './Timeline';

const STEPS = ['Start', 'Describe the motion', 'Generate & refine', 'Preview & export'];

export function QuickAnimate() {
  const step = useStore((s) => s.quickStep);
  const project = useStore((s) => s.project);
  usePlayback();
  if (!project) return null;
  const hasPoses = project.frames.length > 1;
  const go = (n: 1 | 2 | 3 | 4) => actions.set({ quickStep: n, playing: false });
  const canGo = (n: number) => n <= 2 || hasPoses;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <nav className="h-14 shrink-0 flex items-center justify-center gap-1 border-b border-ink-700 bg-ink-900" aria-label="Quick Animate steps">
        {STEPS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          const done = n < step;
          return (
            <div key={label} className="flex items-center">
              {i > 0 && <div className={`w-10 h-px mx-1 ${n <= step ? 'bg-accent' : 'bg-ink-600'}`} />}
              <button disabled={!canGo(n)} onClick={() => go(n)} aria-current={step === n ? 'step' : undefined} className={`flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full transition-colors disabled:opacity-40 ${step === n ? 'bg-accent-glow text-paper' : 'text-paper-dim hover:text-paper'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold ${step === n ? 'bg-accent text-white' : done ? 'bg-ok/20 text-ok' : 'bg-ink-700'}`}>{done ? <Check size={13} /> : n}</span>
                <span className="text-[13px] font-medium">{label}</span>
              </button>
            </div>
          );
        })}
      </nav>
      <div className="flex-1 min-h-0 flex">
        {step === 1 && <StepStart />}
        {step === 2 && <StepDescribe />}
        {step === 3 && <StepRefine />}
        {step === 4 && <StepExport />}
      </div>
    </div>
  );
}

function Footer({ back, next, nextLabel, nextDisabled }: { back?: () => void; next?: () => void; nextLabel?: string; nextDisabled?: boolean }) {
  return (
    <div className="flex items-center gap-2 pt-3">
      {back && <button className="btn btn-lg" onClick={back}><ArrowLeft size={16} /> Back</button>}
      <div className="flex-1" />
      {next && <button className="btn btn-primary btn-lg" disabled={nextDisabled} onClick={next} data-testid="quick-next">{nextLabel ?? 'Next'} <ArrowRight size={16} /></button>}
    </div>
  );
}

function BigTools({ withMove = false }: { withMove?: boolean }) {
  const tool = useStore((s) => s.tool);
  const brushSize = useStore((s) => s.brushSize);
  const onion = useStore((s) => s.onion);
  useStore((s) => s.historyTick);
  const t = (id: typeof tool, icon: React.ReactNode, label: string) => (
    <button className={`btn !h-10 ${tool === id ? '!border-accent !bg-accent-glow' : ''}`} aria-pressed={tool === id} onClick={() => actions.set({ tool: id })}>{icon} {label}</button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {t('draw', <Brush size={16} />, 'Pen')}
      {t('eraser', <Eraser size={16} />, 'Eraser')}
      {withMove && t('move', <Move size={16} />, 'Move')}
      <div className="seg ml-1" role="group" aria-label="Brush size">
        {[3, 7, 14].map((s, i) => <button key={s} aria-pressed={brushSize === s} onClick={() => actions.set({ brushSize: s, eraserSize: s * 4 })} className="!h-8">{['Thin', 'Medium', 'Bold'][i]}</button>)}
      </div>
      <div className="flex-1" />
      {withMove && <button className="btn !h-10" aria-pressed={onion.enabled} onClick={() => actions.set({ onion: { ...onion, enabled: !onion.enabled } })}><Layers size={16} /> Ghost {onion.enabled ? 'on' : 'off'}</button>}
      <button className="btn !h-10" disabled={!history.canUndo} onClick={undo} aria-label="Undo"><Undo2 size={16} /></button>
      <button className="btn !h-10" disabled={!history.canRedo} onClick={redo} aria-label="Redo"><Redo2 size={16} /></button>
    </div>
  );
}

function StepStart() {
  const project = useStore((s) => s.project)!;
  const orig = project.frames[0];
  return (
    <div className="flex-1 flex flex-col max-w-[1100px] mx-auto w-full px-6 py-4 min-h-0">
      <div className="flex items-end gap-3 mb-3">
        <div className="flex-1">
          <h2 className="text-[20px] font-semibold">Your character</h2>
          <p className="text-paper-dim text-[13px]">This drawing is the source for every pose. Draw on it here, or bring in a different picture.</p>
        </div>
        <button className="btn !h-10" onClick={() => void pickAndImport('new-project')}><Upload size={16} /> Upload instead</button>
      </div>
      <BigTools />
      <div className="flex-1 min-h-0 mt-2 rounded-xl overflow-hidden border border-ink-700 flex">
        <CanvasView compact />
      </div>
      <Footer next={() => { selectFrame(orig.id); actions.set({ quickStep: 2, activeLayer: 'ink' }); }} nextLabel="Next: describe the motion" />
    </div>
  );
}

function StepDescribe() {
  const project = useStore((s) => s.project)!;
  const job = useStore((s) => s.job);
  const plan = project.plan;
  const orig = project.frames.find((f) => f.kind === 'original') ?? project.frames[0];
  return (
    <div className="flex-1 grid grid-cols-[minmax(0,1fr)_420px] gap-6 max-w-[1200px] mx-auto w-full px-6 py-4 min-h-0">
      <div className="flex flex-col min-h-0">
        <AssignmentBanner big />
        <div className="flex-1 min-h-0 mt-2 rounded-xl border border-ink-700 bg-ink-900 flex items-center justify-center p-4">
          <FrameThumb id={orig.id} width={560} className="rounded-lg max-w-full" />
        </div>
      </div>
      <div className="flex flex-col min-h-0 overflow-y-auto pr-1">
        <h2 className="text-[20px] font-semibold">What should your character do next?</h2>
        <p className="text-paper-dim text-[13px] mb-3">Type it in your own words, or tap an action.</p>
        <MotionPrompt big />
        {plan && <div className="mt-3"><PlanCard plan={plan} compact /></div>}
        <div className="mt-3"><GenerationSettings simple /></div>
        <div className="mt-3 space-y-2">
          <GenerateButton big />
          {job && <JobStatus />}
        </div>
      </div>
    </div>
  );
}

function StepRefine() {
  const project = useStore((s) => s.project)!;
  const job = useStore((s) => s.job);
  const [fix, setFix] = useState('');
  const frame = project.frames.find((f) => f.id === project.currentId)!;
  const rigDriven = isRigDriven(frame);
  const running = job?.status === 'running';
  return (
    <div className="flex-1 flex flex-col max-w-[1240px] mx-auto w-full px-6 py-3 min-h-0">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 shrink-0" role="listbox" aria-label="Poses">
        {project.frames.map((f, i) => (
          <div key={f.id} className="flex items-center shrink-0">
            {i > 0 && <ArrowRight size={16} className="text-paper-mute mx-1" />}
            <button role="option" aria-selected={f.id === frame.id} onClick={() => selectFrame(f.id)} className={`rounded-lg p-1 border-2 transition-colors ${f.id === frame.id ? 'border-accent' : 'border-transparent hover:border-ink-600'}`}>
              <FrameThumb id={f.id} width={128} className="rounded" />
              <span className="block text-[11px] mt-1 text-left px-0.5"><b className="text-paper-dim">{KIND_SHORT[f.kind]}</b> {f.label}</span>
            </button>
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_300px] gap-4">
        <div className="flex flex-col min-h-0">
          <BigTools withMove />
          <div className="flex-1 min-h-0 mt-2 rounded-xl overflow-hidden border border-ink-700 flex"><CanvasView compact /></div>
        </div>
        <div className="overflow-y-auto space-y-3">
          <div>
            <p className="label">{KIND_LABEL[frame.kind]}</p>
            <h3 className="text-[16px] font-semibold mt-0.5">{frame.label}</h3>
            {frame.note && <p className="text-[12.5px] text-paper-dim mt-1 leading-snug">{frame.note}</p>}
            {frame.kind === 'ai' && <p className="text-[12px] text-kind-ai mt-1">AI suggestion: trace it with the pen and fix anything that looks wrong.</p>}
          </div>
          <div className="rounded-lg border border-ink-700 bg-ink-850 p-3 text-[12px] text-paper-dim leading-snug">
            <b className="text-paper">Trace it:</b> the pen draws on your own layer over the pose. "Ghost" shows the pose before in red.
          </div>
          {(frame.kind === 'ai' || rigDriven) && (
            <div>
              <label className="text-[12.5px] font-medium" htmlFor="quick-fix">{rigDriven ? 'Fix this pose' : 'Not quite right?'}</label>
              <input id="quick-fix" className="field mt-1 !py-2 text-[13px]" placeholder="e.g. raise the arm higher" value={fix} onChange={(e) => setFix(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { void regenerateFrame(frame.id, fix); setFix(''); } }} />
              <button className="btn w-full mt-2 !h-10" disabled={running || (rigDriven && !fix.trim())} onClick={() => { void regenerateFrame(frame.id, fix); setFix(''); }}>
                {running ? <Loader2 size={15} className="animate-spin" /> : rigDriven ? <Wand2 size={15} /> : <RefreshCw size={15} />} {rigDriven ? 'Fix pose' : 'Redraw just this pose'}
              </button>
              {rigDriven && <button className="btn w-full mt-2 !h-10" onClick={() => { actions.set({ screen: 'studio', tool: 'rig', rigMode: 'pose' }); }}><Bone size={15} /> Drag the joints (Studio)</button>}
            </div>
          )}
          <JobStatus />
          {project.plan && <PlanCard plan={project.plan} compact />}
          <Footer back={() => actions.set({ quickStep: 2 })} next={() => actions.set({ quickStep: 4 })} nextLabel="Preview" />
        </div>
      </div>
    </div>
  );
}

function StepExport() {
  const project = useStore((s) => s.project)!;
  const playing = useStore((s) => s.playing);
  const gaps = project.frames.slice(0, -1).filter((f) => canRigInbetween(f.id));
  const fillInbetweens = () => {
    const per = project.plan?.timing.inbetweensPerGap ?? 1;
    for (const f of [...gaps]) addRigInbetweens(f.id, per);
  };
  return (
    <div className="flex-1 grid grid-cols-[minmax(0,1fr)_340px] gap-6 max-w-[1240px] mx-auto w-full px-6 py-4 min-h-0">
      <div className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-ink-700 flex"><CanvasView compact /></div>
        <div className="flex items-center gap-3 mt-3">
          <button className="btn btn-primary btn-lg !w-36" onClick={togglePlay} data-testid="quick-play">{playing ? <><Pause size={17} /> Pause</> : <><Play size={17} /> Play</>}</button>
          <span className="text-paper-dim text-[13px]">Speed</span>
          <div className="seg" role="group" aria-label="Frames per second">
            {[6, 8, 12, 24].map((f) => <button key={f} aria-pressed={project.fps === f} onClick={() => setProjectFps(f)} className="!h-9 !px-3 !text-[13px]">{f} fps</button>)}
          </div>
        </div>
      </div>
      <div className="overflow-y-auto space-y-3">
        <h2 className="text-[20px] font-semibold">Your animation</h2>
        <p className="text-paper-dim text-[13px] leading-snug">{project.frames.length} drawings. Too jumpy? Add in-betweens, or hold the key poses longer in Studio.</p>
        <button className="btn w-full !h-11" disabled={!gaps.length} onClick={fillInbetweens} title={gaps.length ? '' : 'Rig in-betweens need rig poses on both sides. For drawings, add in-betweens in Studio.'}>
          <Sparkles size={16} /> {gaps.length ? `Smooth it: add rig in-betweens (${gaps.length} gaps)` : 'No rig gaps to smooth'}
        </button>
        <div className="h-px bg-ink-700" />
        <button className="btn btn-primary w-full btn-lg" onClick={() => actions.set({ dialog: 'export' })} data-testid="quick-export"><FileArchive size={17} /> Download frames for Harmony</button>
        <button className="btn w-full !h-11" onClick={printPoseSheet}><Printer size={16} /> Print pose sheet</button>
        <button className="btn w-full !h-11" onClick={() => actions.set({ dialog: 'harmony' })}><Film size={16} /> How to import into Harmony</button>
        <AssignmentBanner big />
        <Footer back={() => actions.set({ quickStep: 3 })} />
      </div>
    </div>
  );
}

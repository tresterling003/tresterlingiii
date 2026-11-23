import { Bone, ChevronDown, Eraser, Loader2, RefreshCw, RotateCcw, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { clearLayer, regenerateFrame, renameFrame, restoreGenerated, setHold, useStore, actions } from '../state/store';
import { KIND_LABEL } from '../state/types';
import { isRigDriven } from './CanvasView';
import { KindDot, Section } from './ui';

export function FramePanel() {
  const project = useStore((s) => s.project);
  const job = useStore((s) => s.job);
  const [fix, setFix] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const frame = project?.frames.find((f) => f.id === project.currentId);
  if (!project || !frame) return null;
  const idx = project.frames.indexOf(frame);
  const rigDriven = isRigDriven(frame);
  const canRegen = frame.kind === 'ai' || rigDriven;
  const running = job?.status === 'running';
  const c = frame.consistency;

  return (
    <Section title={`Frame ${idx + 1} of ${project.frames.length}`} right={<span className="flex items-center gap-1.5 text-[11px] text-paper-dim"><KindDot kind={frame.kind} /> {KIND_LABEL[frame.kind]}</span>}>
      <input
        className="field !py-1 text-[13px] font-medium"
        aria-label="Frame name"
        defaultValue={frame.label}
        key={frame.id + frame.label}
        onBlur={(e) => e.target.value !== frame.label && renameFrame(frame.id, e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {frame.note && <p className="text-[11.5px] text-paper-dim leading-snug mt-2">{frame.note}</p>}
      {frame.kind === 'ai' && (
        <div className="mt-2 rounded-md bg-ink-850 border border-ink-700 px-2.5 py-2 text-[11.5px] leading-snug space-y-1">
          <p className="text-kind-ai font-medium">AI suggestion — check it and fix what's off.</p>
          {c && (
            <p className={c.nearlyIdentical || c.palette < 0.35 ? 'text-[#f2b552]' : 'text-paper-dim'} title="A quick automatic check — it cannot judge anatomy or likeness.">
              Quick check: {c.summary}
            </p>
          )}
          {frame.bgRemoved && <p className="text-paper-mute">A plain background around the AI drawing was made transparent. "Restore generated" brings back exactly what the AI returned after that step; Undo reverses it.</p>}
          {frame.aiPrompt && (
            <div>
              <button className="flex items-center gap-1 text-paper-mute hover:text-paper" onClick={() => setShowPrompt((s) => !s)} aria-expanded={showPrompt}>
                Instructions sent to the AI <ChevronDown size={12} className={showPrompt ? 'rotate-180' : ''} />
              </button>
              {showPrompt && <pre className="mt-1 whitespace-pre-wrap text-[10.5px] text-paper-mute font-sans">{frame.aiPrompt}</pre>}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <span className="text-[11.5px] text-paper-dim flex-1">Hold (frames)</span>
        <input type="number" min={1} max={48} value={frame.hold} onChange={(e) => setHold(frame.id, Number(e.target.value) || 1)} className="field !w-16 !py-0.5 text-[12px]" aria-label="Hold in frames" />
        <span className="text-[11px] text-paper-mute w-14 text-right tabular-nums">{(frame.hold / project.fps).toFixed(2)}s</span>
      </div>

      {canRegen && (
        <div className="mt-3">
          <label className="text-[11.5px] text-paper-dim" htmlFor="fix-input">{rigDriven ? 'Fix this pose' : 'Regenerate just this pose'}</label>
          <div className="flex gap-1.5 mt-1">
            <input
              id="fix-input"
              className="field !py-1.5 text-[12.5px]"
              placeholder={rigDriven ? 'e.g. raise the arm higher' : 'Optional: e.g. raise the arm higher'}
              value={fix}
              onChange={(e) => setFix(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (fix || !rigDriven)) { void regenerateFrame(frame.id, fix); setFix(''); } }}
              data-testid="fix-input"
            />
            <button className="btn shrink-0" disabled={running || (rigDriven && !fix.trim())} onClick={() => { void regenerateFrame(frame.id, fix); setFix(''); }} data-testid="fix-button">
              {running ? <Loader2 size={14} className="animate-spin" /> : rigDriven ? <Wand2 size={14} /> : <RefreshCw size={14} />} {rigDriven ? 'Apply' : 'Redo'}
            </button>
          </div>
          <p className="text-[10.5px] text-paper-mute mt-1">{rigDriven ? 'Understands arms, knees, lean and head. Or drag joints with the Pose Rig tool.' : 'Only this pose changes. The old version stays in Undo, and your traced lines are kept.'}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3">
        {rigDriven && <button className="btn !h-7 !text-[12px]" onClick={() => actions.set({ tool: 'rig', rigMode: 'pose' })}><Bone size={13} /> Pose with rig</button>}
        {rigDriven && frame.keyIndex !== undefined && project.plan?.keys[frame.keyIndex] && (
          <button className="btn !h-7 !text-[12px]" onClick={() => void regenerateFrame(frame.id, '')}><RotateCcw size={13} /> Reset pose</button>
        )}
        {frame.hasSource && !rigDriven && (
          <button className="btn !h-7 !text-[12px]" onClick={() => restoreGenerated(frame.id)} title={frame.kind === 'original' ? 'Bring back the drawing exactly as imported' : 'Bring back the generated version (your lines are kept)'}>
            <RotateCcw size={13} /> {frame.kind === 'original' ? 'Restore original' : 'Restore generated'}
          </button>
        )}
        <button className="btn !h-7 !text-[12px]" onClick={() => clearLayer(frame.id, 'ink')} title="Erase everything on the 'My lines' layer of this frame"><Eraser size={13} /> Clear my lines</button>
      </div>
    </Section>
  );
}

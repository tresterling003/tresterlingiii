import { ClipboardList, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { setAssignmentReflection, useStore } from '../state/store';
import { ASSIGNMENTS } from './Dialogs';
import { FramePanel } from './FramePanel';
import { GenerateButton, JobStatus, MotionPanel } from './MotionPanel';
import { RigPanel } from './RigPanel';

export function RightPanel() {
  const tool = useStore((s) => s.tool);
  return (
    <aside className="w-[316px] shrink-0 border-l border-ink-700 bg-ink-900 flex flex-col min-h-0" aria-label="Motion and frame panel">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <AssignmentBanner />
        {tool === 'rig' && <RigPanel />}
        <MotionPanel />
        <FramePanel />
      </div>
      <div className="shrink-0 border-t border-ink-700 p-3 space-y-2 bg-ink-900 max-h-[45%] overflow-y-auto">
        <JobStatus />
        <GenerateButton />
      </div>
    </aside>
  );
}

export function AssignmentBanner({ big = false }: { big?: boolean }) {
  const a = useStore((s) => s.project?.assignment);
  const [open, setOpen] = useState(false);
  if (!a) return null;
  const def = ASSIGNMENTS.find((x) => x.id === a.id)!;
  return (
    <div className={`border-b border-ink-700 bg-accent-glow/60 ${big ? 'rounded-lg border' : ''}`}>
      <button className="w-full flex items-center gap-2 px-3 py-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ClipboardList size={14} className="text-accent-hi shrink-0" />
        <span className="text-[12px] flex-1"><b>Assignment {def.letter}: {def.title}</b> — {def.goal}</span>
        <ChevronDown size={14} className={`text-paper-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 anim-in">
          <ol className="list-decimal pl-5 space-y-0.5 text-[11.5px] text-paper-dim marker:text-accent">{def.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          <label className="block mt-2 text-[11.5px] text-paper-dim" htmlFor="reflection">What changed between your original pose and your final pose?</label>
          <textarea id="reflection" className="field mt-1 text-[12.5px] min-h-[64px] resize-y" defaultValue={a.reflection} onBlur={(e) => setAssignmentReflection(e.target.value)} placeholder="Write a few sentences…" />
        </div>
      )}
    </div>
  );
}

import { AlertTriangle, Bone, CheckCircle2, ChevronDown, CircleSlash, Lightbulb, Loader2, RotateCcw, Sparkles, Wand2, X, Coins } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PRESETS } from '../lib/motion/library';
import type { MotionPlan } from '../lib/motion/planner';
import { cancelJob, generateAiPoses, generateRigPoses, retryAiKey, selectFrame, setPrompt, setSettings, useStore, actions, frameById } from '../state/store';
import { Section, Segmented, Slider } from './ui';

export function MotionPrompt({ big = false }: { big?: boolean }) {
  const prompt = useStore((s) => s.project?.prompt ?? '');
  const [text, setText] = useState(prompt);
  useEffect(() => setText(prompt), [prompt]);
  useEffect(() => {
    if (text === prompt) return;
    const t = setTimeout(() => setPrompt(text), 250);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <label htmlFor="motion-prompt" className="sr-only">What should your character do next?</label>
      <textarea
        id="motion-prompt"
        data-testid="motion-prompt"
        className={`field resize-none leading-snug ${big ? 'text-[16px] min-h-[92px] !px-3.5 !py-3' : 'text-[13.5px] min-h-[72px]'}`}
        placeholder="What should your character do next?"
        value={text}
        maxLength={400}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== prompt && setPrompt(text)}
      />
      <div className={`flex flex-wrap gap-1.5 mt-2 ${big ? 'gap-2' : ''}`} role="group" aria-label="Action presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={`chip ${big ? '!h-8 !px-3 !text-[13px]' : ''}`} aria-pressed={text === p.prompt} onClick={() => { setText(p.prompt); setPrompt(p.prompt); }}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PlanCard({ plan, compact = false }: { plan: MotionPlan; compact?: boolean }) {
  const [explain, setExplain] = useState(false);
  const roleColor: Record<string, string> = { anticipation: 'text-[#f2b552]', action: 'text-accent-hi', peak: 'text-kind-ai', 'follow-through': 'text-kind-rig', contact: 'text-accent-hi', passing: 'text-kind-rig', settle: 'text-kind-rig', recovery: 'text-kind-rig', breakdown: 'text-paper-dim' };
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 anim-in" data-testid="motion-plan">
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-start gap-2">
          <Wand2 size={14} className="text-accent mt-0.5 shrink-0" />
          <p className="text-[12.5px] leading-snug font-medium" data-testid="plan-summary">{plan.summary}</p>
        </div>
        {!compact && (
          <p className="text-[11px] text-paper-mute mt-1 pl-[22px]">
            Body: {plan.bodyParts.slice(0, 4).join(', ')} · {plan.view} view · ~{plan.timing.seconds}s at {plan.timing.fps} fps
          </p>
        )}
      </div>
      <ol className="border-t border-ink-700/70">
        {plan.keys.map((k) => (
          <li key={k.index} className="flex gap-2.5 px-3 py-2 border-b border-ink-700/50 last:border-0">
            <span className="w-5 h-5 shrink-0 rounded-full bg-ink-700 text-[10.5px] flex items-center justify-center tabular-nums mt-0.5">{k.index + 1}</span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[10.5px] font-semibold uppercase tracking-wide ${roleColor[k.role] ?? ''}`}>{k.roleLabel}</span>
                <span className="text-[12.5px] font-medium">{k.label}</span>
                <span className="text-[10.5px] text-paper-mute ml-auto tabular-nums" title="Suggested hold (frames at 12 fps)">×{k.hold}</span>
              </div>
              {!compact && <p className="text-[11.5px] text-paper-dim leading-snug mt-0.5 line-clamp-2">{k.description}</p>}
            </div>
          </li>
        ))}
      </ol>
      {(plan.notes.length > 0 || plan.clarify.length > 0) && (
        <div className="px-3 py-2 border-t border-ink-700/70 space-y-2">
          {plan.notes.map((n) => <p key={n} className="text-[11.5px] text-paper-dim leading-snug">• {n}</p>)}
          {plan.clarify.map((c) => (
            <div key={c.id}>
              <p className="text-[11.5px] text-paper-dim mb-1.5">{c.question}</p>
              <div className="flex flex-wrap gap-1.5">
                {c.options.map((o) => (
                  <button key={o.label} className="chip !h-6 !text-[11.5px]" aria-pressed={c.id === 'side' && o.patch.side === plan.side && !plan.sideWasGuessed}
                    onClick={() => { if (o.patch.prompt) setPrompt(o.patch.prompt); const { prompt: _p, ...rest } = o.patch; if (Object.keys(rest).length) setSettings(rest); }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-ink-700/70">
        <button className="w-full flex items-center gap-2 px-3 h-8 text-[12px] text-paper-dim hover:text-paper" aria-expanded={explain} onClick={() => setExplain((e) => !e)} data-testid="explain-motion">
          <Lightbulb size={13} className="text-[#f2b552]" /> Explain this motion <ChevronDown size={13} className={`ml-auto transition-transform ${explain ? 'rotate-180' : ''}`} />
        </button>
        {explain && (
          <ul className="px-3 pb-3 space-y-1.5 anim-in">
            {plan.explanation.map((e) => <li key={e} className="text-[12px] leading-snug text-paper-dim pl-3 relative before:content-[''] before:absolute before:left-0 before:top-[7px] before:w-1 before:h-1 before:rounded-full before:bg-[#f2b552]">{e}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

export function GenerationSettings({ simple = false }: { simple?: boolean }) {
  const settings = useStore((s) => s.project?.settings);
  const ai = useStore((s) => s.ai);
  const cutout = useStore((s) => s.project?.rigStyle?.kind === 'cutout');
  if (!settings) return null;
  const aiReady = !!ai?.configured;
  return (
    <div className="space-y-2.5">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11.5px] text-paper-dim">Generation mode</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Generation mode">
          <ModeCard active={settings.mode === 'ai'} onClick={() => setSettings({ mode: 'ai' })} icon={<Sparkles size={14} />} title="AI drawing" sub={aiReady ? 'Redraws your character' : 'Not set up'} warn={!aiReady} testid="mode-ai" />
          <ModeCard active={settings.mode === 'rig'} onClick={() => setSettings({ mode: 'rig' })} icon={<Bone size={14} />} title="Rig poses" sub="Offline · instant" testid="mode-rig" />
        </div>
        {settings.mode === 'ai' && !aiReady && (
          <p className="mt-2 text-[11.5px] leading-snug text-[#f2b552] flex gap-1.5" data-testid="ai-unavailable"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> {ai?.reason ?? 'Checking AI service…'}</p>
        )}
        {settings.mode === 'ai' && aiReady && <p className="mt-1.5 text-[11px] text-paper-mute leading-snug">{ai.label} · {ai.model}. {ai.costNote}</p>}
        {settings.mode === 'rig' && !simple && <p className="mt-1.5 text-[11px] text-paper-mute leading-snug">Poses come from a skeleton rig. Works for stick figures, the demo characters, and drawings cut into parts. It can't redraw detailed art by itself.</p>}
      </div>
      <Row label="New poses">
        <Segmented size="sm" label="Pose count" value={settings.poseCount} onChange={(v) => setSettings({ poseCount: v })} options={[{ value: 2, label: '2' }, { value: 3, label: '3' }]} />
      </Row>
      <Row label="Intensity">
        <Segmented size="sm" label="Motion intensity" value={settings.intensity} onChange={(v) => setSettings({ intensity: v })} options={[{ value: 'subtle', label: 'Subtle' }, { value: 'normal', label: 'Normal' }, { value: 'exaggerated', label: 'Big' }]} />
      </Row>
      <Row label="Speed">
        <Segmented size="sm" label="Motion speed" value={settings.speed} onChange={(v) => setSettings({ speed: v })} options={[{ value: 'slow', label: 'Slow' }, { value: 'normal', label: 'Normal' }, { value: 'fast', label: 'Fast' }]} />
      </Row>
      {!simple && (
        <Row label={settings.mode === 'rig' && cutout ? 'View (locked)' : 'View'}>
          <Segmented size="sm" label="Camera view" value={settings.view} onChange={(v) => setSettings({ view: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'side', label: 'Side' }, { value: 'front', label: 'Front' }]} />
        </Row>
      )}
      {settings.mode === 'ai' && (
        <>
          <div>
            <Slider label="Pose freedom ↔ Match character" value={settings.consistency} min={0} max={100} step={5} onChange={(v) => setSettings({ consistency: v })} format={(v) => `${v}`} />
            <p className="text-[10.5px] text-paper-mute mt-0.5">Higher keeps your design stricter; lower allows bolder poses.</p>
          </div>
          {!simple && (
            <Row label="Quality">
              <Segmented size="sm" label="AI quality" value={settings.quality} onChange={(v) => setSettings({ quality: v })} options={[{ value: 'low', label: 'Draft' }, { value: 'medium', label: 'Normal' }, { value: 'high', label: 'High' }]} />
            </Row>
          )}
        </>
      )}
      <p className="text-[10.5px] text-paper-mute leading-snug">Settings guide the result — they don't guarantee an exact pose.</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11.5px] text-paper-dim">{label}</span>
      {children}
    </div>
  );
}

function ModeCard({ active, onClick, icon, title, sub, warn, testid }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string; warn?: boolean; testid?: string }) {
  return (
    <button role="radio" aria-checked={active} onClick={onClick} data-testid={testid}
      className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${active ? 'border-accent bg-accent-glow' : 'border-ink-600 hover:border-ink-500 bg-ink-850'}`}>
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium">{icon} {title}</div>
      <div className={`text-[11px] mt-0.5 ${warn ? 'text-[#f2b552]' : 'text-paper-mute'}`}>{sub}</div>
    </button>
  );
}

export function GenerateButton({ big = false }: { big?: boolean }) {
  const project = useStore((s) => s.project);
  const ai = useStore((s) => s.ai);
  const job = useStore((s) => s.job);
  if (!project) return null;
  const plan = project.plan;
  const mode = project.settings.mode;
  const running = job?.status === 'running';
  const blocked = mode === 'ai' && !ai?.configured;
  if (plan?.special === 'coin') {
    return (
      <button className={`btn btn-primary w-full ${big ? 'btn-lg' : '!h-10'}`} onClick={() => actions.set({ dialog: 'coin' })}>
        <Coins size={16} /> Open Coin Flip Assistant
      </button>
    );
  }
  return (
    <button
      className={`btn btn-primary w-full ${big ? 'btn-lg' : '!h-10'}`}
      disabled={!plan || running || blocked}
      onClick={() => (mode === 'ai' ? void generateAiPoses() : generateRigPoses())}
      data-testid="generate-poses"
    >
      {running ? <Loader2 size={16} className="animate-spin" /> : mode === 'ai' ? <Sparkles size={16} /> : <Bone size={16} />}
      {running ? 'Generating…' : `Generate ${plan?.keys.length ?? project.settings.poseCount} poses`}
      <span className="text-white/70 font-normal">· {mode === 'ai' ? 'AI' : 'Rig'}</span>
    </button>
  );
}

export function JobStatus() {
  const job = useStore((s) => s.job);
  if (!job) return null;
  const running = job.status === 'running';
  const done = job.items.filter((i) => i.status === 'done').length;
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-850 overflow-hidden anim-in" data-testid="job-status" role="status" aria-live="polite">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-ink-700/70">
        <span className={`text-[10.5px] font-semibold uppercase tracking-wide ${job.mode === 'ai' ? 'text-kind-ai' : 'text-kind-rig'}`}>{job.mode === 'ai' ? 'AI drawing' : 'Rig'}</span>
        <span className="text-[11.5px] text-paper-dim truncate flex-1">{running ? `Working… ${done}/${job.items.length}` : job.status === 'cancelled' ? 'Cancelled' : `${done}/${job.items.length} ready`}</span>
        {running ? (
          <button className="btn !h-6 !px-2 !text-[11.5px]" onClick={cancelJob}><X size={12} /> Cancel</button>
        ) : (
          <button className="icon-btn !w-6 !h-6" aria-label="Dismiss" onClick={() => actions.set({ job: null })}><X size={13} /></button>
        )}
      </div>
      {running && <div className="h-1 bg-ink-700"><div className="h-full bg-accent progress-stripes transition-all" style={{ width: `${Math.max(8, ((done + 0.5) / job.items.length) * 100)}%` }} /></div>}
      <ul>
        {job.items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 px-3 py-1.5 text-[12px]">
            <span className="mt-0.5">
              {it.status === 'done' && <CheckCircle2 size={14} className="text-ok" />}
              {it.status === 'running' && <Loader2 size={14} className="animate-spin text-accent" />}
              {it.status === 'queued' && <span className="block w-3.5 h-3.5 rounded-full border border-ink-500" />}
              {it.status === 'error' && <AlertTriangle size={14} className="text-danger" />}
              {it.status === 'cancelled' && <CircleSlash size={14} className="text-paper-mute" />}
            </span>
            <div className="min-w-0 flex-1">
              <button className="text-left hover:underline disabled:no-underline" disabled={!it.frameId || !frameById(it.frameId)} onClick={() => it.frameId && selectFrame(it.frameId)}>{it.label}</button>
              {it.status === 'running' && job.mode === 'ai' && <p className="text-[11px] text-paper-mute anim-pulse">Drawing this pose — usually 10–40 seconds</p>}
              {it.error && <p className="text-[11px] text-danger/90 leading-snug mt-0.5">{it.error}</p>}
            </div>
            {it.status === 'error' && job.mode === 'ai' && !running && (
              <button className="btn !h-6 !px-2 !text-[11px]" onClick={() => void retryAiKey(i)}><RotateCcw size={11} /> Retry</button>
            )}
          </li>
        ))}
      </ul>
      {job.message && !running && <p className="px-3 pb-2 text-[11.5px] text-paper-dim leading-snug">{job.message} Your existing frames are safe.</p>}
    </div>
  );
}

export function MotionPanel() {
  const plan = useStore((s) => s.project?.plan);
  return (
    <>
      <Section title="Motion" right={<span className="text-[10.5px] text-paper-mute">Step 2–3</span>}>
        <MotionPrompt />
        {plan && <div className="mt-3"><PlanCard plan={plan} /></div>}
      </Section>
      <Section title="Generation settings">
        <GenerationSettings />
      </Section>
    </>
  );
}

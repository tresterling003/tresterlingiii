import { Bone, FolderOpen, GraduationCap, PenLine, Sparkles, Trash2, Upload, Zap, LayoutPanelTop } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createDemo, DEMOS, type DemoId } from '../lib/demo';
import { listProjects, type StoredProjectSummary } from '../lib/storage/db';
import { deleteStoredProject, importProjectFile, newProject, openProject, setSettings, toast, useStore, actions, type Screen } from '../state/store';
import { pickAndImport } from './Dialogs';
import { Logo } from './Logo';

export function StartScreen() {
  const ai = useStore((s) => s.ai);
  const [projects, setProjects] = useState<StoredProjectSummary[] | null>(null);
  const [workspace, setWorkspace] = useState<Screen>(() => (localStorage.getItem('posepilot:workspace') as Screen) || 'quick');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { listProjects().then(setProjects).catch(() => setProjects([])); }, []);
  useEffect(() => localStorage.setItem('posepilot:workspace', workspace), [workspace]);

  const withScreen = () => actions.set({ screen: workspace });
  const upload = () => { actions.set({ screen: workspace === 'quick' ? 'quick' : 'start' }); void pickAndImport('new-project'); };
  const draw = () => {
    newProject({ name: 'My character', width: 1280, height: 720, firstLabel: 'My character', screen: workspace });
    actions.set({ tool: 'draw', activeLayer: 'art', brushSize: 7, quickStep: 1 });
  };
  const demo = (id: DemoId) => {
    const d = createDemo(id, 1280, 720);
    newProject({ name: `${d.name} animation`, width: 1280, height: 720, art: d.art, rig: d.rig, rigStyle: d.style, originalPose: d.rig.rest, screen: workspace });
    setSettings({ mode: 'rig' });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1040px] mx-auto px-8 py-8">
        <header className="flex items-center gap-4">
          <Logo size={30} />
          <div className="flex-1" />
          <span className={`text-[11.5px] px-2.5 py-1 rounded-full border ${ai?.configured ? 'border-kind-ai/40 text-kind-ai' : 'border-ink-600 text-paper-mute'}`} title={ai?.reason} data-testid="ai-status-pill">
            {ai == null ? 'Checking AI…' : ai.configured ? `AI drawing on · ${ai.provider}` : 'AI drawing not set up · Rig mode ready'}
          </span>
          <button className="btn btn-ghost" onClick={() => actions.set({ dialog: 'teacher' })}><GraduationCap size={15} /> Lessons</button>
        </header>

        <section className="mt-10">
          <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Draw once. Describe the motion.<br /><span className="text-paper-dim">Discover your next poses.</span></h1>
          <p className="text-paper-dim mt-3 max-w-[560px] text-[14px] leading-relaxed">Start with one drawing of your character. Tell PosePilot how it should move, and get the next key poses to trace, fix and animate — then export the frames to Harmony.</p>
        </section>

        <div className="mt-7 flex items-center gap-3">
          <span className="label">Workspace</span>
          <div className="seg" role="radiogroup" aria-label="Workspace">
            <button role="radio" aria-checked={workspace === 'quick'} aria-pressed={workspace === 'quick'} onClick={() => setWorkspace('quick')}><Zap size={12} className="inline mr-1 -mt-0.5" />Quick Animate · 4 steps</button>
            <button role="radio" aria-checked={workspace === 'studio'} aria-pressed={workspace === 'studio'} onClick={() => setWorkspace('studio')}><LayoutPanelTop size={12} className="inline mr-1 -mt-0.5" />Studio · all tools</button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-4">
          <StartCard icon={<Upload size={20} />} title="Upload a drawing" sub="PNG, JPG or WebP. Transparent backgrounds welcome." onClick={upload} primary testid="start-upload" />
          <StartCard icon={<PenLine size={20} />} title="Draw a character" sub="Sketch right here with the brush." onClick={draw} testid="start-draw" />
          <StartCard icon={<FolderOpen size={20} />} title="Open project file" sub="A .posepilot file you saved or handed in." onClick={() => fileRef.current?.click()} />
          <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
            <div className="flex items-center gap-2 text-paper-dim"><Bone size={18} /><span className="text-[13.5px] font-medium text-paper">Demo characters</span></div>
            <div className="mt-3 space-y-1.5">
              {DEMOS.map((d) => (
                <button key={d.id} className="w-full text-left rounded-lg px-2.5 py-1.5 hover:bg-ink-800 border border-transparent hover:border-ink-600" onClick={() => demo(d.id)} data-testid={`demo-${d.id}`}>
                  <span className="text-[12.5px] font-medium">{d.name}</span>
                  <span className="block text-[11px] text-paper-mute leading-snug">{d.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".posepilot,application/zip" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { await importProjectFile(f); withScreen(); } catch (err) { toast((err as Error).message, 'error'); }
        }} />

        <section className="mt-10">
          <h2 className="label mb-3">Your projects (saved in this browser)</h2>
          {projects === null ? (
            <p className="text-paper-mute text-[12.5px]">Loading…</p>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ink-600 p-6 text-center text-paper-mute text-[12.5px]">
              Nothing here yet. Projects save automatically while you work — no account needed.
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {projects.map((p) => (
                <div key={p.id} className="group rounded-xl border border-ink-700 bg-ink-900 overflow-hidden hover:border-ink-500 transition-colors">
                  <button className="block w-full text-left" onClick={() => openProject(p.id).then(() => actions.set({ screen: workspace })).catch((e) => toast(String(e.message), 'error'))}>
                    <div className="aspect-video bg-white flex items-center justify-center overflow-hidden">
                      {p.thumb ? <img src={p.thumb} alt="" className="w-full h-full object-contain" /> : <Sparkles className="text-ink-500" />}
                    </div>
                    <div className="px-3 py-2">
                      <div className="text-[12.5px] font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-paper-mute">{p.frameCount} drawing{p.frameCount === 1 ? '' : 's'} · {timeAgo(p.updatedAt)}</div>
                    </div>
                  </button>
                  <div className="px-3 pb-2 -mt-1 flex justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                    <button className="icon-btn !w-7 !h-7 hover:!text-danger" aria-label={`Delete ${p.name}`} onClick={async () => {
                      if (!confirm(`Delete "${p.name}" from this browser? This can't be undone.`)) return;
                      await deleteStoredProject(p.id);
                      setProjects((list) => list?.filter((x) => x.id !== p.id) ?? null);
                    }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 pt-5 border-t border-ink-700 grid grid-cols-3 gap-6 text-[12px] text-paper-mute leading-relaxed">
          <p><b className="text-paper-dim">You're the animator.</b> PosePilot suggests poses; you choose, trace and fix them.</p>
          <p><b className="text-paper-dim">Private by default.</b> Work stays in this browser. AI is only used after you agree, per project.</p>
          <p><b className="text-paper-dim">Works offline.</b> Drawing, rig poses, playback and export need no internet.</p>
        </footer>
      </div>
    </div>
  );
}

function StartCard({ icon, title, sub, onClick, primary, testid }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void; primary?: boolean; testid?: string }) {
  return (
    <button onClick={onClick} data-testid={testid} className={`text-left rounded-xl border p-4 transition-colors ${primary ? 'border-accent/60 bg-accent-glow hover:bg-accent/20' : 'border-ink-700 bg-ink-900 hover:border-ink-500'}`}>
      <span className={primary ? 'text-accent-hi' : 'text-paper-dim'}>{icon}</span>
      <span className="block text-[13.5px] font-medium mt-3">{title}</span>
      <span className="block text-[11.5px] text-paper-mute leading-snug mt-1">{sub}</span>
    </button>
  );
}

function timeAgo(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

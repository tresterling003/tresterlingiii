import { Bone, Coins, Download, FileArchive, FileDown, Film, ImageDown, Loader2, PenLine, Printer, ShieldCheck, Sparkles, Upload, GraduationCap, Play, Info } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_COIN, demoCoinFace, renderCoinFrames, squareFromBox, type CoinOptions } from '../lib/coin';
import { createDemo, type DemoId } from '../lib/demo';
import { buildSequenceZip, composite, downloadBlob, expandHolds, frameFileName, safeName } from '../lib/export/sequence';
import { contentBBox, fitInto, loadImageFile, removePlainBackground, UploadError, canvasToBlob } from '../lib/raster/image';
import { writeProjectFile } from '../lib/storage/projectFile';
import { getLayers } from '../state/layers';
import {
  addAiInbetween, addBlankInbetween, addRigInbetweens, answerConsent, canRigInbetween, compositeFrame, finishImport, generateRigPoses,
  insertProceduralFrames, newProject, setPrompt, setSettings, toast, useStore, actions,
} from '../state/store';
import type { Assignment } from '../state/types';
import { Modal, Segmented, Slider } from './ui';

// ───────────────────────────── Import ─────────────────────────────

const SIZES = [
  { id: '720', w: 1280, h: 720, label: '1280 × 720', sub: 'Recommended for Chromebooks' },
  { id: '1080', w: 1920, h: 1080, label: '1920 × 1080', sub: 'HD — matches a default Harmony scene' },
];

export function ImportDialog() {
  const draft = useStore((s) => s.importDraft);
  const hasProject = useStore((s) => !!s.project);
  const [bgMode, setBgMode] = useState<'keep' | 'remove'>('remove');
  const [tol, setTol] = useState(40);
  const [size, setSize] = useState('720');
  const [name, setName] = useState('');
  const [target, setTarget] = useState<'new-frame' | 'replace' | 'new-project'>('new-frame');
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!draft) return;
    setName(draft.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'My animation');
    setTarget(draft.target);
    setBgMode(draft.bg.plainBackground ? 'remove' : 'keep');
  }, [draft]);
  const processed = useMemo(() => {
    if (!draft) return null;
    if (bgMode === 'remove' && draft.bg.plainBackground) return removePlainBackground(draft.canvas, draft.bg.plainBackground, tol);
    return draft.canvas;
  }, [draft, bgMode, tol]);
  useEffect(() => {
    const c = preview.current;
    if (!c || !processed) return;
    const s = Math.min(460 / processed.width, 260 / processed.height, 1);
    c.width = processed.width * s;
    c.height = processed.height * s;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(processed, 0, 0, c.width, c.height);
  }, [processed]);
  if (!draft || !processed) return null;
  const newProj = !hasProject || target === 'new-project';
  const dims = SIZES.find((s) => s.id === size)!;
  const cur = actions.get().project;
  const confirm = () => {
    const W = newProj ? dims.w : cur!.width;
    const H = newProj ? dims.h : cur!.height;
    const { canvas } = fitInto(processed, W, H, 0.06, 1.6);
    actions.set((s) => ({ importDraft: s.importDraft ? { ...s.importDraft, target: newProj ? 'new-project' : target } : null }));
    finishImport(canvas, { width: W, height: H, name: name || 'My animation' });
  };
  return (
    <Modal title="Bring in your drawing" icon={<Upload size={16} />} onClose={() => actions.set({ importDraft: null })} width={560}
      footer={<><button className="btn" onClick={() => actions.set({ importDraft: null })}>Cancel</button><button className="btn btn-primary" onClick={confirm} data-testid="import-confirm" data-autofocus>Use this drawing</button></>}>
      <div className="checker rounded-lg flex items-center justify-center p-3 min-h-[160px]">
        <canvas ref={preview} className="max-w-full" data-testid="import-preview" />
      </div>
      <p className="text-[11px] text-paper-mute mt-1.5">{draft.name} · {draft.canvas.width}×{draft.canvas.height}px</p>
      <div className="mt-3 space-y-3">
        {draft.bg.hasTransparency && <p className="text-[12.5px] text-ok flex gap-2"><ShieldCheck size={15} /> Transparent background found — your drawing is ready to animate.</p>}
        {draft.bg.plainBackground && (
          <div>
            <p className="text-[12.5px] text-paper-dim mb-2">Your drawing is on a plain background. Make it see-through so poses can be layered and exported cleanly?</p>
            <Segmented label="Background" value={bgMode} onChange={setBgMode} options={[{ value: 'remove', label: 'Make background transparent' }, { value: 'keep', label: 'Keep background' }]} />
            {bgMode === 'remove' && <div className="mt-2"><Slider label="Tolerance" value={tol} min={10} max={90} onChange={setTol} /></div>}
            {bgMode === 'remove' && <p className="text-[11px] text-paper-mute mt-1">Only background touching the edges is removed, so white areas inside your character (eyes, shirt) stay. Check the preview. Your original file is kept, so "Restore original" undoes this later.</p>}
          </div>
        )}
        {!draft.bg.hasTransparency && !draft.bg.plainBackground && (
          <p className="text-[12px] text-[#f2b552] leading-snug">This image has a detailed background, so PosePilot will keep it as is. For animation, a drawing on plain paper or a transparent PNG works best.</p>
        )}
        {hasProject && (
          <div>
            <p className="label mb-1.5">Add it as</p>
            <Segmented label="Import target" value={target} onChange={setTarget} options={[{ value: 'new-frame', label: 'New frame' }, { value: 'replace', label: 'Replace this frame' }, { value: 'new-project', label: 'New project' }]} />
          </div>
        )}
        {newProj && (
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <label className="block">
              <span className="label">Project name</span>
              <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </label>
            <div>
              <span className="label block mb-1">Canvas</span>
              <Segmented label="Canvas size" value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s.id, label: s.label, title: s.sub }))} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export async function pickAndImport(target: 'new-project' | 'new-frame') {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const c = await loadImageFile(f);
      const { beginImport } = await import('../state/store');
      beginImport(c, f.name, target);
    } catch (e) {
      toast(e instanceof UploadError ? e.message : 'That image could not be opened.', 'error');
    }
  };
  input.click();
}

// ───────────────────────────── Export ─────────────────────────────

export function ExportDialog() {
  const project = useStore((s) => s.project)!;
  const [contents, setContents] = useState<'both' | 'ink' | 'art'>('both');
  const [bg, setBg] = useState<'transparent' | 'white'>(project.background);
  const [holds, setHolds] = useState(true);
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const opts = { includeArt: contents !== 'ink', includeInk: contents !== 'art', background: bg, scale };
  const frames = project.frames;
  const outFrames = expandHolds(frames, holds);
  const render = (id: string) => {
    const l = getLayers(id);
    return composite({ art: l?.art ?? null, ink: l?.ink ?? null }, project.width, project.height, opts);
  };
  const base = safeName(project.name);

  const zip = async () => {
    setBusy('Preparing frames…');
    try {
      const cache = new Map<string, HTMLCanvasElement>();
      const imgs = outFrames.map((f) => cache.get(f.id) ?? (cache.set(f.id, render(f.id)), cache.get(f.id)!));
      const blob = await buildSequenceZip(imgs, { fps: project.fps, useHolds: holds, W: project.width * scale, H: project.height * scale, extras: { 'frames.csv': csv() } }, (d, t) => setBusy(`Packing ${d}/${t}…`));
      downloadBlob(blob, `${base}_frames.zip`);
      toast(`Downloaded ${imgs.length} numbered PNGs (${frameFileName(1)} … ${frameFileName(imgs.length)}).`, 'success');
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}. Your project is unchanged.`, 'error');
    } finally {
      setBusy(null);
    }
  };
  const csv = () => ['file,drawing,label,kind,hold', ...outFrames.map((f, i) => `${frameFileName(i + 1)},${frames.indexOf(f) + 1},"${f.label.replace(/"/g, "'")}",${f.kind},${f.hold}`)].join('\n');
  const current = async () => {
    const f = frames.find((x) => x.id === project.currentId)!;
    downloadBlob(await canvasToBlob(render(f.id)), `${base}_${String(frames.indexOf(f) + 1).padStart(2, '0')}.png`);
  };
  const poses = async () => {
    setBusy('Preparing poses…');
    try {
      const JSZip = (await import('jszip')).default;
      const z = new JSZip();
      for (let i = 0; i < frames.length; i++) z.file(`pose_${String(i + 1).padStart(2, '0')}_${safeName(frames[i].label).slice(0, 30)}.png`, await canvasToBlob(render(frames[i].id)));
      downloadBlob(await z.generateAsync({ type: 'blob', compression: 'STORE' }), `${base}_poses.zip`);
    } finally {
      setBusy(null);
    }
  };
  const projectFile = async () => {
    setBusy('Saving project file…');
    try {
      downloadBlob(await writeProjectFile(project, getLayers), `${base}.posepilot`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Export" icon={<Download size={16} />} onClose={() => actions.set({ dialog: null })} width={600}>
      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 items-center text-[12.5px]">
        <span className="text-paper-dim">Include</span>
        <Segmented label="Contents" value={contents} onChange={setContents} options={[{ value: 'both', label: 'Pose + my lines' }, { value: 'ink', label: 'My lines only' }, { value: 'art', label: 'Pose only' }]} />
        <span className="text-paper-dim">Background</span>
        <Segmented label="Background" value={bg} onChange={setBg} options={[{ value: 'transparent', label: 'Transparent' }, { value: 'white', label: 'White' }]} />
        <span className="text-paper-dim">Timing</span>
        <Segmented label="Timing" value={holds ? 'h' : 'n'} onChange={(v) => setHolds(v === 'h')} options={[{ value: 'h', label: 'Repeat held frames' }, { value: 'n', label: 'One image per drawing' }]} />
        <span className="text-paper-dim">Size</span>
        <Segmented label="Scale" value={scale} onChange={setScale} options={[1, 1.5, 2].map((s) => ({ value: s, label: `${Math.round(project.width * s)}×${Math.round(project.height * s)}` }))} />
      </div>
      <p className="text-[11px] text-paper-mute mt-2">Every image is exactly the same size with the character in the same place. Onion skins, rig handles and the checkerboard are never exported.</p>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <ExportCard icon={<FileArchive size={18} />} title="PNG sequence (ZIP)" sub={`${outFrames.length} files: frame_0001.png…  · ${project.fps} fps`} onClick={zip} primary busy={!!busy} testid="export-zip" />
        <ExportCard icon={<ImageDown size={18} />} title="This frame (PNG)" sub="Just the selected frame" onClick={current} busy={!!busy} />
        <ExportCard icon={<ImageDown size={18} />} title="Each pose (ZIP)" sub={`${frames.length} PNGs, one per drawing, named by pose`} onClick={poses} busy={!!busy} />
        <ExportCard icon={<Printer size={18} />} title="Pose reference sheet" sub="Printable page of all poses + notes" onClick={() => { actions.set({ dialog: null }); printPoseSheet(); }} busy={!!busy} />
        <ExportCard icon={<FileDown size={18} />} title="Project file (.posepilot)" sub="Keeps everything. Open it on any computer." onClick={projectFile} busy={!!busy} />
        <ExportCard icon={<Film size={18} />} title="How to import into Harmony" sub="Four quick steps" onClick={() => actions.set({ dialog: 'harmony' })} busy={false} />
      </div>
      {busy && <p className="mt-3 text-[12px] text-paper-dim flex items-center gap-2" role="status"><Loader2 size={14} className="animate-spin" /> {busy}</p>}
    </Modal>
  );
}

function ExportCard({ icon, title, sub, onClick, primary, busy, testid }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void; primary?: boolean; busy: boolean; testid?: string }) {
  return (
    <button disabled={busy} onClick={onClick} data-testid={testid}
      className={`text-left rounded-lg border p-3 flex gap-3 transition-colors disabled:opacity-50 ${primary ? 'border-accent bg-accent-glow hover:bg-accent/25' : 'border-ink-600 bg-ink-850 hover:border-ink-500'}`}>
      <span className={primary ? 'text-accent-hi' : 'text-paper-dim'}>{icon}</span>
      <span>
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-[11.5px] text-paper-mute leading-snug mt-0.5">{sub}</span>
      </span>
    </button>
  );
}

export function HarmonyDialog() {
  return (
    <Modal title="Import into Toon Boom Harmony" icon={<Film size={16} />} onClose={() => actions.set({ dialog: null })} width={480}>
      <ol className="space-y-2.5 text-[13px] leading-snug list-decimal pl-5 marker:text-accent">
        <li>In PosePilot, <b>Export → PNG sequence (ZIP)</b> and unzip it.</li>
        <li>In Harmony, open <b>Scene › Scene Settings</b> and set the frame rate to your PosePilot FPS.</li>
        <li><b>File › Import › Images…</b>, select all <code className="text-accent-hi">frame_####.png</code> files, choose <b>one layer</b> and leave <b>Vectorize</b> off.</li>
        <li>The images fill consecutive frames in order. Add a new drawing layer on top, turn on onion skin, and clean up or trace.</li>
      </ol>
      <p className="text-[11.5px] text-paper-mute mt-3">Tip: "Repeat held frames" bakes your timing into the files. Choose "One image per drawing" if you prefer to set exposures in Harmony's Xsheet.</p>
    </Modal>
  );
}

// ───────────────────────────── Pose sheet (print) ─────────────────────────────

let printHost: ((on: boolean) => void) | null = null;
export function printPoseSheet() {
  printHost?.(true);
}

export function PoseSheetHost() {
  const [on, setOn] = useState(false);
  const project = useStore((s) => s.project);
  printHost = setOn;
  useEffect(() => {
    if (!on) return;
    const done = () => setOn(false);
    window.addEventListener('afterprint', done, { once: true });
    const t = setTimeout(() => window.print(), 250);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [on]);
  const el = document.getElementById('print-root');
  if (!on || !project || !el) return null;
  const imgs = project.frames.map((f) => ({ f, url: compositeFrame(f.id, { background: 'white', scale: Math.min(1, 640 / project.width) }).toDataURL('image/jpeg', 0.85) }));
  const plan = project.plan;
  return createPortal(
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: 6, marginBottom: 10 }}>
        <div><div style={{ fontSize: 20, fontWeight: 700 }}>{project.name}</div><div style={{ fontSize: 11 }}>Pose reference sheet · {project.frames.length} drawings · {project.fps} fps</div></div>
        <div style={{ fontSize: 11, textAlign: 'right' }}>PosePilot<br />{new Date().toLocaleDateString()}<br />Name: ____________________</div>
      </div>
      {plan && <div style={{ fontSize: 12, marginBottom: 8 }}><b>Motion:</b> {project.prompt} — <i>{plan.summary}</i></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {imgs.map(({ f, url }, i) => (
          <div key={f.id} style={{ border: '1px solid #bbb', borderRadius: 6, padding: 6, breakInside: 'avoid' }}>
            <img src={url} style={{ width: '100%', display: 'block' }} />
            <div style={{ fontSize: 11.5, marginTop: 4 }}><b>{String(i + 1).padStart(2, '0')}. {f.label}</b> {f.role ? `· ${f.role}` : ''} · hold {f.hold}</div>
            <div style={{ fontSize: 10, color: '#555' }}>{({ original: 'Original drawing', ai: 'AI suggestion', rig: 'Rig pose', inbetween: 'In-between', drawn: 'Hand-drawn', coin: 'Coin flip' } as Record<string, string>)[f.kind]}{f.note ? ` — ${f.note}` : ''}</div>
          </div>
        ))}
      </div>
      {plan && (
        <div style={{ fontSize: 11.5, marginTop: 10 }}>
          <b>Why it works:</b>
          <ul style={{ margin: '4px 0 0 16px' }}>{plan.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {project.assignment && (
        <div style={{ fontSize: 12, marginTop: 10, border: '1px solid #bbb', borderRadius: 6, padding: 8 }}>
          <b>Reflection — What changed between your original pose and your final pose?</b>
          <div style={{ minHeight: 50, marginTop: 4, whiteSpace: 'pre-wrap' }}>{project.assignment.reflection}</div>
        </div>
      )}
    </div>,
    el,
  );
}

// ───────────────────────────── AI consent ─────────────────────────────

export function ConsentDialog() {
  const pending = useStore((s) => !!s.consentResolve);
  const ai = useStore((s) => s.ai);
  if (!pending) return null;
  return (
    <Modal title="Send your drawing to the AI?" icon={<ShieldCheck size={16} />} onClose={() => answerConsent(false)} width={500}
      footer={<><button className="btn" onClick={() => { answerConsent(false); setSettings({ mode: 'rig' }); }}>No — use Rig mode</button><button className="btn btn-primary" onClick={() => answerConsent(true)} data-testid="consent-yes">Yes, send my drawing</button></>}>
      <div className="space-y-2.5 text-[13px] leading-snug text-paper-dim">
        <p>To draw new poses, PosePilot sends <b className="text-paper">a copy of your drawing</b> and a stick-figure pose guide to <b className="text-paper">{ai?.label ?? 'the AI service'}</b> through your school's PosePilot server.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>PosePilot's server does not store your drawing.</li>
          <li>The AI company processes it under its own privacy terms and may keep it for a short time to check for misuse.</li>
          <li>Your project itself stays on this device.</li>
        </ul>
        <p className="text-[12px]">You'll only be asked once per project. Not sure? Ask your teacher, or use Rig mode, which never leaves this computer.</p>
      </div>
    </Modal>
  );
}

// ───────────────────────────── In-betweens ─────────────────────────────

export function InbetweenDialog() {
  const target = useStore((s) => s.inbetweenTarget);
  const ai = useStore((s) => s.ai);
  const project = useStore((s) => s.project);
  const [count, setCount] = useState(project?.plan?.timing.inbetweensPerGap ?? 2);
  if (!project || !target) return null;
  const i = project.frames.findIndex((f) => f.id === target);
  const a = project.frames[i], b = project.frames[i + 1];
  if (!a || !b) return null;
  const rigOk = canRigInbetween(a.id);
  const close = () => actions.set({ dialog: null, inbetweenTarget: null });
  return (
    <Modal title="Add in-betweens" icon={<Sparkles size={16} />} onClose={close} width={520}>
      <p className="text-[12.5px] text-paper-dim mb-3">Between <b className="text-paper">{a.label}</b> and <b className="text-paper">{b.label}</b>. In-betweens are the drawings that smooth the move from one key pose to the next.</p>
      <div className="space-y-2">
        <Option disabled={!rigOk} icon={<Bone size={16} />} title="Rig in-betweens" badge="Real interpolation"
          sub={rigOk ? 'The rig moves every joint part-way, with ease-in/ease-out. Exact and offline.' : 'Needs two rig poses (or a demo/cut-out character) on both sides.'}
          extra={rigOk && <Segmented size="sm" label="How many" value={count} onChange={setCount} options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />}
          action={() => { addRigInbetweens(a.id, count); close(); }} cta={`Add ${count}`} testid="ib-rig" />
        <Option disabled={!ai?.configured} icon={<Sparkles size={16} />} title="AI in-between" badge="AI drawing"
          sub={ai?.configured ? 'The AI draws one pose halfway between the two drawings. Check it carefully.' : 'AI is not set up on this server.'}
          action={() => { close(); void addAiInbetween(a.id); }} cta="Generate" />
        <Option icon={<PenLine size={16} />} title="Draw it yourself" badge="Traditional"
          sub="Adds a blank frame with onion skin showing the poses before and after — the classic way."
          action={() => { close(); addBlankInbetween(a.id); }} cta="Add blank" testid="ib-blank" />
      </div>
      <p className="text-[11px] text-paper-mute mt-3 flex gap-1.5"><Info size={13} className="shrink-0" /> PosePilot never fades two pictures together and calls it an in-between — a blend isn't a real drawing.</p>
    </Modal>
  );
}

function Option({ icon, title, sub, badge, action, cta, disabled, extra, testid }: { icon: React.ReactNode; title: string; sub: string; badge: string; action: () => void; cta: string; disabled?: boolean; extra?: React.ReactNode; testid?: string }) {
  return (
    <div className={`rounded-lg border border-ink-600 bg-ink-850 p-3 flex items-center gap-3 ${disabled ? 'opacity-55' : ''}`}>
      <span className="text-paper-dim">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[13px] font-medium">{title} <span className="text-[10px] uppercase tracking-wide text-paper-mute border border-ink-600 rounded px-1">{badge}</span></div>
        <p className="text-[11.5px] text-paper-mute leading-snug mt-0.5">{sub}</p>
        {extra && <div className="mt-1.5">{extra}</div>}
      </div>
      <button className="btn shrink-0" disabled={disabled} onClick={action} data-testid={testid}>{cta}</button>
    </div>
  );
}

// ───────────────────────────── Coin flip ─────────────────────────────

export function CoinFlipDialog() {
  const project = useStore((s) => s.project);
  const [o, setO] = useState<CoinOptions>(DEFAULT_COIN);
  const [faces, setFaces] = useState<{ front: HTMLCanvasElement; back: HTMLCanvasElement }>(() => ({ front: demoCoinFace('front'), back: demoCoinFace('back') }));
  const [custom, setCustom] = useState({ front: false, back: false });
  const preview = useRef<HTMLCanvasElement>(null);
  const W = project?.width ?? 1280, H = project?.height ?? 720;
  const frames = useMemo(() => renderCoinFrames(faces.front, faces.back, W / 4, H / 4, o), [faces, o, W, H]);
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      const c = preview.current;
      if (!c) return;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(frames[i % frames.length], 0, 0, c.width, c.height);
      i++;
    }, 1000 / 12);
    return () => clearInterval(t);
  }, [frames]);
  const upload = (side: 'front' | 'back') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const c = await loadImageFile(f);
        setFaces((x) => ({ ...x, [side]: squareFromBox(c, contentBBox(c)) }));
        setCustom((x) => ({ ...x, [side]: true }));
      } catch (e) { toast((e as Error).message, 'error'); }
    };
    input.click();
  };
  const add = () => {
    if (!project) newProject({ name: 'Coin flip', width: 1280, height: 720 });
    const p = actions.get().project!;
    const full = renderCoinFrames(faces.front, faces.back, p.width, p.height, o);
    insertProceduralFrames(full, 'coin', 'Coin', `Coin flip: ${o.turns} turn${o.turns > 1 ? 's' : ''} ${o.direction === 1 ? 'toward' : 'away from'} the viewer, ${o.easing === 'linear' ? 'steady speed' : 'eased'}. Procedural rotation of your two drawings.`);
    actions.set({ dialog: null });
    toast(`Added ${full.length} coin frames.`, 'success');
  };
  return (
    <Modal title="Coin Flip Assistant" icon={<Coins size={16} />} onClose={() => actions.set({ dialog: null })} width={640}
      footer={<><button className="btn" onClick={() => actions.set({ dialog: null })}>Cancel</button><button className="btn btn-primary" onClick={add} data-testid="coin-add">Add {o.frames} frames to timeline</button></>}>
      <div className="grid grid-cols-[220px_1fr] gap-4">
        <div>
          <canvas ref={preview} width={220} height={Math.round((220 * H) / W)} className="checker rounded-lg w-full" aria-label="Coin flip preview" />
          <div className="grid grid-cols-2 gap-2 mt-2">
            {(['front', 'back'] as const).map((side) => (
              <button key={side} className="btn !h-auto py-2 flex-col" onClick={() => upload(side)}>
                <FaceThumb c={faces[side]} />
                <span className="text-[11.5px]">{custom[side] ? 'Change' : 'Upload'} {side}</span>
              </button>
            ))}
          </div>
          <p className="text-[10.5px] text-paper-mute mt-2">Draw the two sides of your coin (or any flat object). PosePilot rotates them with 2D/3D transforms — no AI needed.</p>
        </div>
        <div className="space-y-2.5 text-[12px]">
          <Row label="Drawings"><Segmented size="sm" label="Frames" value={o.frames} onChange={(v) => setO({ ...o, frames: v })} options={[8, 12, 16, 24].map((n) => ({ value: n, label: String(n) }))} /></Row>
          <Row label="Turns"><Segmented size="sm" label="Turns" value={o.turns} onChange={(v) => setO({ ...o, turns: v })} options={[0.5, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} /></Row>
          <Row label="Flip"><Segmented size="sm" label="Axis" value={o.axis} onChange={(v) => setO({ ...o, axis: v })} options={[{ value: 'horizontal', label: 'Head over tail' }, { value: 'vertical', label: 'Spin sideways' }]} /></Row>
          <Row label="Direction"><Segmented size="sm" label="Direction" value={o.direction} onChange={(v) => setO({ ...o, direction: v })} options={[{ value: 1, label: 'Toward viewer' }, { value: -1, label: 'Away' }]} /></Row>
          <Row label="Easing"><Segmented size="sm" label="Easing" value={o.easing} onChange={(v) => setO({ ...o, easing: v })} options={[{ value: 'easeInOut', label: 'Ease in/out' }, { value: 'easeOut', label: 'Slow at end' }, { value: 'linear', label: 'Steady' }]} /></Row>
          <Slider label="Toss height" value={Math.round(o.arc * 100)} min={0} max={50} onChange={(v) => setO({ ...o, arc: v / 100 })} format={(v) => `${v}%`} />
          <Slider label="Thickness" value={Math.round(o.thickness * 100)} min={0} max={20} onChange={(v) => setO({ ...o, thickness: v / 100 })} format={(v) => `${v}%`} />
          <Slider label="Size" value={Math.round(o.size * 100)} min={10} max={70} onChange={(v) => setO({ ...o, size: v / 100 })} format={(v) => `${v}%`} />
          <label className="flex items-center gap-2 text-paper-dim">Edge colour <input type="color" value={o.rimColor} onChange={(e) => setO({ ...o, rimColor: e.target.value })} /></label>
        </div>
      </div>
    </Modal>
  );
}

function FaceThumb({ c }: { c: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const g = ref.current?.getContext('2d'); if (g) { g.clearRect(0, 0, 48, 48); g.drawImage(c, 0, 0, 48, 48); } }, [c]);
  return <canvas ref={ref} width={48} height={48} className="w-10 h-10" />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-paper-dim">{label}</span>{children}</div>;
}

// ───────────────────────────── Teacher ─────────────────────────────

export const ASSIGNMENTS: { id: Assignment['id']; letter: string; title: string; goal: string; prompt: string; steps: string[]; demo: DemoId }[] = [
  {
    id: 'anticipation', letter: 'A', title: 'Anticipation', demo: 'sticks',
    goal: 'Draw or upload a character and generate a jump with anticipation.',
    prompt: 'Make the character crouch and jump forward',
    steps: ['Start with your character (or the demo).', 'Ask for a jump — the first pose should be a crouch.', 'Compare the crouch with your original. Make the crouch deeper if it looks weak.', 'Play it at 12 fps. Try a longer hold on the crouch.'],
  },
  {
    id: 'action', letter: 'B', title: 'Action', demo: 'pip',
    goal: 'Create a three-pose punch sequence that communicates weight and force.',
    prompt: 'Make the character throw a powerful right punch',
    steps: ['Generate 3 poses for a punch.', 'Check the strike pose: is the back leg pushing the weight forward?', 'Trace over the strike pose and exaggerate it.', 'Give the strike a short hold and the wind-up a longer one.'],
  },
  {
    id: 'follow-through', letter: 'C', title: 'Follow-Through', demo: 'sticks',
    goal: 'Animate a character throwing an object and explain the follow-through.',
    prompt: 'Make the character throw a ball',
    steps: ['Generate a throw with 3 poses.', 'Look at the last pose: the arm keeps moving after the release.', 'Add in-betweens before the follow-through pose.', 'Answer the reflection question.'],
  },
];

export function TeacherDialog() {
  const [sel, setSel] = useState<Assignment['id']>('anticipation');
  const a = ASSIGNMENTS.find((x) => x.id === sel)!;
  const start = (source: 'demo' | 'upload' | 'example') => {
    const assignment: Assignment = { id: a.id, reflection: '', started: Date.now() };
    if (source === 'upload') {
      actions.set({ dialog: null });
      void pickAndImport('new-project').then(() => {
        const unsub = useStore.subscribe((s, prev) => {
          if (s.project && s.project.id !== prev.project?.id) {
            unsub();
            actions.set((st) => ({ project: st.project ? { ...st.project, assignment } : null }));
            setPrompt(a.prompt);
          }
        });
      });
      return;
    }
    const d = createDemo(a.demo, 1280, 720);
    newProject({ name: source === 'example' ? `Example — ${a.title}` : `Assignment ${a.letter} — ${a.title}`, width: 1280, height: 720, art: d.art, rig: d.rig, rigStyle: d.style, originalPose: d.rig.rest, assignment, prompt: a.prompt, screen: source === 'example' ? 'studio' : 'quick' });
    setSettings({ mode: 'rig', poseCount: 3 });
    if (source === 'example') {
      generateRigPoses();
      actions.set({ playing: false });
      toast('Example built with the rig: press Play to show it, then step through the poses.', 'success');
    }
    actions.set({ dialog: null });
  };
  return (
    <Modal title="Lessons & assignments" icon={<GraduationCap size={16} />} onClose={() => actions.set({ dialog: null })} width={680}>
      <div className="grid grid-cols-3 gap-2">
        {ASSIGNMENTS.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={`text-left rounded-lg border p-3 transition-colors ${sel === x.id ? 'border-accent bg-accent-glow' : 'border-ink-600 bg-ink-850 hover:border-ink-500'}`}>
            <span className="text-[10.5px] text-paper-mute font-semibold">ASSIGNMENT {x.letter}</span>
            <span className="block text-[14px] font-semibold mt-0.5">{x.title}</span>
            <span className="block text-[11.5px] text-paper-dim leading-snug mt-1">{x.goal}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-ink-700 bg-ink-850 p-3">
        <p className="label mb-2">Steps for students</p>
        <ol className="list-decimal pl-5 space-y-1 text-[12.5px] text-paper-dim marker:text-accent">{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <p className="text-[12px] mt-2 text-paper-dim">Starter prompt: <span className="text-paper">"{a.prompt}"</span></p>
        <p className="text-[12px] mt-1 text-paper-dim">Reflection: <span className="text-paper">"What changed between your original pose and your final pose?"</span></p>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <button className="btn" onClick={() => start('example')} data-testid="teacher-example"><Play size={14} /> Show worked example</button>
        <div className="flex-1" />
        <button className="btn" onClick={() => start('upload')}><Upload size={14} /> Start with my drawing</button>
        <button className="btn btn-primary" onClick={() => start('demo')} data-testid="teacher-start">Start with demo character</button>
      </div>
      <p className="text-[11px] text-paper-mute mt-3">No accounts or class lists: students' work stays in their browser. Have them hand in the exported ZIP, pose sheet, or .posepilot project file.</p>
    </Modal>
  );
}

// ───────────────────────────── Misc ─────────────────────────────

export function ShortcutsDialog() {
  const rows: [string, string][] = [
    ['B', 'Draw'], ['E', 'Eraser'], ['M', 'Select'], ['V', 'Move / rotate / scale'], ['H', 'Pan'], ['P', 'Pose Rig'], ['O', 'Onion skin on/off'],
    ['[  ]', 'Brush size'], ['Space', 'Play / pause'], [',  .', 'Previous / next frame'], ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
    ['Ctrl + scroll', 'Zoom'], ['Scroll / two fingers', 'Pan'], ['0', 'Fit to screen'], ['Enter / Esc', 'Apply / cancel a transform'], ['Delete', 'Delete selection'], ['Ctrl+S', 'Save now'],
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={() => actions.set({ dialog: null })} width={460}>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
        {rows.map(([k, d]) => (
          <Fragment key={k}>
            <span className="text-right"><span className="kbd">{k}</span></span>
            <span className="text-paper-dim">{d}</span>
          </Fragment>
        ))}
      </div>
    </Modal>
  );
}

export function AboutDialog() {
  const ai = useStore((s) => s.ai);
  return (
    <Modal title="About AI, rigs & privacy" icon={<Info size={16} />} onClose={() => actions.set({ dialog: null })} width={540}>
      <div className="space-y-3 text-[12.5px] text-paper-dim leading-snug">
        <p><b className="text-kind-ai">AI drawing</b> sends your drawing plus a stick-figure pose guide to an image model, which <i>redraws</i> your character in the new pose. Results are suggestions: proportions or details may drift, so check and trace them.</p>
        <p><b className="text-kind-rig">Rig poses</b> move a skeleton with exact angles — offline and instant. A rig can draw a stick figure, the demo characters, or pieces of your own drawing pinned to bones (cut-out). It cannot invent new detail, such as a hand seen from a new angle.</p>
        <p><b className="text-kind-inbetween">In-betweens</b> come from the rig (true interpolation), from AI, or from you. PosePilot never fades two images together and calls it animation.</p>
        <div className="rounded-lg border border-ink-700 bg-ink-850 p-3">
          <p className="label mb-1">This server</p>
          {ai?.configured ? <p>AI is on: {ai.label} ({ai.model}). {ai.costNote} Limit: {ai.maxPerHour || 'no'} generations per hour per computer.</p> : <p>{ai?.reason ?? 'Checking…'}</p>}
        </div>
        <p>Projects are saved only in this browser (IndexedDB). Clearing browser data deletes them, so download a project file for anything important.</p>
      </div>
    </Modal>
  );
}

export function NewProjectDialog() {
  const [size, setSize] = useState('720');
  const [name, setName] = useState('My animation');
  const create = (kind: 'blank' | 'upload' | DemoId) => {
    const dims = SIZES.find((s) => s.id === size)!;
    actions.set({ dialog: null });
    if (kind === 'upload') return void pickAndImport('new-project');
    if (kind === 'blank') {
      newProject({ name, width: dims.w, height: dims.h, firstLabel: 'My character', screen: actions.get().screen === 'quick' ? 'quick' : 'studio' });
      actions.set({ tool: 'draw', activeLayer: 'art', brushSize: 7 });
      return;
    }
    const d = createDemo(kind, dims.w, dims.h);
    newProject({ name: `${d.name} animation`, width: dims.w, height: dims.h, art: d.art, rig: d.rig, rigStyle: d.style, originalPose: d.rig.rest, screen: actions.get().screen === 'quick' ? 'quick' : 'studio' });
    setSettings({ mode: 'rig' });
  };
  return (
    <Modal title="New project" onClose={() => actions.set({ dialog: null })} width={520}>
      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <label><span className="label">Name</span><input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <Segmented label="Canvas size" value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s.id, label: s.label, title: s.sub }))} />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button className="btn !h-12" onClick={() => create('upload')}><Upload size={15} /> Upload a drawing</button>
        <button className="btn !h-12" onClick={() => create('blank')}><PenLine size={15} /> Draw a new character</button>
        <button className="btn !h-12" onClick={() => create('sticks')}><Bone size={15} /> Demo: Sticks</button>
        <button className="btn !h-12" onClick={() => create('pip')}><Bone size={15} /> Demo: Pip</button>
      </div>
    </Modal>
  );
}


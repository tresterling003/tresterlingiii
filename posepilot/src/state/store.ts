import { create } from 'zustand';
import { fetchAiStatus, requestPose, AiError, type AiStatus } from '../lib/ai/client';
import { buildInbetweenPrompt, buildPosePrompt } from '../lib/ai/prompt';
import { AI_SIZE, cropTo, placeResult, referenceRegion, renderGuideImage, rigForBox } from '../lib/ai/compose';
import { compareToOriginal } from '../lib/ai/consistency';
import { applyCorrection } from '../lib/motion/corrections';
import { planMotion, type MotionPlan, type PlannedKey } from '../lib/motion/planner';
import { analyzeBackground, canvasToBlob, cloneCanvas, contentBBox, ctx2d, dataUrlToCanvas, dominantInkColor, downscale, makeCanvas, removePlainBackground, type BackgroundInfo, type Rect } from '../lib/raster/image';
import { DEFAULT_STICK, renderRig, type RigStyle } from '../lib/rig/render';
import { clonePose, inbetweenPoses, neutralPose, type CharacterRig, type RigPose } from '../lib/rig/skeleton';
import { composite } from '../lib/export/sequence';
import { deleteProject as dbDeleteProject, getBlob, listBlobKeys, loadProjectRecord, saveProjectRecord } from '../lib/storage/db';
import { readProjectFile } from '../lib/storage/projectFile';
import { history } from './history';
import { clearAllLayers, ensureLayers, getLayers, markDirty, restoreDirty, setLayers, takeDirty } from './layers';
import { DEFAULT_SETTINGS, type Assignment, type Frame, type GenSettings, type LayerName, type ProjectData, type Tool } from './types';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export type Screen = 'start' | 'studio' | 'quick';
export type Dialog = null | 'export' | 'harmony' | 'teacher' | 'coin' | 'shortcuts' | 'newProject' | 'explain' | 'about' | 'inbetween';
export interface Toast { id: number; kind: 'info' | 'success' | 'error'; text: string; action?: { label: string; run: () => void } }
export interface JobItem { keyIndex: number; label: string; status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'; error?: string; frameId?: string }
export interface Job { id: number; mode: 'ai' | 'rig'; title: string; items: JobItem[]; status: 'running' | 'done' | 'cancelled' | 'error'; message?: string }
export interface ImportDraft { canvas: HTMLCanvasElement; name: string; bg: BackgroundInfo; target: 'new-project' | 'new-frame' | 'replace' }

export interface State {
  screen: Screen;
  project: ProjectData | null;
  bitmapVersion: number;
  historyTick: number;
  tool: Tool;
  brushColor: string;
  brushSize: number;
  eraserSize: number;
  activeLayer: LayerName;
  artOpacity: number;
  onion: { enabled: boolean; prev: boolean; next: boolean; original: boolean; opacity: number };
  showRig: boolean;
  rigMode: 'pose' | 'fit' | 'cut';
  cutBone: string;
  fitToken: number;
  rightOpen: boolean;
  playing: boolean;
  loop: boolean;
  playhead: number;
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
  ai: AiStatus | null;
  job: Job | null;
  dialog: Dialog;
  importDraft: ImportDraft | null;
  consentResolve: ((ok: boolean) => void) | null;
  toasts: Toast[];
  quickStep: 1 | 2 | 3 | 4;
  inbetweenTarget: string | null;
}

const initial: State = {
  screen: 'start',
  project: null,
  bitmapVersion: 0,
  historyTick: 0,
  tool: 'draw',
  brushColor: '#1d1f24',
  brushSize: 6,
  eraserSize: 24,
  activeLayer: 'ink',
  artOpacity: 1,
  onion: { enabled: true, prev: true, next: false, original: false, opacity: 0.35 },
  showRig: true,
  rigMode: 'pose',
  cutBone: 'faR',
  fitToken: 0,
  rightOpen: true,
  playing: false,
  loop: true,
  playhead: 0,
  saveStatus: 'saved',
  ai: null,
  job: null,
  dialog: null,
  importDraft: null,
  consentResolve: null,
  toasts: [],
  quickStep: 1,
  inbetweenTarget: null,
};

export const useStore = create<State>(() => initial);
const get = useStore.getState;
const set = useStore.setState;
history.onChange = () => set((s) => ({ historyTick: s.historyTick + 1 }));

// ───────────────────────────── helpers ─────────────────────────────

export const bump = () => set((s) => ({ bitmapVersion: s.bitmapVersion + 1 }));

let toastId = 1;
export function toast(text: string, kind: Toast['kind'] = 'info', action?: Toast['action'], ms = 5200) {
  const id = toastId++;
  set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text, action }] }));
  if (ms > 0) setTimeout(() => dismissToast(id), kind === 'error' ? ms * 1.8 : ms);
}
export const dismissToast = (id: number) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));

function proj(): ProjectData {
  const p = get().project;
  if (!p) throw new Error('No project open');
  return p;
}
function patchProject(patch: Partial<ProjectData>) {
  set((s) => (s.project ? { project: { ...s.project, ...patch } } : {}));
}
export function frameById(id: string | null | undefined): Frame | undefined {
  return get().project?.frames.find((f) => f.id === id);
}
export function currentFrame(): Frame | undefined {
  const p = get().project;
  return p?.frames.find((f) => f.id === p.currentId);
}
/** The drawing poses are generated from: the first "original" frame, else the first frame. */
export function referenceFrame(): Frame | undefined {
  const p = get().project;
  return p?.frames.find((f) => f.kind === 'original') ?? p?.frames[0];
}

export function compositeFrame(id: string, o: { art?: boolean; ink?: boolean; background?: 'transparent' | 'white'; scale?: number } = {}) {
  const p = proj();
  const l = getLayers(id);
  return composite({ art: l?.art ?? null, ink: l?.ink ?? null }, p.width, p.height, {
    includeArt: o.art ?? true,
    includeInk: o.ink ?? true,
    background: o.background ?? 'transparent',
    scale: o.scale ?? 1,
  });
}

function rigSourceCanvas(style: RigStyle | null): HTMLCanvasElement | null {
  if (!style || style.kind !== 'cutout') return null;
  const l = getLayers(style.sourceFrameId);
  return l?.source ?? l?.art ?? null;
}

/** Re-draw a rig-driven frame's art layer from its pose. */
export function renderRigFrame(f: Frame) {
  const p = proj();
  if (!f.rigPose || !p.rig || !p.rigStyle) return;
  if (!(f.kind === 'rig' || (f.kind === 'inbetween' && f.ibMethod === 'rig'))) return;
  const l = ensureLayers(f.id, p.width, p.height);
  const g = ctx2d(l.art);
  g.clearRect(0, 0, l.art.width, l.art.height);
  renderRig(g, p.rig, f.rigPose, p.rigStyle, rigSourceCanvas(p.rigStyle));
  l.source = cloneCanvas(l.art);
  markDirty(f.id, 'art');
  markDirty(f.id, 'source');
}

function rerenderAllRigFrames() {
  for (const f of proj().frames) renderRigFrame(f);
  bump();
}

// ───────────────────────────── history helpers ─────────────────────────────

/** Record a change to the frame list (order, holds, labels, added/removed frames) as one undo step. */
export function commitFrames(label: string, mutate: (frames: Frame[]) => { frames: Frame[]; currentId?: string }) {
  const p = proj();
  const before = { frames: p.frames, currentId: p.currentId };
  const res = mutate(p.frames.slice());
  const after = { frames: res.frames, currentId: res.currentId ?? (res.frames.some((f) => f.id === p.currentId) ? p.currentId : res.frames[0]?.id) };
  const apply = (st: typeof before) => {
    const cur = get().project;
    if (!cur) return;
    const known = new Set(cur.frames.map((f) => f.id));
    // frames coming back (undo of delete) must be saved again
    st.frames.filter((f) => !known.has(f.id)).forEach((f) => { markDirty(f.id, 'art'); markDirty(f.id, 'ink'); markDirty(f.id, 'source'); });
    patchProject({ frames: st.frames, currentId: st.currentId });
    bump();
  };
  apply(after);
  history.push({ label, undo: () => apply(before), redo: () => apply(after), bytes: 2000 });
}

export function commitPixels(frameId: string, layer: LayerName, rect: Rect, before: ImageData, after: ImageData, label: string) {
  const put = (img: ImageData) => {
    const l = getLayers(frameId);
    if (!l) return;
    ctx2d(l[layer]).putImageData(img, rect.x, rect.y);
    markDirty(frameId, layer);
    bump();
  };
  markDirty(frameId, layer);
  history.push({ label, undo: () => put(before), redo: () => put(after), bytes: before.data.length * 2 });
}

/** Swap whole layer canvases (used by regenerate / restore / clear / background removal). Fully undoable. */
export function commitLayerSwap(frameId: string, next: { art?: HTMLCanvasElement; ink?: HTMLCanvasElement; source?: HTMLCanvasElement | null }, metaPatch: Partial<Frame>, label: string) {
  const p = proj();
  const l = ensureLayers(frameId, p.width, p.height);
  const prev = { art: l.art, ink: l.ink, source: l.source };
  const prevMeta = frameById(frameId)!;
  const after = { ...prev, ...next };
  const metaKeys = Object.keys(metaPatch) as (keyof Frame)[];
  const beforePatch = Object.fromEntries(metaKeys.map((k) => [k, prevMeta[k]])) as Partial<Frame>;
  const apply = (layers: typeof prev, patch: Partial<Frame>) => {
    setLayers(frameId, { ...layers });
    (['art', 'ink', 'source'] as const).forEach((k) => markDirty(frameId, k));
    const cur = get().project;
    if (cur) patchProject({ frames: cur.frames.map((f) => (f.id === frameId ? { ...f, ...patch } : f)) });
    bump();
  };
  apply(after, metaPatch);
  const px = p.width * p.height * 4;
  history.push({ label, undo: () => apply(prev, beforePatch), redo: () => apply(after, metaPatch), bytes: px * 3 });
}

export function commitFramePose(frameId: string, before: RigPose, after: RigPose, label = 'Pose change') {
  const apply = (pose: RigPose) => {
    const cur = get().project;
    if (!cur) return;
    const frames = cur.frames.map((f) => (f.id === frameId ? { ...f, rigPose: clonePose(pose) } : f));
    patchProject({ frames });
    renderRigFrame(frames.find((f) => f.id === frameId)!);
    bump();
  };
  apply(after);
  history.push({ label, undo: () => apply(before), redo: () => apply(after), bytes: 4000 });
}

/** Live preview while dragging a joint (no history; commit on release). */
export function previewFramePose(frameId: string, pose: RigPose) {
  const cur = proj();
  const frames = cur.frames.map((f) => (f.id === frameId ? { ...f, rigPose: pose } : f));
  patchProject({ frames });
  renderRigFrame(frames.find((f) => f.id === frameId)!);
  bump();
}

export function commitRig(before: { rig: CharacterRig | null; style: RigStyle | null }, after: { rig: CharacterRig | null; style: RigStyle | null }, label = 'Rig change') {
  const apply = (st: typeof before) => {
    patchProject({ rig: st.rig, rigStyle: st.style });
    const pr = get().project;
    if (pr?.prompt.trim()) patchProject({ plan: computePlan(pr.prompt, pr.settings) });
    if (pr?.rig) rerenderAllRigFrames();
    else bump();
  };
  apply(after);
  history.push({ label, undo: () => apply(before), redo: () => apply(after), bytes: 4000 });
}

export function previewRig(rig: CharacterRig, style?: RigStyle) {
  patchProject({ rig, ...(style ? { rigStyle: style } : {}) });
  bump();
}

export function undo() {
  const l = history.undo();
  if (l) toast(`Undid: ${l}`, 'info', undefined, 1600);
}
export function redo() {
  const l = history.redo();
  if (l) toast(`Redid: ${l}`, 'info', undefined, 1600);
}

// ───────────────────────────── project lifecycle ─────────────────────────────

export interface NewProjectOptions {
  name: string;
  width: number;
  height: number;
  art?: HTMLCanvasElement | null;
  rig?: CharacterRig | null;
  rigStyle?: RigStyle | null;
  screen?: Screen;
  firstLabel?: string;
  assignment?: Assignment | null;
  prompt?: string;
  /** Set when the original drawing was itself rendered from the rig (demo characters). */
  originalPose?: RigPose;
}

export function newProject(o: NewProjectOptions) {
  history.clear();
  clearAllLayers();
  const fid = uid();
  const l = ensureLayers(fid, o.width, o.height);
  if (o.art) {
    ctx2d(l.art).drawImage(o.art, 0, 0, o.width, o.height);
    l.source = cloneCanvas(l.art);
  }
  const now = Date.now();
  const project: ProjectData = {
    id: uid(),
    name: o.name,
    width: o.width,
    height: o.height,
    fps: 12,
    background: 'transparent',
    createdAt: now,
    updatedAt: now,
    frames: [{ id: fid, kind: 'original', label: o.firstLabel ?? 'Original', hold: 4, hasSource: !!o.art, rigPose: o.originalPose }],
    currentId: fid,
    rig: o.rig ?? null,
    rigStyle: o.rigStyle ?? null,
    prompt: o.prompt ?? '',
    plan: null,
    settings: { ...DEFAULT_SETTINGS, mode: get().ai?.configured && !o.rig ? 'ai' : 'rig' },
    aiConsent: false,
    assignment: o.assignment ?? null,
  };
  markDirty(fid, 'art');
  markDirty(fid, 'ink');
  markDirty(fid, 'source');
  set({
    project,
    screen: o.screen ?? 'studio',
    tool: o.art ? 'draw' : 'draw',
    activeLayer: o.art ? 'ink' : 'art',
    playing: false,
    playhead: 0,
    job: null,
    quickStep: o.art ? 2 : 1,
    fitToken: get().fitToken + 1,
  });
  if (o.prompt) setPrompt(o.prompt);
  bump();
  scheduleSave(true);
}

export async function openProject(id: string) {
  const rec = await loadProjectRecord<ProjectData>(id);
  if (!rec) throw new Error('Project not found');
  history.clear();
  clearAllLayers();
  for (const f of rec.frames) {
    const l = ensureLayers(f.id, rec.width, rec.height);
    const [art, ink, source] = await Promise.all(['art', 'ink', 'source'].map((n) => getBlob(`${rec.id}/${f.id}/${n}`)));
    if (art) ctx2d(l.art).drawImage(await createImageBitmap(art), 0, 0);
    if (ink) ctx2d(l.ink).drawImage(await createImageBitmap(ink), 0, 0);
    if (source) {
      l.source = makeCanvas(rec.width, rec.height);
      ctx2d(l.source).drawImage(await createImageBitmap(source), 0, 0);
    }
  }
  const settings = { ...DEFAULT_SETTINGS, ...rec.settings };
  set({ project: { ...rec, settings, currentId: rec.frames.some((f) => f.id === rec.currentId) ? rec.currentId : rec.frames[0].id }, screen: lastScreen() === 'quick' ? 'quick' : 'studio', playing: false, playhead: 0, job: null, saveStatus: 'saved', fitToken: get().fitToken + 1, quickStep: rec.frames.length > 1 ? 3 : 2 });
  rememberLast();
  bump();
}

export async function importProjectFile(file: File) {
  const { data, layers } = await readProjectFile<ProjectData>(file);
  history.clear();
  clearAllLayers();
  const id = uid(); // a copy: never overwrite another local project
  for (const f of data.frames) {
    const l = ensureLayers(f.id, data.width, data.height);
    const src = layers.get(f.id);
    if (src?.art) ctx2d(l.art).drawImage(src.art, 0, 0);
    if (src?.ink) ctx2d(l.ink).drawImage(src.ink, 0, 0);
    if (src?.source) l.source = src.source;
    (['art', 'ink', 'source'] as const).forEach((k) => markDirty(f.id, k));
  }
  set({ project: { ...data, id, settings: { ...DEFAULT_SETTINGS, ...data.settings }, updatedAt: Date.now() }, screen: 'studio', playing: false, job: null, fitToken: get().fitToken + 1 });
  bump();
  scheduleSave(true);
  toast(`Opened "${data.name}"`, 'success');
}

export function closeProject() {
  void saveNow();
  set({ screen: 'start', project: null, playing: false, job: null });
  history.clear();
  localStorage.removeItem('posepilot:last');
}

export async function deleteStoredProject(id: string) {
  await dbDeleteProject(id);
}

export function renameProject(name: string) {
  patchProject({ name: name.slice(0, 80) || 'Untitled' });
  scheduleSave();
}

function lastScreen(): Screen | null {
  try { return JSON.parse(localStorage.getItem('posepilot:last') || 'null')?.screen ?? null; } catch { return null; }
}
function rememberLast() {
  const p = get().project;
  if (p) localStorage.setItem('posepilot:last', JSON.stringify({ id: p.id, screen: get().screen }));
}

export async function boot() {
  fetchAiStatus().then((ai) => {
    set({ ai });
    const p = get().project;
    if (p && ai.configured && p.frames.length === 1 && !p.rig) setSettings({ mode: 'ai' });
  });
  try {
    const last = JSON.parse(localStorage.getItem('posepilot:last') || 'null');
    if (last?.id) {
      await openProject(last.id);
      toast('Restored your last project', 'success', undefined, 2400);
    }
  } catch {
    localStorage.removeItem('posepilot:last');
  }
}

export function setScreen(screen: Screen) {
  set({ screen, playing: false });
  rememberLast();
}

// ───────────────────────────── autosave ─────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;
let changedDuringSave = false;
const thumbs = new Map<string, string>(); // project id → small preview for the project list (kept out of React state)

export function scheduleSave(immediate = false) {
  if (!get().project) return;
  if (get().saveStatus !== 'saving') set({ saveStatus: 'unsaved' });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), immediate ? 50 : 700);
}

export async function saveNow(): Promise<void> {
  if (saving) await saving;
  const p = get().project;
  if (!p) return;
  if (saveTimer) clearTimeout(saveTimer);
  const keys = takeDirty();
  const run = async () => {
    set({ saveStatus: 'saving' });
    try {
      const blobs = new Map<string, Blob>();
      const removals: string[] = [];
      const ids = new Set(p.frames.map((f) => f.id));
      for (const k of keys) {
        const [fid, layer] = k.split(':');
        if (!ids.has(fid)) continue;
        const l = getLayers(fid);
        if (!l) continue;
        const c = layer === 'source' ? l.source : l[layer as LayerName];
        const key = `${p.id}/${fid}/${layer}`;
        if (c) blobs.set(key, await canvasToBlob(c));
        else removals.push(key);
      }
      const existing = await listBlobKeys(`${p.id}/`);
      for (const k of existing) if (!ids.has(k.split('/')[1])) removals.push(k);
      const first = getLayers(p.frames[0].id);
      let thumb = thumbs.get(p.id) ?? p.thumb;
      if (first && (!thumb || keys.some((k) => k.startsWith(p.frames[0].id)))) {
        thumb = downscale(compositeFrame(p.frames[0].id, { background: 'white' }), 160).toDataURL('image/jpeg', 0.7);
        thumbs.set(p.id, thumb);
      }
      changedDuringSave = false;
      const latest = get().project ?? p;
      const record = { ...latest, updatedAt: Date.now(), thumb };
      await saveProjectRecord(record, blobs, removals);
      if (get().project?.id === p.id) set({ saveStatus: changedDuringSave ? 'unsaved' : 'saved' });
      rememberLast();
    } catch (e) {
      restoreDirty(keys);
      set({ saveStatus: 'error' });
      toast(`Couldn't save to this browser: ${(e as Error).message || 'storage error'}. Download a project file from Export to keep a copy.`, 'error');
    }
  };
  saving = run();
  await saving;
  saving = null;
}

// Every project/bitmap change schedules a save.
useStore.subscribe((s, prev) => {
  if (!s.project || s.project.id !== prev.project?.id) return;
  if (s.project !== prev.project || s.bitmapVersion !== prev.bitmapVersion) {
    if (s.saveStatus === 'saving') changedDuringSave = true;
    else if (s.saveStatus !== 'unsaved') set({ saveStatus: 'unsaved' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveNow(), 700);
  }
});

// ───────────────────────────── frames & timeline ─────────────────────────────

export function selectFrame(id: string) {
  const p = get().project;
  if (!p || p.currentId === id) return;
  patchProject({ currentId: id });
  bump();
}

export function stepFrame(delta: number) {
  const p = get().project;
  if (!p) return;
  const i = p.frames.findIndex((f) => f.id === p.currentId);
  const n = p.frames[Math.max(0, Math.min(p.frames.length - 1, i + delta))];
  if (n) selectFrame(n.id);
}

export function addBlankFrame(afterId?: string, kind: Frame['kind'] = 'drawn', extra: Partial<Frame> = {}): string {
  const p = proj();
  const f: Frame = { id: uid(), kind, label: kind === 'inbetween' ? 'In-between' : 'New drawing', hold: kind === 'inbetween' ? 1 : 2, hasSource: false, ...extra };
  ensureLayers(f.id, p.width, p.height);
  markDirty(f.id, 'art');
  markDirty(f.id, 'ink');
  const after = afterId ?? p.currentId;
  commitFrames(kind === 'inbetween' ? 'Add in-between' : 'Add frame', (fr) => {
    const i = fr.findIndex((x) => x.id === after);
    fr.splice(i + 1, 0, f);
    return { frames: fr, currentId: f.id };
  });
  return f.id;
}

export function duplicateFrame(id: string) {
  const p = proj();
  const src = frameById(id);
  const sl = getLayers(id);
  if (!src || !sl) return;
  const f: Frame = { ...src, id: uid(), kind: src.kind === 'original' ? 'drawn' : src.kind, label: `${src.label} (copy)` };
  const l = ensureLayers(f.id, p.width, p.height);
  ctx2d(l.art).drawImage(sl.art, 0, 0);
  ctx2d(l.ink).drawImage(sl.ink, 0, 0);
  l.source = sl.source ? cloneCanvas(sl.source) : null;
  (['art', 'ink', 'source'] as const).forEach((k) => markDirty(f.id, k));
  commitFrames('Duplicate frame', (fr) => {
    fr.splice(fr.findIndex((x) => x.id === id) + 1, 0, f);
    return { frames: fr, currentId: f.id };
  });
}

export function deleteFrame(id: string) {
  const p = proj();
  if (p.frames.length <= 1) {
    toast('A project needs at least one frame.', 'info');
    return;
  }
  const f = frameById(id);
  commitFrames('Delete frame', (fr) => {
    const i = fr.findIndex((x) => x.id === id);
    fr.splice(i, 1);
    return { frames: fr, currentId: p.currentId === id ? fr[Math.max(0, i - 1)].id : p.currentId };
  });
  toast(`Deleted "${f?.label}"`, 'info', { label: 'Undo', run: undo });
}

export function moveFrame(id: string, toIndex: number) {
  commitFrames('Reorder frames', (fr) => {
    const i = fr.findIndex((x) => x.id === id);
    const [f] = fr.splice(i, 1);
    fr.splice(Math.max(0, Math.min(fr.length, toIndex)), 0, f);
    return { frames: fr };
  });
}

export function setHold(id: string, hold: number) {
  const h = Math.max(1, Math.min(48, Math.round(hold)));
  if (frameById(id)?.hold === h) return;
  commitFrames('Change timing', (fr) => ({ frames: fr.map((f) => (f.id === id ? { ...f, hold: h } : f)) }));
}

export function renameFrame(id: string, label: string) {
  commitFrames('Rename frame', (fr) => ({ frames: fr.map((f) => (f.id === id ? { ...f, label: label.slice(0, 60) } : f)) }));
}

export function restoreGenerated(id: string) {
  const l = getLayers(id);
  const f = frameById(id);
  if (!l?.source || !f) return;
  commitLayerSwap(id, { art: cloneCanvas(l.source) }, {}, `Restore "${f.label}"`);
  toast('Restored the original generated version. Your traced lines were kept.', 'success');
}

export function clearLayer(id: string, layer: LayerName) {
  const p = proj();
  commitLayerSwap(id, { [layer]: makeCanvas(p.width, p.height) }, {}, layer === 'ink' ? 'Clear my lines' : 'Clear drawing');
}

export function setProjectFps(fps: number) {
  patchProject({ fps: Math.max(1, Math.min(60, Math.round(fps))) });
}

export function setAssignmentReflection(text: string) {
  const p = proj();
  if (p.assignment) patchProject({ assignment: { ...p.assignment, reflection: text } });
}

// ───────────────────────────── import ─────────────────────────────

export function beginImport(canvas: HTMLCanvasElement, name: string, target: ImportDraft['target']) {
  set({ importDraft: { canvas, name, bg: analyzeBackground(canvas), target } });
}

export function finishImport(canvas: HTMLCanvasElement, opts: { width: number; height: number; name: string }) {
  const d = get().importDraft;
  set({ importDraft: null });
  if (!d) return;
  if (d.target === 'new-project' || !get().project) {
    newProject({ name: opts.name, width: opts.width, height: opts.height, art: canvas, screen: get().screen === 'quick' ? 'quick' : 'studio' });
    return;
  }
  if (d.target === 'replace') {
    const f = currentFrame()!;
    commitLayerSwap(f.id, { art: canvas, source: cloneCanvas(canvas) }, { hasSource: true }, 'Replace drawing');
  } else {
    const id = addBlankFrame(undefined, 'drawn', { label: d.name.replace(/\.[a-z]+$/i, '').slice(0, 40) || 'Imported' });
    commitLayerSwap(id, { art: canvas, source: cloneCanvas(canvas) }, { hasSource: true }, 'Import image');
  }
}

// ───────────────────────────── motion planning ─────────────────────────────

export function setPrompt(text: string) {
  const p = proj();
  patchProject({ prompt: text, plan: text.trim() ? computePlan(text, p.settings) : null });
}

export function setSettings(patch: Partial<GenSettings>) {
  const p = proj();
  const settings = { ...p.settings, ...patch };
  patchProject({ settings, plan: p.prompt.trim() ? computePlan(p.prompt, settings) : null });
}

export function computePlan(text: string, s: GenSettings): MotionPlan {
  const p = get().project;
  // Pieces cut from a drawing can't be turned to a new camera angle, so cut-out rigs keep the drawing's view.
  const view = p?.rigStyle?.kind === 'cutout' && p.rig && s.mode === 'rig' ? p.rig.rest.view : s.view;
  return planMotion(text, { poseCount: s.poseCount, intensity: s.intensity, speed: s.speed, side: s.side, view, facing: p?.rig?.rest.facing ?? 1 });
}

// ───────────────────────────── rig ─────────────────────────────

/** Make sure the project has a rig. For an uploaded drawing, a stick rig is fitted to the drawing's box. */
export function ensureRig(): CharacterRig {
  const p = proj();
  if (p.rig && p.rigStyle) return p.rig;
  const ref = referenceFrame();
  const art = ref ? compositeFrame(ref.id) : null;
  const box = art ? contentBBox(art) : null;
  let rig: CharacterRig;
  let style: RigStyle;
  if (box && box.h > p.height * 0.1) {
    rig = { ...rigForBox(box), rest: neutralPose('front') };
    style = { ...DEFAULT_STICK, color: dominantInkColor(art!), lineWidth: Math.max(3, Math.round(box.h * 0.014)) };
  } else {
    rig = { proportions: rigForBox({ x: 0, y: 0, w: 1, h: 1 }).proportions, height: p.height * 0.6, anchorX: p.width / 2, groundY: p.height * 0.86, rest: neutralPose('side') };
    style = { ...DEFAULT_STICK, lineWidth: Math.round(p.height * 0.013) };
  }
  commitRig({ rig: p.rig, style: p.rigStyle }, { rig, style }, 'Add rig');
  return rig;
}

export function addRigFrame(pose?: RigPose) {
  const rig = ensureRig();
  const p = proj();
  const f: Frame = { id: uid(), kind: 'rig', label: 'Rig pose', hold: 2, hasSource: true, rigPose: clonePose(pose ?? rig.rest) };
  ensureLayers(f.id, p.width, p.height);
  renderRigFrame(f);
  commitFrames('Add rig pose', (fr) => {
    fr.splice(fr.findIndex((x) => x.id === p.currentId) + 1, 0, f);
    return { frames: fr, currentId: f.id };
  });
}

// ───────────────────────────── generation ─────────────────────────────

let jobCounter = 1;

/** New poses go after the selected frame — or after the end of the generated set it belongs to. */
function insertionAnchor(): string {
  const p = proj();
  const i = p.frames.findIndex((f) => f.id === p.currentId);
  const cur = p.frames[i];
  if (!cur?.setId) return p.currentId;
  let j = i;
  while (p.frames[j + 1]?.setId === cur.setId) j++;
  return p.frames[j].id;
}
let jobController: AbortController | null = null;

function framesFromKeys(keys: PlannedKey[], kind: 'rig'): Frame[] {
  const setId = uid();
  return keys.map((k) => ({
    setId,
    id: uid(),
    kind,
    label: `Pose ${k.index + 1} · ${k.label}`,
    role: k.roleLabel,
    hold: k.hold,
    note: k.description,
    rigPose: clonePose(k.pose),
    keyIndex: k.index,
    hasSource: true,
  }));
}

/** Mode B: procedural poses from the rig. Instant, offline, no AI. */
export function generateRigPoses(): string[] {
  const p = proj();
  const plan = p.plan;
  if (!plan) return [];
  if (plan.special === 'coin') {
    set({ dialog: 'coin' });
    return [];
  }
  ensureRig();
  const pr = proj();
  const ref = referenceFrame()!;
  const frames = framesFromKeys(plan.keys, 'rig');
  for (const f of frames) {
    ensureLayers(f.id, pr.width, pr.height);
    renderRigFrame(f);
  }
  const anchor = insertionAnchor() ?? ref.id;
  commitFrames(`Generate ${frames.length} rig poses`, (fr) => {
    const i = fr.findIndex((x) => x.id === anchor);
    fr.splice(i + 1, 0, ...frames);
    return { frames: fr, currentId: frames[0].id };
  });
  set({
    job: { id: jobCounter++, mode: 'rig', title: plan.summary, status: 'done', items: plan.keys.map((k, i) => ({ keyIndex: k.index, label: k.label, status: 'done', frameId: frames[i].id })) },
  });
  if (get().screen === 'quick') set({ quickStep: 3 });
  const style = pr.rigStyle;
  if (style?.kind === 'stick' && ref.kind === 'original' && pr.frames.length > 0 && !p.rig) {
    toast('Rig mode draws a clean stick figure from the skeleton. Line the rig up with your drawing using the Pose Rig tool, or use AI mode to redraw detailed art.', 'info', undefined, 9000);
  }
  return frames.map((f) => f.id);
}

function askConsent(): Promise<boolean> {
  const p = proj();
  if (p.aiConsent) return Promise.resolve(true);
  return new Promise((resolve) => set({ consentResolve: resolve }));
}

export function answerConsent(ok: boolean) {
  const r = get().consentResolve;
  set({ consentResolve: null });
  if (ok) patchProject({ aiConsent: true });
  r?.(ok);
}

function updateJobItem(i: number, patch: Partial<JobItem>) {
  set((s) => (s.job ? { job: { ...s.job, items: s.job.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) } } : {}));
}

export function cancelJob() {
  jobController?.abort();
}

function aiPreflight(): boolean {
  const ai = get().ai;
  if (!ai?.configured) {
    toast(ai?.reason || 'AI generation is not set up on this server.', 'error', { label: 'Use Rig mode', run: () => setSettings({ mode: 'rig' }) });
    return false;
  }
  if (get().job?.status === 'running') {
    toast('A generation is already running.', 'info');
    return false;
  }
  return true;
}

interface RefPack { refFull: HTMLCanvasElement; region: Rect; refImg: HTMLCanvasElement; rig: CharacterRig }
function referencePack(): RefPack {
  const p = proj();
  const ref = referenceFrame()!;
  const refFull = compositeFrame(ref.id);
  const region = referenceRegion(refFull);
  const transparent = !!get().ai?.transparency;
  const refImg = cropTo(refFull, region, AI_SIZE, transparent ? null : '#ffffff');
  const box = contentBBox(refFull) ?? { x: p.width * 0.3, y: p.height * 0.15, w: p.width * 0.4, h: p.height * 0.7 };
  return { refFull, region, refImg, rig: p.rig ?? rigForBox(box) };
}

async function runOnePose(pack: RefPack, key: PlannedKey, signal: AbortSignal, opts: { correction?: string; previous?: HTMLCanvasElement | null } = {}) {
  const p = proj();
  const ai = get().ai!;
  const transparent = !!ai.transparency;
  const guide = renderGuideImage(pack.rig, key.pose, p.width, p.height, pack.region);
  const images = [
    { name: 'original_character', dataUrl: pack.refImg.toDataURL('image/png') },
    { name: 'pose_guide', dataUrl: guide.toDataURL('image/png') },
  ];
  if (opts.previous) images.push({ name: 'previous_attempt', dataUrl: cropTo(opts.previous, pack.region, AI_SIZE, transparent ? null : '#ffffff').toDataURL('image/png') });
  const prompt = buildPosePrompt({ plan: p.plan!, key, consistency: p.settings.consistency, correction: opts.correction, hasGuide: true, hasPreviousAttempt: !!opts.previous, transparent });
  const res = await requestPose({ prompt, images, quality: p.settings.quality, transparent }, signal);
  let img = await dataUrlToCanvas(res.image);
  let bgRemoved = false;
  const bg = analyzeBackground(img);
  if (!bg.hasTransparency && bg.plainBackground) {
    img = removePlainBackground(img, bg.plainBackground, 36);
    bgRemoved = true;
  }
  const placed = placeResult(img, pack.region, p.width, p.height);
  const consistency = compareToOriginal(cropTo(pack.refFull, pack.region, 256), cropTo(placed, pack.region, 256));
  return { placed, prompt, consistency, bgRemoved };
}

/** Mode A: AI redraws the student's character in each planned pose. */
export async function generateAiPoses() {
  if (!aiPreflight()) return;
  const p0 = proj();
  const plan = p0.plan;
  if (!plan) return;
  if (!(await askConsent())) return;
  const pack = referencePack();
  jobController = new AbortController();
  const signal = jobController.signal;
  set({ job: { id: jobCounter++, mode: 'ai', title: plan.summary, status: 'running', items: plan.keys.map((k) => ({ keyIndex: k.index, label: k.label, status: 'queued' })) } });
  let insertAfter = insertionAnchor();
  const setId = uid();
  let stopped: string | null = null;
  for (let i = 0; i < plan.keys.length; i++) {
    const key = plan.keys[i];
    if (stopped || signal.aborted) {
      updateJobItem(i, { status: 'cancelled' });
      continue;
    }
    updateJobItem(i, { status: 'running' });
    try {
      const out = await runOnePose(pack, key, signal);
      const p = proj();
      const f: Frame = {
        id: uid(), setId, kind: 'ai', label: `Pose ${key.index + 1} · ${key.label}`, role: key.roleLabel, hold: key.hold,
        note: key.description, rigPose: clonePose(key.pose), aiPrompt: out.prompt, keyIndex: key.index, hasSource: true,
        consistency: out.consistency, bgRemoved: out.bgRemoved,
      };
      const l = ensureLayers(f.id, p.width, p.height);
      ctx2d(l.art).drawImage(out.placed, 0, 0);
      l.source = cloneCanvas(out.placed);
      (['art', 'ink', 'source'] as const).forEach((k) => markDirty(f.id, k));
      const after = insertAfter;
      commitFrames(`AI pose ${key.index + 1}`, (fr) => {
        const at = fr.findIndex((x) => x.id === after);
        fr.splice(at < 0 ? fr.length : at + 1, 0, f);
        return { frames: fr, currentId: f.id };
      });
      insertAfter = f.id;
      updateJobItem(i, { status: 'done', frameId: f.id });
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('client_error', (e as Error).message || 'Something went wrong.');
      updateJobItem(i, { status: err.code === 'cancelled' ? 'cancelled' : 'error', error: err.message });
      if (err.fatal) stopped = err.message;
    }
  }
  const items = get().job?.items ?? [];
  const done = items.filter((it) => it.status === 'done').length;
  const status: Job['status'] = signal.aborted ? 'cancelled' : done === items.length ? 'done' : done === 0 ? 'error' : 'done';
  set((s) => ({ job: s.job ? { ...s.job, status, message: stopped ?? undefined } : null }));
  jobController = null;
  if (done > 0 && get().screen === 'quick' && get().quickStep === 2) set({ quickStep: 3 });
  if (status === 'done' && done === items.length) toast(`${done} AI poses added to the timeline. They're suggestions — trace and fix them!`, 'success');
  else if (status === 'cancelled') toast(`Cancelled. ${done} pose${done === 1 ? '' : 's'} kept.`, 'info');
  else toast(stopped ?? `${done} of ${items.length} poses were generated. Retry the failed ones from the Motion panel.`, done ? 'info' : 'error', { label: 'Use Rig mode', run: () => setSettings({ mode: 'rig' }) });
}

/** Retry one planned key that failed (AI mode). */
export async function retryAiKey(itemIndex: number) {
  if (!aiPreflight()) return;
  const job = get().job;
  const plan = proj().plan;
  if (!job || !plan) return;
  const key = plan.keys[job.items[itemIndex].keyIndex];
  if (!key) return;
  jobController = new AbortController();
  set({ job: { ...job, status: 'running' } });
  updateJobItem(itemIndex, { status: 'running', error: undefined });
  try {
    const out = await runOnePose(referencePack(), key, jobController.signal);
    const p = proj();
    const f: Frame = { id: uid(), kind: 'ai', label: `Pose ${key.index + 1} · ${key.label}`, role: key.roleLabel, hold: key.hold, note: key.description, rigPose: clonePose(key.pose), aiPrompt: out.prompt, keyIndex: key.index, hasSource: true, consistency: out.consistency, bgRemoved: out.bgRemoved };
    const l = ensureLayers(f.id, p.width, p.height);
    ctx2d(l.art).drawImage(out.placed, 0, 0);
    l.source = cloneCanvas(out.placed);
    (['art', 'ink', 'source'] as const).forEach((k) => markDirty(f.id, k));
    // place it after the frame of the previous key if it exists
    const prevDone = job.items.slice(0, itemIndex).reverse().find((it) => it.frameId && frameById(it.frameId));
    const after = prevDone?.frameId ?? referenceFrame()!.id;
    commitFrames(`AI pose ${key.index + 1}`, (fr) => {
      fr.splice(fr.findIndex((x) => x.id === after) + 1, 0, f);
      return { frames: fr, currentId: f.id };
    });
    updateJobItem(itemIndex, { status: 'done', frameId: f.id });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError('client_error', (e as Error).message);
    updateJobItem(itemIndex, { status: err.code === 'cancelled' ? 'cancelled' : 'error', error: err.message });
  } finally {
    jobController = null;
    set((s) => ({ job: s.job ? { ...s.job, status: 'done' } : null }));
  }
}

/**
 * Regenerate ONE pose, optionally with a correction ("raise the arm higher"). Everything else in the sequence
 * is untouched; the previous version stays in undo history and traced lines (ink layer) are kept.
 */
export async function regenerateFrame(frameId: string, correction: string) {
  const f = frameById(frameId);
  const p = proj();
  if (!f) return;
  if (f.rigPose && (f.kind === 'rig' || (f.kind === 'inbetween' && f.ibMethod === 'rig'))) {
    if (!correction.trim()) {
      const planned = p.plan?.keys[f.keyIndex ?? -1];
      if (planned) commitFramePose(f.id, f.rigPose, planned.pose, 'Reset pose');
      else toast('Type a correction, e.g. "raise the arm higher" or "bend the knees more".', 'info');
      return;
    }
    const sideDefault = p.plan?.side === 'left' ? 'L' : 'R';
    const res = applyCorrection(f.rigPose, correction, sideDefault);
    if (!res.applied.length) {
      toast('PosePilot didn\'t understand that correction for the rig. Try "raise the arm higher", "bend the knees more", "lean forward" — or drag the joints with the Pose Rig tool.', 'info', { label: 'Open Pose Rig', run: () => set({ tool: 'rig', rigMode: 'pose' }) }, 9000);
      return;
    }
    commitFramePose(f.id, f.rigPose, res.pose, `Fix pose: ${correction}`);
    toast(`Rig: ${res.applied.join(', ')}.`, 'success');
    return;
  }
  if (f.kind !== 'ai') {
    toast('Only AI or rig poses can be regenerated. This frame is your own drawing.', 'info');
    return;
  }
  if (!aiPreflight()) return;
  if (!(await askConsent())) return;
  const plan = p.plan;
  const key: PlannedKey | undefined = plan?.keys[f.keyIndex ?? -1] ?? (f.rigPose && plan ? { ...plan.keys[0], description: f.note ?? plan.keys[0].description, pose: f.rigPose } : undefined);
  if (!key || !plan) {
    toast('The motion plan for this pose is missing. Describe the motion again in the Motion panel.', 'error');
    return;
  }
  jobController = new AbortController();
  set({ job: { id: jobCounter++, mode: 'ai', title: `Regenerating ${f.label}`, status: 'running', items: [{ keyIndex: key.index, label: f.label, status: 'running' }] } });
  try {
    const prevArt = getLayers(f.id)?.art ?? null;
    const out = await runOnePose(referencePack(), { ...key, pose: f.rigPose ?? key.pose }, jobController.signal, { correction: correction.trim() || undefined, previous: correction.trim() ? prevArt : null });
    commitLayerSwap(f.id, { art: out.placed, source: cloneCanvas(out.placed) }, { consistency: out.consistency, aiPrompt: out.prompt, correction: correction.trim() || undefined, bgRemoved: out.bgRemoved }, `Regenerate ${f.label}`);
    updateJobItem(0, { status: 'done', frameId: f.id });
    set((s) => ({ job: s.job ? { ...s.job, status: 'done' } : null }));
    toast('New version ready. Press Undo to get the previous one back.', 'success', { label: 'Undo', run: undo });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError('client_error', (e as Error).message);
    updateJobItem(0, { status: err.code === 'cancelled' ? 'cancelled' : 'error', error: err.message });
    set((s) => ({ job: s.job ? { ...s.job, status: err.code === 'cancelled' ? 'cancelled' : 'error', message: err.message } : null }));
    if (err.code !== 'cancelled') toast(`${err.message} The existing pose was not changed.`, 'error');
  } finally {
    jobController = null;
  }
}

// ───────────────────────────── in-betweens ─────────────────────────────

function poseOf(f: Frame): RigPose | null {
  const p = proj();
  if (f.rigPose && (f.kind === 'rig' || (f.kind === 'inbetween' && f.ibMethod === 'rig'))) return f.rigPose;
  // demo characters (their original is drawn by the rig) and cut-out rigs (built from the original drawing)
  if (f.kind === 'original' && p.rig && p.rigStyle && (f.rigPose || p.rigStyle.kind === 'cutout')) return f.rigPose ?? p.rig.rest;
  return null;
}

export function canRigInbetween(aId: string): boolean {
  const p = get().project;
  if (!p) return false;
  const i = p.frames.findIndex((f) => f.id === aId);
  const a = p.frames[i], b = p.frames[i + 1];
  return !!(a && b && poseOf(a) && poseOf(b));
}

export function addRigInbetweens(aId: string, count: number) {
  const p = proj();
  const i = p.frames.findIndex((f) => f.id === aId);
  const a = p.frames[i], b = p.frames[i + 1];
  const pa = a && poseOf(a), pb = b && poseOf(b);
  if (!pa || !pb) return;
  const frames: Frame[] = inbetweenPoses(pa, pb, count).map((pose, k) => ({
    id: uid(), kind: 'inbetween', ibMethod: 'rig', label: `In-between ${k + 1}/${count}`, hold: 1, hasSource: true, rigPose: pose,
    note: `Interpolated by the rig between "${a.label}" and "${b.label}" (eased in/out).`,
  }));
  for (const f of frames) {
    ensureLayers(f.id, p.width, p.height);
    renderRigFrame(f);
  }
  commitFrames(`Add ${count} in-betweens`, (fr) => {
    fr.splice(fr.findIndex((x) => x.id === aId) + 1, 0, ...frames);
    return { frames: fr };
  });
  toast(`Added ${count} rig in-between${count > 1 ? 's' : ''} (real interpolated poses).`, 'success');
}

export function addBlankInbetween(aId: string) {
  addBlankFrame(aId, 'inbetween', { ibMethod: 'blank', label: 'In-between (draw me)', note: 'Blank in-between: draw it yourself using the onion skin of the poses before and after.' });
  set((s) => ({ tool: 'draw', activeLayer: 'ink', onion: { ...s.onion, enabled: true, prev: true, next: true } }));
  toast('Draw the in-between halfway between the ghosted poses before and after.', 'info');
}

export async function addAiInbetween(aId: string) {
  if (!aiPreflight()) return;
  if (!(await askConsent())) return;
  const p = proj();
  const i = p.frames.findIndex((f) => f.id === aId);
  const a = p.frames[i], b = p.frames[i + 1];
  if (!a || !b) return;
  const transparent = !!get().ai?.transparency;
  const ca = compositeFrame(a.id), cb = compositeFrame(b.id);
  const bb = contentBBox(cb);
  const region = referenceRegion(ca, bb ? [bb] : []);
  jobController = new AbortController();
  set({ job: { id: jobCounter++, mode: 'ai', title: 'AI in-between', status: 'running', items: [{ keyIndex: 0, label: `Between "${a.label}" and "${b.label}"`, status: 'running' }] } });
  try {
    const res = await requestPose({
      prompt: buildInbetweenPrompt(p.settings.consistency, transparent),
      images: [
        { name: 'key_a', dataUrl: cropTo(ca, region, AI_SIZE, transparent ? null : '#ffffff').toDataURL('image/png') },
        { name: 'key_b', dataUrl: cropTo(cb, region, AI_SIZE, transparent ? null : '#ffffff').toDataURL('image/png') },
      ],
      quality: p.settings.quality,
      transparent,
    }, jobController.signal);
    let img = await dataUrlToCanvas(res.image);
    const bg = analyzeBackground(img);
    if (!bg.hasTransparency && bg.plainBackground) img = removePlainBackground(img, bg.plainBackground, 36);
    const placed = placeResult(img, region, p.width, p.height);
    const f: Frame = { id: uid(), kind: 'inbetween', ibMethod: 'ai', label: 'In-between (AI)', hold: 1, hasSource: true, note: `AI-drawn in-between of "${a.label}" and "${b.label}".` };
    const l = ensureLayers(f.id, p.width, p.height);
    ctx2d(l.art).drawImage(placed, 0, 0);
    l.source = cloneCanvas(placed);
    (['art', 'ink', 'source'] as const).forEach((k) => markDirty(f.id, k));
    commitFrames('Add AI in-between', (fr) => {
      fr.splice(fr.findIndex((x) => x.id === aId) + 1, 0, f);
      return { frames: fr, currentId: f.id };
    });
    updateJobItem(0, { status: 'done', frameId: f.id });
    set((s) => ({ job: s.job ? { ...s.job, status: 'done' } : null }));
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError('client_error', (e as Error).message);
    updateJobItem(0, { status: err.code === 'cancelled' ? 'cancelled' : 'error', error: err.message });
    set((s) => ({ job: s.job ? { ...s.job, status: 'error', message: err.message } : null }));
    if (err.code !== 'cancelled') toast(err.message, 'error');
  } finally {
    jobController = null;
  }
}

// ───────────────────────────── coin flip ─────────────────────────────

export function insertProceduralFrames(canvases: HTMLCanvasElement[], kind: Frame['kind'], labelPrefix: string, note: string) {
  const p = proj();
  const frames: Frame[] = canvases.map((_c, i) => ({ id: uid(), kind, label: `${labelPrefix} ${i + 1}`, hold: 1, hasSource: true, note }));
  frames.forEach((f, i) => {
    const l = ensureLayers(f.id, p.width, p.height);
    ctx2d(l.art).drawImage(canvases[i], 0, 0);
    l.source = cloneCanvas(canvases[i]);
    (['art', 'ink', 'source'] as const).forEach((k) => markDirty(f.id, k));
  });
  commitFrames(`Add ${frames.length} ${labelPrefix.toLowerCase()} frames`, (fr) => {
    fr.splice(fr.findIndex((x) => x.id === p.currentId) + 1, 0, ...frames);
    return { frames: fr, currentId: frames[0].id };
  });
}

export const actions = { set, get };

import { Maximize, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cloneCanvas, contentBBox, ctx2d, makeCanvas, type Rect } from '../lib/raster/image';
import { aimBone, BONE_BY_END, BONES, fitBone, reachIK, solve, type BoneId, type CharacterRig, type JointId, type Pt, type RigPose } from '../lib/rig/skeleton';
import type { CutoutStyle, RigStyle } from '../lib/rig/render';
import { expandHolds } from '../lib/export/sequence';
import { getLayers } from '../state/layers';
import { commitFramePose, commitPixels, commitRig, previewFramePose, previewRig, toast, useStore, actions, uid } from '../state/store';
import type { Frame } from '../state/types';

type Transform = { dx: number; dy: number; sx: number; sy: number; rot: number };
interface Selection {
  rect: Rect;
  frameId: string;
  layer: 'art' | 'ink';
  floating: HTMLCanvasElement | null;
  before: ImageData | null;
  t: Transform;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
  | { kind: 'stroke'; frameId: string; layer: 'art' | 'ink'; snapshot: HTMLCanvasElement; pts: Pt[]; lastMid: Pt; minX: number; minY: number; maxX: number; maxY: number; erase: boolean; size: number }
  | { kind: 'marquee'; start: Pt; cur: Pt }
  | { kind: 'sel-move'; start: Pt; t0: Transform }
  | { kind: 'sel-scale'; t0: Transform; uniform: boolean }
  | { kind: 'sel-rotate'; t0: Transform; a0: number }
  | { kind: 'joint'; joint: JointId; frameId: string | null; fit: boolean; poseBefore: RigPose; rigBefore: CharacterRig; start: Pt }
  | { kind: 'lasso'; pts: Pt[] };

const ONION_PREV = '#ff5d5d';
const ONION_NEXT = '#3fd08a';
const ONION_ORIG = '#4d8dff';

export const isRigDriven = (f?: Frame) => !!f && !!f.rigPose && (f.kind === 'rig' || (f.kind === 'inbetween' && f.ibMethod === 'rig'));

export function CanvasView({ compact = false }: { compact?: boolean }) {
  const project = useStore((s) => s.project);
  const bitmapVersion = useStore((s) => s.bitmapVersion);
  const tool = useStore((s) => s.tool);
  const brushColor = useStore((s) => s.brushColor);
  const brushSize = useStore((s) => s.brushSize);
  const eraserSize = useStore((s) => s.eraserSize);
  const activeLayer = useStore((s) => s.activeLayer);
  const artOpacity = useStore((s) => s.artOpacity);
  const onion = useStore((s) => s.onion);
  const rigMode = useStore((s) => s.rigMode);
  const cutBone = useStore((s) => s.cutBone) as BoneId;
  const playing = useStore((s) => s.playing);
  const playhead = useStore((s) => s.playhead);
  const fitToken = useStore((s) => s.fitToken);
  const ikOn = true;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ zoom: 1, panX: 0, panY: 0 });
  const [viewTick, setViewTick] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<Drag | null>(null);
  const [sel, setSelState] = useState<Selection | null>(null);
  const selRef = useRef<Selection | null>(null);
  const setSel = (s: Selection | null) => { selRef.current = s; setSelState(s); };
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [lasso, setLasso] = useState<Pt[] | null>(null);
  const spaceDown = useRef(false);
  const raf = useRef(0);
  const tintCache = useRef(new Map<string, HTMLCanvasElement>());

  const W = project?.width ?? 1;
  const H = project?.height ?? 1;
  const frames = project?.frames ?? [];
  const expanded = useMemo(() => expandHolds(frames, true), [frames]);
  const shownId = playing ? expanded[Math.min(playhead, expanded.length - 1)]?.id : project?.currentId;
  const curIndex = frames.findIndex((f) => f.id === shownId);
  const frame = frames[curIndex];

  // ── view (zoom / pan) ───────────────────────────────────────────────
  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !project) return;
    const r = el.getBoundingClientRect();
    const z = Math.min((r.width - 32) / W, (r.height - 32) / H);
    view.current = { zoom: Math.max(0.05, z), panX: (r.width - W * z) / 2, panY: (r.height - H * z) / 2 };
    setViewTick((t) => t + 1);
  }, [W, H, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (size.w) fit(); }, [fitToken, size.w > 0, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevSize = useRef(size);
  useEffect(() => {
    // keep the drawing centred when panels open/close
    const p = prevSize.current;
    if (p.w && size.w) {
      view.current.panX += (size.w - p.w) / 2;
      view.current.panY += (size.h - p.h) / 2;
      setViewTick((t) => t + 1);
    }
    prevSize.current = size;
  }, [size]);

  const zoomAt = (factor: number, sx?: number, sy?: number) => {
    const v = view.current;
    const cx = sx ?? size.w / 2, cy = sy ?? size.h / 2;
    const z = Math.max(0.05, Math.min(16, v.zoom * factor));
    v.panX = cx - ((cx - v.panX) * z) / v.zoom;
    v.panY = cy - ((cy - v.panY) * z) / v.zoom;
    v.zoom = z;
    setViewTick((t) => t + 1);
  };

  const toDoc = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    const v = view.current;
    return { x: (e.clientX - r.left - v.panX) / v.zoom, y: (e.clientY - r.top - v.panY) / v.zoom };
  };

  // ── painting the view ───────────────────────────────────────────────
  const tinted = (f: Frame, color: string) => {
    const key = `${f.id}:${color}:${bitmapVersion}`;
    const c = tintCache.current.get(key);
    if (c) return c;
    const l = getLayers(f.id);
    if (!l) return null;
    const t = makeCanvas(W / 2, H / 2);
    const g = ctx2d(t);
    g.drawImage(l.art, 0, 0, t.width, t.height);
    g.drawImage(l.ink, 0, 0, t.width, t.height);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.85;
    g.fillStyle = color;
    g.fillRect(0, 0, t.width, t.height);
    if (tintCache.current.size > 12) tintCache.current.clear();
    tintCache.current.set(key, t);
    return t;
  };

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c || !project) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) {
      c.width = Math.round(size.w * dpr);
      c.height = Math.round(size.h * dpr);
    }
    const g = c.getContext('2d')!;
    const v = view.current;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    // paper
    const px = v.panX * dpr, py = v.panY * dpr, pw = W * v.zoom * dpr, ph = H * v.zoom * dpr;
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 24 * dpr;
    g.fillStyle = '#fff';
    g.fillRect(px, py, pw, ph);
    g.shadowColor = 'transparent';
    if (project.background === 'transparent') {
      const s = 10 * dpr;
      g.save();
      g.beginPath();
      g.rect(px, py, pw, ph);
      g.clip();
      g.fillStyle = '#e6e6e3';
      for (let y = Math.floor(py / s) * s; y < py + ph; y += s)
        for (let x = Math.floor(px / s) * s; x < px + pw; x += s) if (((x / s + y / s) & 1) === 0) g.fillRect(x, y, s, s);
      g.restore();
    }
    g.setTransform(v.zoom * dpr, 0, 0, v.zoom * dpr, px, py);
    g.imageSmoothingEnabled = v.zoom < 3;
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    if (!playing && onion.enabled && frame) {
      g.globalAlpha = onion.opacity;
      const prev = frames[curIndex - 1];
      const next = frames[curIndex + 1];
      const orig = frames.find((f) => f.kind === 'original');
      if (onion.original && orig && orig.id !== frame.id) { const t = tinted(orig, ONION_ORIG); if (t) g.drawImage(t, 0, 0, W, H); }
      if (onion.prev && prev) { const t = tinted(prev, ONION_PREV); if (t) g.drawImage(t, 0, 0, W, H); }
      if (onion.next && next) { const t = tinted(next, ONION_NEXT); if (t) g.drawImage(t, 0, 0, W, H); }
      g.globalAlpha = 1;
    }
    const l = frame && getLayers(frame.id);
    if (l) {
      g.globalAlpha = playing ? 1 : artOpacity;
      g.drawImage(l.art, 0, 0);
      g.globalAlpha = 1;
      g.drawImage(l.ink, 0, 0);
    }
    const s = selRef.current;
    if (s?.floating && s.frameId === frame?.id) {
      const cx = s.rect.x + s.rect.w / 2 + s.t.dx, cy = s.rect.y + s.rect.h / 2 + s.t.dy;
      g.save();
      g.translate(cx, cy);
      g.rotate(s.t.rot);
      g.scale(s.t.sx, s.t.sy);
      g.drawImage(s.floating, -s.rect.w / 2, -s.rect.h / 2);
      g.restore();
    }
    g.restore();
    // paper edge
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    g.strokeRect(px - 0.5, py - 0.5, pw + 1, ph + 1);
  }, [project, size, frame, frames, curIndex, onion, artOpacity, playing, bitmapVersion, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  const requestDraw = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
  }, [draw]);
  useEffect(() => { requestDraw(); }, [requestDraw, viewTick, sel]);

  // drop the selection when frame / tool / layer changes
  useEffect(() => {
    if (selRef.current && (selRef.current.frameId !== project?.currentId || (tool !== 'select' && tool !== 'move'))) commitSelection();
  }, [project?.currentId, tool]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── selection / transform ───────────────────────────────────────────
  function liftSelection(s: Selection): Selection {
    if (s.floating) return s;
    const l = getLayers(s.frameId);
    if (!l) return s;
    const layer = l[s.layer];
    const g = layer.getContext('2d', { willReadFrequently: true })!;
    const before = g.getImageData(0, 0, W, H);
    const fl = makeCanvas(s.rect.w, s.rect.h);
    ctx2d(fl).drawImage(layer, s.rect.x, s.rect.y, s.rect.w, s.rect.h, 0, 0, s.rect.w, s.rect.h);
    g.clearRect(s.rect.x, s.rect.y, s.rect.w, s.rect.h);
    return { ...s, floating: fl, before };
  }

  function commitSelection() {
    const s = selRef.current;
    setSel(null);
    if (!s?.floating || !s.before) return;
    const l = getLayers(s.frameId);
    if (!l) return;
    const t = s.t;
    if (t.dx === 0 && t.dy === 0 && t.sx === 1 && t.sy === 1 && t.rot === 0) {
      ctx2d(l[s.layer]).putImageData(s.before, 0, 0);
      requestDraw();
      return;
    }
    const g = l[s.layer].getContext('2d', { willReadFrequently: true })!;
    g.save();
    g.translate(s.rect.x + s.rect.w / 2 + t.dx, s.rect.y + s.rect.h / 2 + t.dy);
    g.rotate(t.rot);
    g.scale(t.sx, t.sy);
    g.imageSmoothingQuality = 'high';
    g.drawImage(s.floating, -s.rect.w / 2, -s.rect.h / 2);
    g.restore();
    commitPixels(s.frameId, s.layer, { x: 0, y: 0, w: W, h: H }, s.before, g.getImageData(0, 0, W, H), 'Transform');
  }

  function cancelSelection() {
    const s = selRef.current;
    setSel(null);
    if (s?.floating && s.before) {
      const l = getLayers(s.frameId);
      if (l) ctx2d(l[s.layer]).putImageData(s.before, 0, 0);
    }
    requestDraw();
  }

  function deleteSelection() {
    const s = selRef.current;
    if (!s) return;
    const l = getLayers(s.frameId);
    if (!l) return;
    const lifted = liftSelection(s);
    setSel(null);
    const g = l[s.layer].getContext('2d', { willReadFrequently: true })!;
    commitPixels(s.frameId, s.layer, { x: 0, y: 0, w: W, h: H }, lifted.before!, g.getImageData(0, 0, W, H), 'Delete selection');
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ' ) spaceDown.current = e.type === 'keydown';
      if (e.type !== 'keydown' || !selRef.current) return;
      if (e.key === 'Enter') { e.preventDefault(); commitSelection(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelSelection(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const selCorners = (s: Selection): Pt[] => {
    const cx = s.rect.x + s.rect.w / 2 + s.t.dx, cy = s.rect.y + s.rect.h / 2 + s.t.dy;
    const c = Math.cos(s.t.rot), sn = Math.sin(s.t.rot);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([ux, uy]) => {
      const x = (ux * s.rect.w) / 2 * s.t.sx, y = (uy * s.rect.h) / 2 * s.t.sy;
      return { x: cx + x * c - y * sn, y: cy + x * sn + y * c };
    });
  };

  // ── rig context ────────────────────────────────────────────────────
  const rig = project?.rig ?? null;
  const rigStyle = project?.rigStyle ?? null;
  const rigDriven = isRigDriven(frame);
  const fitMode = tool === 'rig' && (rigMode === 'fit' || rigMode === 'cut' || !rigDriven);
  const rigPose: RigPose | null = tool === 'rig' && rig ? (fitMode ? rig.rest : frame?.rigPose ?? null) : null;
  const solved = useMemo(() => (rig && rigPose ? solve(rig, rigPose) : null), [rig, rigPose]);

  // ── pointer handling ───────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (!project || !frame) return;
    if (e.button === 2) return;
    const p = toDoc(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (e.button === 1 || tool === 'hand' || spaceDown.current) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: view.current.panX, py: view.current.panY };
      return;
    }
    if (playing) {
      toast('Pause playback to edit.', 'info', undefined, 1800);
      return;
    }
    const target = (e.target as Element).closest('[data-handle]') as HTMLElement | null;
    const handle = target?.dataset.handle;

    if (tool === 'rig') {
      if (!rig) { toast('Add a rig first (Pose Rig panel on the right).', 'info'); return; }
      if (handle?.startsWith('joint:')) {
        const joint = handle.slice(6) as JointId;
        drag.current = { kind: 'joint', joint, frameId: fitMode ? null : frame.id, fit: fitMode, poseBefore: rigPose!, rigBefore: rig, start: p };
        return;
      }
      if (rigMode === 'cut') {
        drag.current = { kind: 'lasso', pts: [p] };
        setLasso([p]);
      }
      return;
    }

    if (tool === 'draw' || tool === 'eraser') {
      let layer = activeLayer;
      if (layer === 'art' && rigDriven) {
        layer = 'ink';
        actions.set({ activeLayer: 'ink' });
        toast('This pose is drawn by the rig, so your lines go on the "My lines" layer.', 'info');
      }
      const l = getLayers(frame.id);
      if (!l) return;
      const erase = tool === 'eraser';
      const pressure = e.pointerType === 'pen' ? 0.35 + e.pressure * 0.9 : 1;
      const sz = (erase ? eraserSize : brushSize) * pressure;
      const snapshot = cloneCanvas(l[layer]);
      const g = ctx2d(l[layer]);
      g.save();
      g.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
      g.fillStyle = brushColor;
      g.beginPath();
      g.arc(p.x, p.y, sz / 2, 0, Math.PI * 2);
      g.fill();
      g.restore();
      drag.current = { kind: 'stroke', frameId: frame.id, layer, snapshot, pts: [p], lastMid: p, minX: p.x, minY: p.y, maxX: p.x, maxY: p.y, erase, size: Math.max(brushSize, eraserSize) * 1.4 };
      requestDraw();
      return;
    }

    if (tool === 'select' || tool === 'move') {
      const s = selRef.current;
      if (s && handle === 'rotate') {
        const c = { x: s.rect.x + s.rect.w / 2 + s.t.dx, y: s.rect.y + s.rect.h / 2 + s.t.dy };
        setSel(liftSelection(s));
        drag.current = { kind: 'sel-rotate', t0: { ...s.t }, a0: Math.atan2(p.y - c.y, p.x - c.x) };
        return;
      }
      if (s && handle?.startsWith('corner')) {
        setSel(liftSelection(s));
        drag.current = { kind: 'sel-scale', t0: { ...s.t }, uniform: !e.shiftKey };
        return;
      }
      if (s && (handle === 'body' || tool === 'move')) {
        setSel(liftSelection(s));
        drag.current = { kind: 'sel-move', start: p, t0: { ...s.t } };
        return;
      }
      if (s) commitSelection();
      if (tool === 'move') {
        // Move with nothing selected: grab everything on the active layer
        const l = getLayers(frame.id);
        let layer = activeLayer;
        if (layer === 'art' && rigDriven) layer = 'ink';
        const box = l && contentBBox(l[layer]);
        if (!box) { toast(`Nothing to move on the "${layer === 'ink' ? 'My lines' : 'Drawing'}" layer.`, 'info', undefined, 2200); return; }
        const ns = liftSelection({ rect: pad(box, 2, W, H), frameId: frame.id, layer, floating: null, before: null, t: { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 } });
        setSel(ns);
        drag.current = { kind: 'sel-move', start: p, t0: { ...ns.t } };
        return;
      }
      drag.current = { kind: 'marquee', start: p, cur: p };
      setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toDoc(e);
    if (tool === 'draw' || tool === 'eraser') setCursor(p);
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      view.current.panX = d.px + (e.clientX - d.sx);
      view.current.panY = d.py + (e.clientY - d.sy);
      setViewTick((t) => t + 1);
      return;
    }
    if (d.kind === 'stroke') {
      const l = getLayers(d.frameId);
      if (!l) return;
      const g = ctx2d(l[d.layer]);
      g.save();
      g.globalCompositeOperation = d.erase ? 'destination-out' : 'source-over';
      g.strokeStyle = brushColor;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const events = (e.nativeEvent.getCoalescedEvents?.() ?? []).length ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
      for (const ev of events) {
        const q = toDoc(ev);
        const last = d.pts[d.pts.length - 1];
        if (Math.hypot(q.x - last.x, q.y - last.y) < 0.6) continue;
        const pressure = ev.pointerType === 'pen' ? 0.35 + ev.pressure * 0.9 : 1;
        g.lineWidth = (d.erase ? eraserSize : brushSize) * pressure;
        const mid = { x: (last.x + q.x) / 2, y: (last.y + q.y) / 2 };
        g.beginPath();
        g.moveTo(d.lastMid.x, d.lastMid.y);
        g.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
        g.stroke();
        d.lastMid = mid;
        d.pts.push(q);
        d.minX = Math.min(d.minX, q.x); d.minY = Math.min(d.minY, q.y);
        d.maxX = Math.max(d.maxX, q.x); d.maxY = Math.max(d.maxY, q.y);
      }
      g.restore();
      requestDraw();
      return;
    }
    if (d.kind === 'marquee') {
      d.cur = p;
      setMarquee(normRect(d.start, p));
      return;
    }
    const s = selRef.current;
    if (s && d.kind === 'sel-move') {
      setSel({ ...s, t: { ...d.t0, dx: d.t0.dx + p.x - d.start.x, dy: d.t0.dy + p.y - d.start.y } });
      return;
    }
    if (s && d.kind === 'sel-scale') {
      const cx = s.rect.x + s.rect.w / 2 + s.t.dx, cy = s.rect.y + s.rect.h / 2 + s.t.dy;
      const c = Math.cos(-s.t.rot), sn = Math.sin(-s.t.rot);
      const lx = (p.x - cx) * c - (p.y - cy) * sn, ly = (p.x - cx) * sn + (p.y - cy) * c;
      let sx = Math.max(0.05, Math.abs(lx) / (s.rect.w / 2)), sy = Math.max(0.05, Math.abs(ly) / (s.rect.h / 2));
      if (!e.shiftKey) { const u = Math.max(sx, sy); sx = u; sy = u; }
      setSel({ ...s, t: { ...s.t, sx, sy } });
      return;
    }
    if (s && d.kind === 'sel-rotate') {
      const cx = s.rect.x + s.rect.w / 2 + s.t.dx, cy = s.rect.y + s.rect.h / 2 + s.t.dy;
      let rot = d.t0.rot + Math.atan2(p.y - cy, p.x - cx) - d.a0;
      if (e.shiftKey) rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12);
      setSel({ ...s, t: { ...s.t, rot } });
      return;
    }
    if (d.kind === 'joint' && rig) {
      const pr = actions.get().project!;
      if (d.fit) {
        const r = pr.rig!;
        if (d.joint === 'pelvis') {
          previewRig({ ...d.rigBefore, anchorX: d.rigBefore.anchorX + p.x - d.start.x, groundY: d.rigBefore.groundY + p.y - d.start.y });
        } else {
          const bone = BONE_BY_END[d.joint]?.id;
          if (!bone) return;
          const before = solve(r, r.rest).joints.pelvis;
          const res = fitBone(r, r.rest, bone, p);
          const nextRig = { ...res.rig, rest: res.pose };
          const after = solve(nextRig, res.pose).joints.pelvis;
          nextRig.anchorX += before.x - after.x;
          nextRig.groundY += before.y - after.y;
          previewRig(nextRig);
        }
      } else if (d.frameId) {
        const f = pr.frames.find((x) => x.id === d.frameId);
        if (!f?.rigPose) return;
        let pose = f.rigPose;
        const j = d.joint;
        if (j === 'pelvis') {
          pose = { ...d.poseBefore, dx: d.poseBefore.dx + ((p.x - d.start.x) / rig.height) * d.poseBefore.facing, lift: Math.max(0, d.poseBefore.lift - (p.y - d.start.y) / rig.height) };
        } else if (ikOn && (j === 'wristR' || j === 'wristL')) {
          const s2 = j.slice(-1);
          pose = reachIK(rig, pose, `ua${s2}` as BoneId, `fa${s2}` as BoneId, p);
        } else if (ikOn && (j === 'ankleR' || j === 'ankleL')) {
          const s2 = j.slice(-1);
          pose = reachIK(rig, pose, `th${s2}` as BoneId, `sh${s2}` as BoneId, p);
        } else {
          const bone = BONE_BY_END[j]?.id;
          if (bone) pose = aimBone(rig, pose, bone, p);
        }
        previewFramePose(d.frameId, pose);
      }
      return;
    }
    if (d.kind === 'lasso') {
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 3 / view.current.zoom) {
        d.pts.push(p);
        setLasso([...d.pts]);
      }
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'stroke') {
      const l = getLayers(d.frameId);
      if (!l) return;
      const pad2 = d.size + 4;
      const x = Math.max(0, Math.floor(d.minX - pad2)), y = Math.max(0, Math.floor(d.minY - pad2));
      const w = Math.min(W, Math.ceil(d.maxX + pad2)) - x, h = Math.min(H, Math.ceil(d.maxY + pad2)) - y;
      if (w <= 0 || h <= 0) return;
      const before = d.snapshot.getContext('2d', { willReadFrequently: true })!.getImageData(x, y, w, h);
      const after = l[d.layer].getContext('2d', { willReadFrequently: true })!.getImageData(x, y, w, h);
      commitPixels(d.frameId, d.layer, { x, y, w, h }, before, after, d.erase ? 'Erase' : 'Draw');
      return;
    }
    if (d.kind === 'marquee') {
      setMarquee(null);
      const r = normRect(d.start, d.cur);
      if (r.w < 3 || r.h < 3 || !frame) return;
      const rr = clampRect(r, W, H);
      if (!rr) return;
      const layer = activeLayer === 'art' && rigDriven ? 'ink' : activeLayer;
      setSel({ rect: rr, frameId: frame.id, layer, floating: null, before: null, t: { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 } });
      return;
    }
    if (d.kind === 'joint') {
      const pr = actions.get().project!;
      if (d.fit) {
        commitRig({ rig: d.rigBefore, style: pr.rigStyle }, { rig: pr.rig, style: pr.rigStyle }, 'Fit rig');
      } else if (d.frameId) {
        const f = pr.frames.find((x) => x.id === d.frameId);
        if (f?.rigPose) commitFramePose(d.frameId, d.poseBefore, f.rigPose, 'Pose joint');
      }
      return;
    }
    if (d.kind === 'lasso') {
      setLasso(null);
      if (d.pts.length < 4) return;
      addCutoutPart(d.pts, cutBone);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || e.altKey) {
      zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    } else {
      view.current.panX -= e.deltaX;
      view.current.panY -= e.deltaY;
      setViewTick((t) => t + 1);
    }
  };
  // prevent browser page-zoom on pinch over the canvas
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const stop = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  if (!project) return null;
  const v = view.current;
  const cursorStyle = tool === 'hand' ? (drag.current?.kind === 'pan' ? 'grabbing' : 'grab') : tool === 'draw' || tool === 'eraser' ? 'none' : tool === 'select' ? 'crosshair' : tool === 'move' ? 'move' : tool === 'rig' && rigMode === 'cut' ? 'crosshair' : 'default';
  const hr = 6.5 / v.zoom; // handle radius in doc units
  const corners = sel ? selCorners(sel) : null;
  const cutParts = rigStyle?.kind === 'cutout' ? rigStyle.parts : [];

  return (
    <div
      ref={wrapRef}
      className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-ink-950 touch-none select-none"
      style={{ cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setCursor(null)}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="canvas-view"
    >
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size.w, height: size.h }} aria-label={`Canvas showing ${frame?.label ?? 'frame'}`} role="img" />
      <svg className="absolute inset-0 pointer-events-none" width={size.w} height={size.h}>
        <g transform={`translate(${v.panX} ${v.panY}) scale(${v.zoom})`}>
          {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(77,141,255,0.08)" stroke="#4d8dff" strokeWidth={1 / v.zoom} strokeDasharray={`${4 / v.zoom} ${3 / v.zoom}`} />}
          {sel && corners && (
            <g>
              <polygon points={corners.map((c) => `${c.x},${c.y}`).join(' ')} fill="transparent" stroke="#4d8dff" strokeWidth={1.2 / v.zoom} strokeDasharray={sel.floating ? undefined : `${4 / v.zoom} ${3 / v.zoom}`} className="pointer-events-auto" style={{ cursor: 'move' }} data-handle="body" />
              {corners.map((c, i) => (
                <rect key={i} x={c.x - hr * 0.8} y={c.y - hr * 0.8} width={hr * 1.6} height={hr * 1.6} fill="#fff" stroke="#4d8dff" strokeWidth={1.2 / v.zoom} className="pointer-events-auto" style={{ cursor: 'nwse-resize' }} data-handle={`corner${i}`} />
              ))}
              {(() => {
                const top = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
                const ang = sel.t.rot - Math.PI / 2;
                const rp = { x: top.x + Math.cos(ang) * 26 / v.zoom, y: top.y + Math.sin(ang) * 26 / v.zoom };
                return (
                  <g>
                    <line x1={top.x} y1={top.y} x2={rp.x} y2={rp.y} stroke="#4d8dff" strokeWidth={1.2 / v.zoom} />
                    <circle cx={rp.x} cy={rp.y} r={hr} fill="#4d8dff" stroke="#fff" strokeWidth={1.2 / v.zoom} className="pointer-events-auto" style={{ cursor: 'grab' }} data-handle="rotate" />
                  </g>
                );
              })()}
            </g>
          )}
          {cursor && (tool === 'draw' || tool === 'eraser') && !playing && (
            <circle cx={cursor.x} cy={cursor.y} r={(tool === 'eraser' ? eraserSize : brushSize) / 2} fill="none" stroke={tool === 'eraser' ? '#ff6b6b' : '#4d8dff'} strokeWidth={1.2 / v.zoom} />
          )}
          {tool === 'rig' && rigMode === 'cut' && cutParts.map((part) => (
            <g key={part.id}>
              <polygon points={part.polygon.map((q) => `${q.x},${q.y}`).join(' ')} fill="rgba(56,201,176,0.12)" stroke="#38c9b0" strokeWidth={1.4 / v.zoom} />
            </g>
          ))}
          {lasso && <polyline points={lasso.map((q) => `${q.x},${q.y}`).join(' ')} fill="rgba(56,201,176,0.1)" stroke="#38c9b0" strokeWidth={1.5 / v.zoom} strokeDasharray={`${4 / v.zoom} ${3 / v.zoom}`} />}
          {solved && rig && !playing && <RigOverlay solved={solved} zoom={v.zoom} headR={rig.proportions.head * rig.height} fit={fitMode} />}
        </g>
      </svg>
      {!compact && (
        <div className="absolute right-3 bottom-3 flex items-center gap-0.5 panel border rounded-lg px-1 py-0.5 shadow-panel" onPointerDown={(e) => e.stopPropagation()}>
          <button className="icon-btn !w-7 !h-7" aria-label="Zoom out" title="Zoom out (Ctrl + scroll)" onClick={() => zoomAt(1 / 1.25)}><Minus size={14} /></button>
          <button className="text-[11px] tabular-nums text-paper-dim w-11 hover:text-paper" title="Reset to 100%" onClick={() => zoomAt(1 / v.zoom)}>{Math.round(v.zoom * 100)}%</button>
          <button className="icon-btn !w-7 !h-7" aria-label="Zoom in" title="Zoom in (Ctrl + scroll)" onClick={() => zoomAt(1.25)}><Plus size={14} /></button>
          <div className="w-px h-4 bg-ink-600 mx-0.5" />
          <button className="icon-btn !w-7 !h-7" aria-label="Fit to screen" title="Fit to screen (0)" onClick={fit}><Maximize size={13} /></button>
        </div>
      )}
      {sel && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 flex items-center gap-2 panel border rounded-lg px-2 py-1.5 shadow-panel text-[12px] anim-in" onPointerDown={(e) => e.stopPropagation()}>
          <span className="text-paper-dim px-1">Drag to move · corners to scale (Shift = stretch) · dot to rotate</span>
          <button className="btn !h-7" onClick={cancelSelection}>Cancel</button>
          <button className="btn !h-7" onClick={deleteSelection}>Delete</button>
          <button className="btn btn-primary !h-7" onClick={commitSelection}>Apply</button>
        </div>
      )}
      {playing && <div className="absolute left-3 top-3 text-[11px] px-2 py-1 rounded bg-black/50 text-paper-dim tabular-nums">▶ {frame?.label}</div>}
    </div>
  );
}

function RigOverlay({ solved, zoom, headR, fit }: { solved: ReturnType<typeof solve>; zoom: number; headR: number; fit: boolean }) {
  const j = solved.joints;
  const color = (b: (typeof BONES)[number]) => (b.side === 'R' ? '#ff8a5c' : b.side === 'L' ? '#5cb3ff' : '#ecebe8');
  const r = 7 / zoom;
  const handles: JointId[] = ['pelvis', 'chest', 'neckTop', 'headC', 'elbowR', 'wristR', 'elbowL', 'wristL', 'kneeR', 'ankleR', 'toeR', 'kneeL', 'ankleL', 'toeL'];
  const title: Partial<Record<JointId, string>> = { pelvis: fit ? 'Move the whole rig' : 'Move / lift the body', wristR: 'Right hand (moves the whole arm)', wristL: 'Left hand (moves the whole arm)', ankleR: 'Right foot (moves the whole leg)', ankleL: 'Left foot (moves the whole leg)', headC: 'Head' };
  return (
    <g>
      <circle cx={j.headC.x} cy={j.headC.y} r={headR} fill="none" stroke="#ecebe8" strokeOpacity={0.5} strokeWidth={1.5 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
      {BONES.map((b) => (
        <line key={b.id} x1={j[b.from].x} y1={j[b.from].y} x2={j[b.to].x} y2={j[b.to].y} stroke={color(b)} strokeWidth={3 / zoom} strokeLinecap="round" opacity={0.9} />
      ))}
      <line x1={j.pelvis.x} y1={j.pelvis.y} x2={j.hipR.x} y2={j.hipR.y} stroke="#ecebe8" strokeWidth={2 / zoom} />
      <line x1={j.pelvis.x} y1={j.pelvis.y} x2={j.hipL.x} y2={j.hipL.y} stroke="#ecebe8" strokeWidth={2 / zoom} />
      {handles.map((h) => {
        const side = h.endsWith('R') ? '#ff8a5c' : h.endsWith('L') ? '#5cb3ff' : '#ecebe8';
        const big = h === 'pelvis' || h.startsWith('wrist') || h.startsWith('ankle');
        return (
          <circle key={h} cx={j[h].x} cy={j[h].y} r={big ? r * 1.2 : r} fill={h === 'pelvis' ? '#4d8dff' : '#131417'} stroke={side} strokeWidth={2.2 / zoom} className="pointer-events-auto" style={{ cursor: 'grab' }} data-handle={`joint:${h}`}>
            <title>{title[h] ?? h}</title>
          </circle>
        );
      })}
    </g>
  );
}

function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
function clampRect(r: Rect, W: number, H: number): Rect | null {
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  const w = Math.min(W, Math.ceil(r.x + r.w)) - x, h = Math.min(H, Math.ceil(r.y + r.h)) - y;
  return w > 1 && h > 1 ? { x, y, w, h } : null;
}
function pad(r: Rect, p: number, W: number, H: number): Rect {
  return clampRect({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 }, W, H) ?? r;
}

/** Cut-out rig: a lasso around part of the ORIGINAL drawing pins that part to a bone. */
function addCutoutPart(polygon: Pt[], bone: BoneId) {
  const pr = actions.get().project;
  if (!pr?.rig) return;
  const ref = pr.frames.find((f) => f.kind === 'original') ?? pr.frames[0];
  const prevStyle = pr.rigStyle;
  const base: CutoutStyle = prevStyle?.kind === 'cutout' ? prevStyle : { kind: 'cutout', parts: [], remainder: true, sourceFrameId: ref.id };
  const label = BONES.find((b) => b.id === bone)?.label ?? bone;
  const next: RigStyle = { ...base, parts: [...base.parts, { id: uid(), bone, polygon, label }] };
  commitRig({ rig: pr.rig, style: prevStyle }, { rig: pr.rig, style: next }, `Cut out ${label}`);
  toast(`Pinned a piece to the ${label.toLowerCase()}. Rig poses now move your own drawing.`, 'success');
}

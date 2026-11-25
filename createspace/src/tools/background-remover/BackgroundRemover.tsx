import {
  Brush,
  Download,
  Eraser,
  Eye,
  FolderUp,
  ImagePlus,
  LoaderCircle,
  Pipette,
  Redo2,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useCloud } from '@/cloud/CloudProvider';
import { SaveToProjectDialog } from '@/components/cloud/SaveToProjectDialog';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { saveFile } from '@/lib/saveFile';
import {
  borderIndices,
  combine,
  dominantBorderColor,
  feather,
  fitSize,
  keptShare,
  KEEP,
  paintStroke,
  refineProbability,
  REMOVE,
  selectSimilar,
  toleranceToDistance,
} from './maskOps';
import { detectSubject, loadSegmenter } from './segment';

const MAX_SIDE = 2500;
const HISTORY = 15;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

type Tool = 'erase' | 'restore' | 'pick';
type Bg = 'transparent' | 'white' | 'black' | 'custom';
interface Loaded {
  name: string;
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
  rgba: Uint8ClampedArray;
  resized: boolean;
}
interface Snapshot {
  base: Uint8Array;
  overrides: Uint8Array;
  prob: Uint8Array | null;
}

const BG_SWATCH: Record<Exclude<Bg, 'custom'>, string> = { transparent: '', white: '#ffffff', black: '#000000' };
const checker =
  'repeating-conic-gradient(#d9d7d2 0% 25%, #f4f3f0 0% 50%) 50% / 20px 20px';

export default function BackgroundRemover() {
  const { status, downloads } = useCloud();
  const [img, setImg] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Editing state lives in refs (large arrays); `version` re-renders the UI when they change.
  const base = useRef<Uint8Array>(new Uint8Array());
  const overrides = useRef<Uint8Array>(new Uint8Array());
  const prob = useRef<Uint8Array | null>(null);
  const finalMask = useRef<Uint8Array>(new Uint8Array());
  const history = useRef<{ stack: Snapshot[]; index: number }>({ stack: [], index: -1 });
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const [cleanup, setCleanup] = useState(35);
  const [softness, setSoftness] = useState(1);
  const [tolerance, setTolerance] = useState(25);
  const [contiguous, setContiguous] = useState(true);
  const [tool, setTool] = useState<Tool>('erase');
  const [brush, setBrush] = useState(30);
  const [bg, setBg] = useState<Bg>('transparent');
  const [custom, setCustom] = useState('#ff6b4a');
  const [comparing, setComparing] = useState(false);
  const [ai, setAi] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [method, setMethod] = useState<'none' | 'ai' | 'color'>('none');
  const [saveBlob, setSaveBlob] = useState<{ blob: Blob; name: string } | null>(null);

  const stage = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const stroke = useRef<{ last: [number, number] } | null>(null);

  // ---------- rendering ----------
  const renderAll = useCallback(() => {
    const c = stage.current;
    if (!img || !c) return;
    const ctx = c.getContext('2d')!;
    if (comparing) {
      ctx.clearRect(0, 0, img.w, img.h);
      ctx.drawImage(img.canvas, 0, 0);
      return;
    }
    const m = feather(combine(base.current, overrides.current), img.w, img.h, softness);
    finalMask.current = m;
    const out = ctx.createImageData(img.w, img.h);
    const d = out.data;
    d.set(img.rgba);
    for (let i = 0; i < m.length; i++) d[i * 4 + 3] = (img.rgba[i * 4 + 3] * m[i]) / 255;
    ctx.putImageData(out, 0, 0);
  }, [img, softness, comparing]);

  useEffect(() => {
    const id = requestAnimationFrame(renderAll);
    return () => cancelAnimationFrame(id);
  }, [renderAll, version]);

  /** Fast partial redraw while brushing (no edge softening until the stroke ends). */
  const renderRect = (r: { x: number; y: number; w: number; h: number }) => {
    const c = stage.current;
    if (!img || !c) return;
    const ctx = c.getContext('2d')!;
    const part = ctx.createImageData(r.w, r.h);
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const i = (r.y + y) * img.w + (r.x + x);
        const o = overrides.current[i];
        const a = o === KEEP ? 255 : o === REMOVE ? 0 : base.current[i];
        const p = (y * r.w + x) * 4;
        part.data[p] = img.rgba[i * 4];
        part.data[p + 1] = img.rgba[i * 4 + 1];
        part.data[p + 2] = img.rgba[i * 4 + 2];
        part.data[p + 3] = (img.rgba[i * 4 + 3] * a) / 255;
      }
    ctx.putImageData(part, r.x, r.y);
  };

  // ---------- history ----------
  const commit = () => {
    const h = history.current;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push({ base: base.current, overrides: overrides.current.slice(), prob: prob.current });
    if (h.stack.length > HISTORY) h.stack.shift();
    h.index = h.stack.length - 1;
    bump();
  };
  const restore = (s: Snapshot) => {
    base.current = s.base;
    overrides.current = s.overrides.slice();
    prob.current = s.prob;
    setMethod(s.prob ? 'ai' : s.base.some((v) => v < 255) ? 'color' : 'none');
    bump();
  };
  const undo = () => {
    const h = history.current;
    if (h.index > 0) restore(h.stack[--h.index]);
  };
  const redo = () => {
    const h = history.current;
    if (h.index < h.stack.length - 1) restore(h.stack[++h.index]);
  };

  // ---------- automatic removal ----------
  const removePlain = useCallback(
    (image: Loaded, quiet = false) => {
      const { color, share } = dominantBorderColor(image.rgba, image.w, image.h);
      const sel = selectSimilar(image.rgba, image.w, image.h, borderIndices(image.w, image.h), color, toleranceToDistance(Math.max(tolerance, 15)), true);
      const m = new Uint8Array(image.w * image.h).fill(255);
      for (let i = 0; i < m.length; i++) if (sel[i]) m[i] = 0;
      base.current = m;
      prob.current = null;
      setMethod('color');
      commit();
      if (!quiet)
        setNotice(
          share < 0.5
            ? 'The edges of this image have mixed colors, so this method may miss parts. Try “Detect subject” or the brushes.'
            : `Removed the plain background (${Math.round((1 - keptShare(m)) * 100)}% of the image).`,
        );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tolerance],
  );

  const runAi = useCallback(async (image: Loaded) => {
    setError('');
    setAi('loading');
    try {
      await loadSegmenter();
      setAi('running');
      await new Promise((r) => setTimeout(r, 30)); // let the "Detecting…" message paint
      const p = await detectSubject(image.canvas);
      prob.current = p;
      base.current = refineProbability(p, cleanupRef.current);
      setMethod('ai');
      commit();
      setAi('idle');
      setNotice('Subject detected. Use the brushes to fix any spots it missed.');
    } catch {
      setAi('error');
      // Fall back to the color method when the image has a plain backdrop.
      const { share } = dominantBorderColor(image.rgba, image.w, image.h);
      if (share > 0.6) {
        removePlain(image, true);
        setNotice('Automatic subject detection isn’t available here, so the plain background was removed by color instead.');
      } else setNotice('Automatic subject detection isn’t available here. Use “Remove plain background”, the color picker or the brushes.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removePlain]);

  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;
  const changeCleanup = (v: number) => {
    setCleanup(v);
    if (prob.current) {
      base.current = refineProbability(prob.current, v);
      bump();
    }
  };

  // ---------- loading images ----------
  const load = async (file: File) => {
    setError('');
    setNotice('');
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setError('Choose a PNG, JPG, WebP or GIF image.');
    try {
      const bitmap = await createImageBitmap(file);
      const { w, h, scaled } = fitSize(bitmap.width, bitmap.height, MAX_SIDE);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();
      const image: Loaded = { name: file.name.replace(/\.[^.]+$/, '') || 'image', w, h, canvas, rgba: ctx.getImageData(0, 0, w, h).data, resized: scaled };
      base.current = new Uint8Array(w * h).fill(255);
      overrides.current = new Uint8Array(w * h);
      prob.current = null;
      history.current = { stack: [], index: -1 };
      setMethod('none');
      setImg(image);
      commit();
      runAi(image);
    } catch {
      setError('That image couldn’t be opened. Try a different file.');
    }
  };

  // Paste an image with Ctrl/Cmd+V
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) load(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // Keyboard: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || (e.target as HTMLElement).closest('input,textarea')) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- pointer editing ----------
  const toImage = (e: React.PointerEvent): [number, number] => {
    const r = stage.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * img!.w, ((e.clientY - r.top) / r.height) * img!.h];
  };
  const brushRadius = () => {
    const r = stage.current!.getBoundingClientRect();
    return (brush / 2) * (img!.w / r.width);
  };
  const moveCursor = (e: React.PointerEvent) => {
    const el = cursor.current;
    if (!el || tool === 'pick') return;
    const r = stage.current!.getBoundingClientRect();
    el.style.transform = `translate(${e.clientX - r.left - brush / 2}px, ${e.clientY - r.top - brush / 2}px)`;
  };

  const onDown = (e: React.PointerEvent) => {
    if (!img || comparing) return;
    const [x, y] = toImage(e);
    if (tool === 'pick') {
      const i = Math.floor(y) * img.w + Math.floor(x);
      const p = i * 4;
      const sel = selectSimilar(img.rgba, img.w, img.h, [i], [img.rgba[p], img.rgba[p + 1], img.rgba[p + 2]], toleranceToDistance(tolerance), contiguous);
      const o = overrides.current;
      let n = 0;
      for (let k = 0; k < sel.length; k++) if (sel[k]) (o[k] = REMOVE), n++;
      commit();
      setNotice(`Removed ${n.toLocaleString()} pixels of that color.`);
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    stroke.current = { last: [x, y] };
    const r = paintStroke(overrides.current, img.w, img.h, [x, y], [x, y], brushRadius(), tool === 'erase' ? REMOVE : KEEP);
    if (r) renderRect(r);
  };
  const onMove = (e: React.PointerEvent) => {
    moveCursor(e);
    if (!img || !stroke.current) return;
    const pt = toImage(e);
    const r = paintStroke(overrides.current, img.w, img.h, stroke.current.last, pt, brushRadius(), tool === 'erase' ? REMOVE : KEEP);
    stroke.current.last = pt;
    if (r) renderRect(r);
  };
  const onUp = () => {
    if (!stroke.current) return;
    stroke.current = null;
    commit();
  };

  // ---------- export ----------
  const makePng = async () => {
    if (!img) return null;
    renderAll();
    const out = document.createElement('canvas');
    out.width = img.w;
    out.height = img.h;
    const ctx = out.getContext('2d')!;
    if (bg !== 'transparent') {
      ctx.fillStyle = bg === 'custom' ? custom : BG_SWATCH[bg];
      ctx.fillRect(0, 0, img.w, img.h);
    }
    ctx.drawImage(stage.current!, 0, 0);
    return new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
  };
  const fileName = () => `${img?.name ?? 'image'}-${bg === 'transparent' ? 'no-bg' : 'new-bg'}.png`;
  const download = async () => {
    const blob = await makePng();
    if (!blob) return;
    try {
      await saveFile(blob, fileName(), downloads);
      setNotice(`Downloaded ${fileName()}.`);
    } catch (e) {
      if ((e as { code?: string })?.code !== 'declined') setError('The download didn’t start. Please try again.');
    }
  };

  const reset = () => {
    if (!img) return;
    base.current = new Uint8Array(img.w * img.h).fill(255);
    overrides.current = new Uint8Array(img.w * img.h);
    prob.current = null;
    setMethod('none');
    commit();
    setNotice('Back to the original image.');
  };

  const canUndo = history.current.index > 0;
  const canRedo = history.current.index < history.current.stack.length - 1;
  void version;

  // ---------- empty state ----------
  if (!img)
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) load(f);
        }}
        className={cn('panel grid min-h-[360px] place-items-center p-6 text-center transition-[outline]', dragging && 'outline-[3px] outline-offset-2 outline-brand outline-dashed')}
      >
        <div className="max-w-sm">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface text-muted shadow-card">
            <ImagePlus className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-display text-xl">Drop an image here</h2>
          <p className="mt-1 text-sm text-muted">PNG, JPG or WebP. You can also paste an image with Ctrl+V / ⌘V.</p>
          <Button variant="primary" className="mt-5" onClick={() => fileInput.current?.click()}>
            <ImagePlus aria-hidden="true" /> Choose image
          </Button>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs font-bold text-muted">
            <ShieldCheck className="size-4" aria-hidden="true" /> Processed on your device. Your image isn’t uploaded.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm font-bold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
        <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" data-testid="image-input" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
      </div>
    );

  // ---------- editor ----------
  const stageBg = bg === 'transparent' ? checker : bg === 'custom' ? custom : BG_SWATCH[bg];
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label="Image" className="panel min-w-0 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <IconBtn label="Undo" onClick={undo} disabled={!canUndo}>
            <Undo2 />
          </IconBtn>
          <IconBtn label="Redo" onClick={redo} disabled={!canRedo}>
            <Redo2 />
          </IconBtn>
          <button
            type="button"
            onPointerDown={() => setComparing(true)}
            onPointerUp={() => setComparing(false)}
            onPointerLeave={() => setComparing(false)}
            onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setComparing(true)}
            onKeyUp={() => setComparing(false)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm font-bold shadow-card hover:bg-surface-2"
          >
            <Eye className="size-4" aria-hidden="true" /> Hold to compare
          </button>
          <span className="ml-auto truncate text-xs font-bold text-muted">
            {img.w}×{img.h}px{img.resized ? ' (resized)' : ''}
          </span>
        </div>
        <div
          className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl shadow-card"
          style={{ background: stageBg }}
          onPointerLeave={() => cursor.current && (cursor.current.style.opacity = '0')}
          onPointerEnter={() => cursor.current && tool !== 'pick' && (cursor.current.style.opacity = '1')}
        >
          <canvas
            ref={stage}
            width={img.w}
            height={img.h}
            aria-label="Image preview. Draw on it to erase or restore areas."
            data-testid="stage"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className={cn('block max-h-[68vh] max-w-full touch-none', tool === 'pick' ? 'cursor-crosshair' : 'cursor-none')}
            style={{ width: 'auto', height: 'auto' }}
          />
          <div
            ref={cursor}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 rounded-full border-2 border-white opacity-0 mix-blend-difference"
            style={{ width: brush, height: brush }}
          />
          {(ai === 'loading' || ai === 'running') && (
            <div role="status" className="absolute inset-0 grid place-items-center bg-black/35 text-sm font-extrabold text-white">
              <span className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                {ai === 'loading' ? 'Loading the detector (first time only)…' : 'Detecting the subject…'}
              </span>
            </div>
          )}
        </div>
        {(notice || error) && (
          <p role="status" className={cn('mt-3 flex items-start justify-between gap-3 rounded-2xl px-4 py-2.5 text-sm font-bold', error ? 'bg-red-100 text-red-900 dark:bg-red-400/15 dark:text-red-200' : 'bg-surface shadow-card')}>
            <span>{error || notice}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => (setNotice(''), setError(''))} className="text-muted hover:text-fg">
              <X className="size-4" aria-hidden="true" />
            </button>
          </p>
        )}
      </section>

      <aside aria-label="Background Remover controls" className="space-y-4">
        <Group title="1. Remove the background">
          <div className="grid gap-2">
            <Button variant={method === 'ai' ? 'primary' : 'secondary'} onClick={() => runAi(img)} disabled={ai === 'loading' || ai === 'running'}>
              <ScanSearch aria-hidden="true" /> Detect subject
            </Button>
            <Button variant={method === 'color' ? 'primary' : 'secondary'} onClick={() => removePlain(img)}>
              <Wand2 aria-hidden="true" /> Remove plain background
            </Button>
          </div>
          {method === 'ai' && <Slider label="Edge cleanup" value={cleanup} min={0} max={100} onChange={changeCleanup} hint="Higher removes more faint background" />}
          {method === 'color' && <Slider label="Color tolerance" value={tolerance} min={0} max={100} onChange={setTolerance} hint="Press “Remove plain background” again after changing" />}
        </Group>

        <Group title="2. Touch up">
          <div role="radiogroup" aria-label="Touch-up tool" className="grid grid-cols-3 gap-1.5">
            {(
              [
                ['erase', 'Erase', Eraser],
                ['restore', 'Restore', Brush],
                ['pick', 'Pick color', Pipette],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={tool === id}
                onClick={() => setTool(id)}
                className={cn('flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-bold shadow-card', tool === id ? 'bg-ink text-ink-contrast' : 'bg-surface text-muted hover:text-fg')}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {tool === 'pick' ? (
            <>
              <Slider label="Tolerance" value={tolerance} min={0} max={100} onChange={setTolerance} />
              <label className="flex items-center gap-2 px-1 text-sm font-bold">
                <input type="checkbox" checked={contiguous} onChange={(e) => setContiguous(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                Only connected areas
              </label>
              <p className="px-1 text-xs text-muted">Click a color in the image to remove it.</p>
            </>
          ) : (
            <Slider label="Brush size" value={brush} min={6} max={160} onChange={setBrush} hint={tool === 'erase' ? 'Paint over areas to remove' : 'Paint over areas to bring back'} />
          )}
        </Group>

        <Group title="3. Edges & background">
          <Slider label="Edge softness" value={softness} min={0} max={10} onChange={(v) => setSoftness(v)} />
          <div role="radiogroup" aria-label="Background" className="flex flex-wrap items-center gap-2">
            {(['transparent', 'white', 'black'] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={bg === b}
                aria-label={b === 'transparent' ? 'Transparent' : b[0].toUpperCase() + b.slice(1)}
                title={b}
                onClick={() => setBg(b)}
                className={cn('size-10 rounded-full border-2 shadow-card', bg === b ? 'border-ink ring-2 ring-ink ring-offset-2 ring-offset-panel' : 'border-line')}
                style={{ background: b === 'transparent' ? checker : BG_SWATCH[b] }}
              />
            ))}
            <label
              className={cn('relative size-10 cursor-pointer rounded-full border-2 shadow-card', bg === 'custom' ? 'border-ink ring-2 ring-ink ring-offset-2 ring-offset-panel' : 'border-line')}
              style={{ background: custom }}
              title="Custom color"
            >
              <span className="sr-only">Custom color</span>
              <input
                type="color"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setBg('custom');
                }}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </Group>

        <Group title="4. Save">
          <div className="grid gap-2">
            <Button variant="primary" onClick={download}>
              <Download aria-hidden="true" /> Download PNG
            </Button>
            {status === 'ready' && (
              <Button
                onClick={async () => {
                  const blob = await makePng();
                  if (blob) setSaveBlob({ blob, name: fileName() });
                }}
              >
                <FolderUp aria-hidden="true" /> Save to My Projects
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="ghost" onClick={reset}>
                <RotateCcw aria-hidden="true" /> Start over
              </Button>
              <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
                <ImagePlus aria-hidden="true" /> New image
              </Button>
            </div>
          </div>
        </Group>
        <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" data-testid="image-input" onChange={(e) => (e.target.files?.[0] && load(e.target.files[0]), (e.target.value = ''))} />
      </aside>

      {saveBlob && <SaveToProjectDialog blob={saveBlob.blob} filename={saveBlob.name} onClose={() => setSaveBlob(null)} onSaved={setNotice} />}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel space-y-3 p-4" aria-label={title}>
      <h3 className="text-sm font-extrabold">{title}</h3>
      {children}
    </section>
  );
}

function Slider({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block px-1">
      <span className="flex justify-between text-sm font-bold">
        {label}
        <span className="text-muted tabular-nums">{value}</span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-ink)]" />
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-full bg-surface shadow-card hover:bg-surface-2 disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

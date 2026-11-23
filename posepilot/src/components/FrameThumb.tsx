import { memo, useEffect, useRef } from 'react';
import { getLayers } from '../state/layers';
import { useStore } from '../state/store';

/** Small live preview of a frame (art + your lines). Redraws when bitmaps change. */
export const FrameThumb = memo(function FrameThumb({ id, width, checker = true, className = '' }: { id: string; width: number; checker?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const v = useStore((s) => s.bitmapVersion);
  const W = useStore((s) => s.project?.width ?? 16);
  const H = useStore((s) => s.project?.height ?? 9);
  const height = Math.round((width * H) / W);
  useEffect(() => {
    const c = ref.current;
    const l = getLayers(id);
    if (!c || !l) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = width * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'medium';
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(l.art, 0, 0, c.width, c.height);
    g.drawImage(l.ink, 0, 0, c.width, c.height);
  }, [id, v, width, height]);
  return <canvas ref={ref} style={{ width, height }} className={`${checker ? 'checker' : 'bg-white'} block ${className}`} aria-hidden />;
});

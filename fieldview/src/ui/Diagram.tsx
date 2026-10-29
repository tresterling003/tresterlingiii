import { useEffect, useRef } from 'react';
import type { Drill, Point } from '../data/schema';
import { fieldCenterX, HALF_WIDTH, HASH_OFFSET } from '../data/field';
import type { Timeline } from '../sim/timeline';
import { playerPosAt } from '../sim/timeline';

export type Sel = { kind: 'off'; id: string } | { kind: 'def'; id: string } | { kind: 'wp'; moveId: string; index: number } | null;

interface Props {
  drill: Drill;
  timeline: Timeline | null;
  getTime: () => number;
  sel: Sel;
  activeMove: string | null;
  drawing: boolean;
  onSelect: (s: Sel) => void;
  onMovePlayer: (id: string, p: Point) => void;
  onMoveDefender: (id: string, p: Point) => void;
  onMoveWaypoint: (moveId: string, index: number, p: Point) => void;
  onAddWaypoint: (p: Point) => void;
  onFinishPath: () => void;
}

const Y_MAX = 12; // offense backfield (top)
const Y_MIN = -15; // defense depth (bottom)

/** Top-down field diagram, defense at the bottom (as a defensive coach draws it). */
export function Diagram(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(p);
  propsRef.current = p;
  const drag = useRef<Sel>(null);

  useEffect(() => {
    const c = ref.current!;
    let raf = 0;
    const view = () => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      const cx = fieldCenterX(propsRef.current.drill.ball.hash);
      const xMin = cx - HALF_WIDTH - 1;
      const xMax = cx + HALF_WIDTH + 1;
      const scale = Math.min(w / (xMax - xMin), h / (Y_MAX - Y_MIN));
      const ox = w / 2 - ((xMin + xMax) / 2) * scale;
      const oy = h / 2 + ((Y_MAX + Y_MIN) / 2) * scale;
      return {
        scale,
        toS: (x: number, y: number) => [ox + x * scale, oy - y * scale] as [number, number],
        toF: (sx: number, sy: number) => ({ x: (sx - ox) / scale, y: (oy - sy) / scale }),
        cx,
      };
    };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const P = propsRef.current;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== c.clientWidth * dpr || c.height !== c.clientHeight * dpr) {
        c.width = c.clientWidth * dpr;
        c.height = c.clientHeight * dpr;
      }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { scale, toS, cx } = view();
      g.fillStyle = '#123d22';
      g.fillRect(0, 0, c.clientWidth, c.clientHeight);
      // field lines
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 1;
      const L = P.drill.ball.yardLine;
      for (let yl = Math.ceil((L - 15) / 5) * 5; yl <= L + 15; yl += 5) {
        const y = L - yl; // field y of that yard line
        if (y > Y_MAX || y < Y_MIN) continue;
        const [x0, sy] = toS(cx - HALF_WIDTH, y);
        const [x1] = toS(cx + HALF_WIDTH, y);
        g.beginPath();
        g.moveTo(x0, sy);
        g.lineTo(x1, sy);
        g.stroke();
      }
      for (const s of [-1, 1]) {
        const [sx0, sy0] = toS(cx + s * HALF_WIDTH, Y_MAX);
        const [, sy1] = toS(cx + s * HALF_WIDTH, Y_MIN);
        g.beginPath();
        g.moveTo(sx0, sy0);
        g.lineTo(sx0, sy1);
        g.stroke();
        for (let y = Math.ceil(Y_MIN); y <= Y_MAX; y++) {
          const [hx, hy] = toS(cx + s * HASH_OFFSET, y);
          g.beginPath();
          g.moveTo(hx - 3, hy);
          g.lineTo(hx + 3, hy);
          g.stroke();
        }
      }
      // LOS
      const [lx0, ly] = toS(cx - HALF_WIDTH, 0);
      const [lx1] = toS(cx + HALF_WIDTH, 0);
      g.strokeStyle = '#3b82f6';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(lx0, ly);
      g.lineTo(lx1, ly);
      g.stroke();
      g.font = '600 11px Arial';
      g.fillStyle = '#93c5fd';
      g.fillText('LOS', lx0 + 4, ly - 4);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillText('OFFENSE ↑', lx0 + 4, toS(0, Y_MAX - 0.6)[1]);
      g.fillText('DEFENSE ↓ (you)', lx0 + 4, toS(0, Y_MIN + 0.6)[1]);

      // movement paths
      const start = new Map(P.drill.players.map((q) => [q.id, { x: q.x, y: q.y }]));
      const moves = [...P.drill.movements].sort((a, b) => (a.kind === 'postsnap' ? 1 : 0) - (b.kind === 'postsnap' ? 1 : 0) || a.start - b.start);
      for (const m of moves) {
        const from = start.get(m.playerId);
        if (!from) continue;
        const pts = [from, ...m.path];
        g.strokeStyle = m.kind === 'shift' ? '#36d6ff' : m.kind === 'motion' ? '#ffd23f' : 'rgba(255,255,255,0.45)';
        g.lineWidth = m.id === P.activeMove ? 3.5 : 2;
        g.setLineDash(m.kind === 'postsnap' ? [5, 4] : []);
        g.beginPath();
        pts.forEach((q, i) => {
          const [sx, sy] = toS(q.x, q.y);
          if (i === 0) g.moveTo(sx, sy);
          else g.lineTo(sx, sy);
        });
        g.stroke();
        g.setLineDash([]);
        m.path.forEach((q, i) => {
          const [sx, sy] = toS(q.x, q.y);
          const selected = P.sel?.kind === 'wp' && P.sel.moveId === m.id && P.sel.index === i;
          g.fillStyle = selected ? '#fff' : g.strokeStyle as string;
          g.beginPath();
          g.arc(sx, sy, selected ? 6 : 4, 0, Math.PI * 2);
          g.fill();
        });
        if (m.kind !== 'postsnap') start.set(m.playerId, m.path[m.path.length - 1]);
      }

      // live positions at the current time (ghosts)
      const t = P.getTime();
      if (P.timeline) {
        g.globalAlpha = 0.5;
        for (const tr of P.timeline.tracks) {
          const q = playerPosAt(tr, t, P.timeline);
          const [sx, sy] = toS(q.x, q.y);
          g.fillStyle = '#fca5a5';
          g.beginPath();
          g.arc(sx, sy, Math.max(4, scale * 0.35), 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      }

      // offense
      const r = Math.max(8, scale * 0.42);
      for (const q of P.drill.players) {
        const [sx, sy] = toS(q.x, q.y);
        const on = P.sel?.kind === 'off' && P.sel.id === q.id;
        g.fillStyle = q.onLine ? '#dc2626' : '#f97316';
        g.strokeStyle = on ? '#fff' : '#111';
        g.lineWidth = on ? 3 : 1.5;
        g.beginPath();
        g.arc(sx, sy, r, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        // facing tick
        const f = (q.facing * Math.PI) / 180;
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + Math.sin(f) * r * 1.4, sy + Math.cos(f) * r * 1.4);
        g.stroke();
        g.fillStyle = '#fff';
        g.font = `700 ${Math.max(10, r * 0.95)}px Arial`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(q.label, sx, sy - r - 8);
      }
      // defense
      for (const d of P.drill.defense.defenders) {
        const [sx, sy] = toS(d.x, -d.depth);
        const on = P.sel?.kind === 'def' && P.sel.id === d.id;
        const me = d.id === P.drill.defense.athleteId;
        g.strokeStyle = on ? '#fff' : me ? '#22c55e' : '#93c5fd';
        g.lineWidth = on ? 3 : 2;
        g.font = `800 ${Math.max(12, r * 1.2)}px Arial`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = me ? '#22c55e' : '#93c5fd';
        g.fillText(d.label, sx, sy);
        if (me) {
          g.beginPath();
          g.arc(sx, sy, r * 1.25, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // ball
      const [bx, by] = toS(0, 0.1);
      g.fillStyle = '#8b4513';
      g.beginPath();
      g.ellipse(bx, by, 3, 5, 0, 0, Math.PI * 2);
      g.fill();
    };
    raf = requestAnimationFrame(draw);

    const hit = (sx: number, sy: number): Sel => {
      const P = propsRef.current;
      const { toS, scale } = view();
      const r = Math.max(10, scale * 0.5);
      for (const m of P.drill.movements)
        for (let i = 0; i < m.path.length; i++) {
          const [x, y] = toS(m.path[i].x, m.path[i].y);
          if (Math.hypot(x - sx, y - sy) < 8) return { kind: 'wp', moveId: m.id, index: i };
        }
      for (const q of P.drill.players) {
        const [x, y] = toS(q.x, q.y);
        if (Math.hypot(x - sx, y - sy) < r) return { kind: 'off', id: q.id };
      }
      for (const d of P.drill.defense.defenders) {
        const [x, y] = toS(d.x, -d.depth);
        if (Math.hypot(x - sx, y - sy) < r) return { kind: 'def', id: d.id };
      }
      return null;
    };
    const snap = (v: number) => Math.round(v * 4) / 4;
    const pos = (e: PointerEvent) => {
      const b = c.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top] as [number, number];
    };
    const down = (e: PointerEvent) => {
      const P = propsRef.current;
      const [sx, sy] = pos(e);
      if (P.drawing) {
        const f = view().toF(sx, sy);
        if (e.detail >= 2) P.onFinishPath();
        else P.onAddWaypoint({ x: snap(f.x), y: snap(f.y) });
        return;
      }
      const h = hit(sx, sy);
      P.onSelect(h);
      drag.current = h;
      if (h) c.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const P = propsRef.current;
      const [sx, sy] = pos(e);
      const f = view().toF(sx, sy);
      const pt = { x: snap(f.x), y: snap(f.y) };
      if (d.kind === 'off') P.onMovePlayer(d.id, { x: pt.x, y: Math.max(0.25, pt.y) });
      else if (d.kind === 'def') P.onMoveDefender(d.id, { x: pt.x, y: Math.min(-0.25, pt.y) });
      else if (d.kind === 'wp') P.onMoveWaypoint(d.moveId, d.index, pt);
    };
    const up = () => {
      drag.current = null;
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    return () => {
      cancelAnimationFrame(raf);
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
    };
  }, []);

  return <canvas ref={ref} style={{ cursor: p.drawing ? 'crosshair' : 'default' }} />;
}

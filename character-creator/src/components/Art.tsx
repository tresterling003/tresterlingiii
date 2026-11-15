import { useId } from 'react';
import { EMOJI } from '../art/emoji.generated';
import type { Art } from '../data/questions';

/** Bundled illustration (Fluent Emoji, MIT). Falls back to a simple original badge if a name is ever missing. */
export function Emoji({ name, className }: { name: string; className?: string }) {
  const body = EMOJI[name];
  if (!body) {
    return (
      <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
        <circle cx="16" cy="16" r="13" fill="#F5B81C" />
        <path d="M16 7l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z" fill="#0B1F4B" />
      </svg>
    );
  }
  return <svg viewBox="0 0 32 32" className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: body }} />;
}

/* ---------- Toon: a tiny original character drawn from shape, build, and style ---------- */

type Shape = 'circle' | 'square' | 'triangle' | 'mix';
type Build = 'tiny' | 'lanky' | 'broad' | 'bighead' | 'pear' | 'average';
type Style = 'flat' | 'bouncy' | 'anime' | 'cute' | 'angular' | 'storybook';

export interface ToonColors {
  body: string;
  head: string;
  accent: string;
  line: string;
}

const BUILDS: Record<Build, { r: number; bw: number; bh: number; leg: number }> = {
  tiny: { r: 21, bw: 34, bh: 26, leg: 10 },
  lanky: { r: 15, bw: 22, bh: 52, leg: 42 },
  broad: { r: 17, bw: 70, bh: 52, leg: 16 },
  bighead: { r: 34, bw: 26, bh: 22, leg: 10 },
  pear: { r: 15, bw: 64, bh: 54, leg: 10 },
  average: { r: 21, bw: 36, bh: 38, leg: 22 },
};

const STYLE_LOOK: Record<Style, { build: Build; shape: Shape; stroke: number; colors: ToonColors }> = {
  flat: { build: 'average', shape: 'circle', stroke: 4.5, colors: { body: '#1F5FD1', head: '#F5B81C', accent: '#FFFFFF', line: '#0B1F4B' } },
  bouncy: { build: 'average', shape: 'circle', stroke: 3.5, colors: { body: '#0B1F4B', head: '#FFF8E7', accent: '#FFFFFF', line: '#0B1F4B' } },
  anime: { build: 'average', shape: 'circle', stroke: 2.2, colors: { body: '#F2604C', head: '#FFE2C4', accent: '#3A2D7D', line: '#2A2140' } },
  cute: { build: 'bighead', shape: 'circle', stroke: 3.5, colors: { body: '#8EE3C8', head: '#FFD9E6', accent: '#FF8FB3', line: '#3B3558' } },
  angular: { build: 'average', shape: 'triangle', stroke: 2.6, colors: { body: '#3A2D7D', head: '#B9F04A', accent: '#F2604C', line: '#16122B' } },
  storybook: { build: 'average', shape: 'circle', stroke: 2.4, colors: { body: '#9CB58A', head: '#F3D9A4', accent: '#C1502E', line: '#5B4636' } },
};

const DEFAULT_COLORS: ToonColors = { body: '#1F5FD1', head: '#F5B81C', accent: '#FFFFFF', line: '#0B1F4B' };

export function Toon({
  shape,
  build,
  style,
  colors,
  className,
}: {
  shape?: string;
  build?: string;
  style?: string;
  colors?: Partial<ToonColors>;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const st = (style as Style) in STYLE_LOOK ? (style as Style) : undefined;
  const look = st ? STYLE_LOOK[st] : undefined;
  const sh: Shape = (shape as Shape) ?? look?.shape ?? 'circle';
  const bd: Build = (build as Build) in BUILDS ? (build as Build) : look?.build ?? 'average';
  const c = { ...DEFAULT_COLORS, ...look?.colors, ...colors };
  const sw = look?.stroke ?? 3.5;
  const { r, bw, bh, leg } = BUILDS[bd];

  const cx = 60;
  const footY = 152;
  const legTop = footY - leg;
  const bodyBottom = legTop + 3;
  const bodyTop = bodyBottom - bh;
  const headShape: Shape = sh === 'mix' ? 'circle' : sh;
  const bodyShape: Shape = sh === 'mix' ? 'triangle' : sh;
  const footShape: Shape = sh === 'mix' ? 'square' : sh;
  const hcy = bodyTop - r + (headShape === 'triangle' ? 10 : 6);
  const join = sh === 'triangle' || st === 'angular' ? 'miter' : 'round';
  const common = { stroke: c.line, strokeWidth: sw, strokeLinejoin: join, strokeLinecap: 'round' } as const;

  // Body
  let body: JSX.Element;
  if (bd === 'pear') {
    const t = bw * 0.2;
    body =
      bodyShape === 'circle' ? (
        <path d={`M${cx - t} ${bodyTop} Q${cx - bw / 2 - 6} ${bodyBottom} ${cx - bw / 2 + 8} ${bodyBottom} L${cx + bw / 2 - 8} ${bodyBottom} Q${cx + bw / 2 + 6} ${bodyBottom} ${cx + t} ${bodyTop} Z`} fill={c.body} {...common} />
      ) : (
        <polygon points={`${cx - t},${bodyTop} ${cx + t},${bodyTop} ${cx + bw / 2},${bodyBottom} ${cx - bw / 2},${bodyBottom}`} fill={c.body} {...common} />
      );
  } else if (bodyShape === 'triangle') {
    body = <polygon points={`${cx - bw / 2 - 4},${bodyTop} ${cx + bw / 2 + 4},${bodyTop} ${cx + bw * 0.16},${bodyBottom} ${cx - bw * 0.16},${bodyBottom}`} fill={c.body} {...common} />;
  } else {
    body = <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bh} rx={bodyShape === 'square' ? 3 : Math.min(bw, bh) * 0.46} fill={c.body} {...common} />;
  }

  // Head
  let head: JSX.Element;
  if (headShape === 'square') head = <rect x={cx - r} y={hcy - r * 0.9} width={r * 2} height={r * 1.8} rx={4} fill={c.head} {...common} />;
  else if (headShape === 'triangle') head = <polygon points={`${cx - r * 1.15},${hcy - r * 0.8} ${cx + r * 1.15},${hcy - r * 0.8} ${cx},${hcy + r}`} fill={c.head} {...common} />;
  else head = <circle cx={cx} cy={hcy} r={r} fill={c.head} {...common} />;

  // Limbs
  const legX = Math.max(5, bw * (bodyShape === 'triangle' && bd !== 'pear' ? 0.1 : 0.2));
  const foot = (x: number, dir: number) =>
    footShape === 'square' ? (
      <rect x={dir < 0 ? x - 9 : x - 2} y={footY - 5} width={11} height={7} rx={1} fill={c.line} />
    ) : footShape === 'triangle' ? (
      <polygon points={`${x - 2 * dir},${footY - 6} ${x + 10 * dir},${footY + 2} ${x - 2 * dir},${footY + 2}`} fill={c.line} />
    ) : (
      <ellipse cx={x + 3 * dir} cy={footY} rx={7} ry={4} fill={c.line} />
    );
  const shoulderY = bodyTop + Math.min(12, bh * 0.28);
  const shoulderX = bd === 'pear' ? bw * 0.24 : bw / 2;
  const armLen = Math.min(30, bh * 0.55 + 6);
  const arm = (dir: number) => {
    const x0 = cx + shoulderX * dir;
    const x1 = x0 + (st === 'bouncy' ? 16 : 10) * dir;
    const y1 = shoulderY + armLen;
    return (
      <g key={dir}>
        {st === 'bouncy' ? (
          <path d={`M${x0} ${shoulderY} Q${x0 + 20 * dir} ${shoulderY - 6} ${x1} ${y1 - 8}`} fill="none" {...common} />
        ) : (
          <line x1={x0} y1={shoulderY} x2={x1} y2={y1} {...common} />
        )}
        {st === 'bouncy' && <circle cx={x1} cy={y1 - 6} r={5.5} fill="#fff" {...common} strokeWidth={2.5} />}
      </g>
    );
  };

  // Face
  const ey = headShape === 'triangle' ? hcy - r * 0.32 : hcy - r * 0.05;
  const ex = r * (st === 'cute' ? 0.46 : 0.38);
  const es = Math.max(2, r * 0.12);
  const eye = (dir: number) => {
    const x = cx + ex * dir;
    if (st === 'bouncy') return <ellipse key={dir} cx={x} cy={ey - 1} rx={es * 1.1} ry={es * 2.4} fill={c.line} />;
    if (st === 'anime')
      return (
        <g key={dir}>
          <ellipse cx={x} cy={ey + 1} rx={es * 1.8} ry={es * 2.3} fill={c.accent} stroke={c.line} strokeWidth={1.4} />
          <circle cx={x - es * 0.6} cy={ey - es * 0.4} r={es * 0.75} fill="#fff" />
        </g>
      );
    if (st === 'angular') return <line key={dir} x1={x - es * 1.8} y1={ey - es * 1.2 * dir * -1 - 1} x2={x + es * 1.8} y2={ey + es * 1.2 * dir * -1 - 1} stroke={c.line} strokeWidth={2.6} strokeLinecap="square" />;
    return <circle key={dir} cx={x} cy={ey} r={es} fill={c.line} />;
  };
  const my = ey + r * 0.36;
  const mw = r * (st === 'bouncy' ? 0.5 : 0.26);
  const mouth =
    st === 'angular' ? (
      <path d={`M${cx - mw} ${my + 1} L${cx + mw} ${my - 2}`} fill="none" stroke={c.line} strokeWidth={2} strokeLinecap="round" />
    ) : (
      <path d={`M${cx - mw} ${my} Q${cx} ${my + mw * 1.3} ${cx + mw} ${my}`} fill="none" stroke={c.line} strokeWidth={Math.min(sw, 2.6)} strokeLinecap="round" />
    );

  const wobble = st === 'storybook';
  return (
    <svg viewBox="0 0 120 162" className={className} aria-hidden="true">
      {wobble && (
        <filter id={`w${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" />
        </filter>
      )}
      <ellipse cx={cx} cy={footY + 3} rx={Math.max(22, bw * 0.6)} ry={4} fill={c.line} opacity={0.12} />
      <g filter={wobble ? `url(#w${uid})` : undefined}>
        <line x1={cx - legX} y1={legTop} x2={cx - legX} y2={footY} {...common} />
        <line x1={cx + legX} y1={legTop} x2={cx + legX} y2={footY} {...common} />
        {foot(cx - legX, -1)}
        {foot(cx + legX, 1)}
        {arm(-1)}
        {arm(1)}
        {body}
        {wobble && [0.3, 0.5, 0.7].map((t) => <line key={t} x1={cx - bw * 0.25} y1={bodyTop + bh * t} x2={cx + bw * 0.2} y2={bodyTop + bh * t + 5} stroke={c.line} strokeWidth={1} opacity={0.5} />)}
        {head}
        {st === 'anime' && (
          <polygon
            points={`${cx - r - 3},${hcy - 1} ${cx - r * 0.9},${hcy - r - 8} ${cx - r * 0.35},${hcy - r * 0.62} ${cx - r * 0.1},${hcy - r - 13} ${cx + r * 0.35},${hcy - r * 0.62} ${cx + r * 0.8},${hcy - r - 9} ${cx + r + 3},${hcy - 1} ${cx + r * 0.5},${hcy - r * 0.45} ${cx},${hcy - r * 0.3} ${cx - r * 0.5},${hcy - r * 0.45}`}
            fill={c.accent}
            {...common}
            strokeLinejoin="miter"
          />
        )}
        {sh === 'mix' && <polygon points={`${cx - 7},${hcy - r + 2} ${cx + 2},${hcy - r - 14} ${cx + 9},${hcy - r + 2}`} fill={c.accent} {...common} strokeLinejoin="miter" />}
        {st === 'cute' && [-1, 1].map((d) => <circle key={d} cx={cx + r * 0.62 * d} cy={ey + r * 0.24} r={r * 0.13} fill={c.accent} opacity={0.75} />)}
        {eye(-1)}
        {eye(1)}
        {mouth}
      </g>
    </svg>
  );
}

export function Swatch({ colors, className }: { colors: string[]; className?: string }) {
  return (
    <span className={`swatch ${className ?? ''}`} aria-hidden="true">
      {colors.map((col) => (
        <span key={col} style={{ background: col }} />
      ))}
    </span>
  );
}

export function ArtView({ art, className }: { art: Art; className?: string }) {
  if (art.kind === 'emoji') return <Emoji name={art.name} className={className} />;
  if (art.kind === 'toon') return <Toon {...art} className={className} />;
  return <Swatch colors={art.colors} className={className} />;
}

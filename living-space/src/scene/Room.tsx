import { O, SW, P } from "./palette";
import { WORLD } from "./layout";
import type { RoomTheme } from "./theme";

const stroke = { stroke: O, strokeWidth: SW, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Back wall, floor, rug and wall décor. Static — rendered once per theme change. */
export function RoomShell({ theme }: { theme: RoomTheme }) {
  const W = WORLD.w;
  const wb = WORLD.wallBottom;
  // Floor boards converge slightly toward the back wall for depth.
  const boards = [] as JSX.Element[];
  for (let i = -8; i <= 22; i++) {
    const xb = i * 96;
    const xt = 800 + (xb - 800) * 0.72;
    boards.push(<line key={`b${i}`} x1={xt} y1={wb + 4} x2={800 + (xb - 800) * 1.6} y2={WORLD.h + 360} stroke={theme.floorShade} strokeWidth={3} />);
  }
  const joints = [] as JSX.Element[];
  for (let r = 0; r < 9; r++) {
    const y = wb + 30 + r * r * 9 + r * 26;
    for (let k = 0; k < 6; k++) {
      const x = ((r * 173 + k * 331) % 1700) - 40;
      joints.push(<line key={`j${r}-${k}`} x1={x} y1={y} x2={x + 6} y2={y + 14 + r * 2} stroke={theme.floorShade} strokeWidth={2.5} />);
    }
  }
  return (
    <g>
      <defs>
        <pattern id="wallpaper" width="56" height="56" patternUnits="userSpaceOnUse">
          <rect width="56" height="56" fill={theme.wallpaper} />
          <rect x="0" width="12" height="56" fill={theme.wallpaperStripe} />
          <circle cx="34" cy="16" r="2.6" fill={theme.wallpaperStripe} />
          <circle cx="34" cy="44" r="2.6" fill={theme.wallpaperStripe} />
        </pattern>
        <linearGradient id="wallShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2a20" stopOpacity="0.22" />
          <stop offset="0.35" stopColor="#3b2a20" stopOpacity="0" />
          <stop offset="1" stopColor="#3b2a20" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="floorShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2a20" stopOpacity="0.28" />
          <stop offset="0.12" stopColor="#3b2a20" stopOpacity="0.05" />
          <stop offset="1" stopColor="#3b2a20" stopOpacity="0.18" />
        </linearGradient>
        <radialGradient id="softShadow">
          <stop offset="0" stopColor="#2a1a10" stopOpacity="0.35" />
          <stop offset="1" stopColor="#2a1a10" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Wall with generous bleed so any aspect ratio is filled edge-to-edge. */}
      <rect x={-1200} y={-900} width={W + 2400} height={wb + 900} fill="url(#wallpaper)" />
      <rect x={-1200} y={-900} width={W + 2400} height={wb + 900} fill="url(#wallShade)" />
      {/* Crown moulding */}
      <rect x={-1200} y={-900} width={W + 2400} height={928} fill="#F4E9D6" />
      <rect x={-1200} y={24} width={W + 2400} height={10} fill="#D8C4A4" />
      <line x1={-1200} y1={34} x2={W + 1200} y2={34} stroke={O} strokeWidth={2} opacity={0.5} />

      {/* Wainscot panels */}
      <rect x={-1200} y={470} width={W + 2400} height={wb - 470} fill={theme.wainscot} />
      <rect x={-1200} y={462} width={W + 2400} height={12} fill="#F4E9D6" />
      <line x1={-1200} y1={474} x2={W + 1200} y2={474} stroke={O} strokeWidth={2} opacity={0.6} />
      {Array.from({ length: 26 }, (_, i) => -1180 + i * 150).map((x) => (
        <rect key={x} x={x} y={492} width={124} height={86} rx={6} fill="none" stroke={theme.wainscotShade} strokeWidth={4} />
      ))}

      {/* Floor */}
      <rect x={-1200} y={wb} width={W + 2400} height={1200} fill={theme.floor} />
      {boards}
      {joints}
      <rect x={-1200} y={wb} width={W + 2400} height={1200} fill="url(#floorShade)" />
      {/* Baseboard */}
      <rect x={-1200} y={wb - 18} width={W + 2400} height={22} fill="#F4E9D6" />
      <line x1={-1200} y1={wb + 4} x2={W + 1200} y2={wb + 4} stroke={O} strokeWidth={SW} />
      <line x1={-1200} y1={wb - 18} x2={W + 1200} y2={wb - 18} stroke={O} strokeWidth={2} opacity={0.5} />

      {/* Rug */}
      <ellipse cx={760} cy={800} rx={330} ry={74} fill="url(#softShadow)" opacity={0.6} />
      <ellipse cx={760} cy={792} rx={318} ry={68} fill={theme.rug} {...stroke} />
      <ellipse cx={760} cy={792} rx={276} ry={52} fill="none" stroke={theme.rugTrim} strokeWidth={6} strokeDasharray="2 14" />
      <ellipse cx={760} cy={792} rx={232} ry={40} fill="none" stroke={theme.rugTrim} strokeWidth={4} />
      <ellipse cx={760} cy={792} rx={120} ry={18} fill={theme.rugTrim} opacity={0.35} />

      {/* Wall clock (above the desk) */}
      <WallClockFace />

      {/* Small shelf under the clock */}
      <g>
        <ellipse cx={1525} cy={310} rx={60} ry={8} fill="#2a1a10" opacity={0.12} />
        {[
          [1482, 40, P.teal], [1506, 46, P.tomato], [1530, 34, P.honey],
        ].map(([x, h, c], i) => (
          <rect key={i} x={x as number} y={298 - (h as number)} width={21} height={h as number} fill={c as string} {...stroke} />
        ))}
        <path d="M1554 298 q6 -36 18 -36 q12 0 18 36 Z" fill={P.pot} {...stroke} />
        <path d="M1572 262 q-12 -22 -4 -36 M1572 262 q8 -24 20 -26 M1572 262 q2 -30 -2 -40" fill="none" stroke={P.leafDark} strokeWidth={6} strokeLinecap="round" />
        <rect x={1473} y={298} width={126} height={15} fill={P.woodHi} {...stroke} />
        <path d="M1491 313 l9 18 h8 l-2 -18 M1581 313 l-9 18 h-8 l2 -18" fill={P.wood} {...stroke} />
      </g>

      {/* Corkboard for today's planner sheet */}
      <Cork x={888} y={132} w={378} h={330} />
      {/* Little corkboard for sticky notes, above the desk */}
      <Cork x={1275} y={93} w={192} h={213} />
    </g>
  );
}

function Cork({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x + 6} y={y + 9} width={w} height={h} fill="#2a1a10" opacity={0.15} />
      <rect x={x} y={y} width={w} height={h} fill={P.woodHi} {...stroke} />
      <rect x={x + 12} y={y + 12} width={w - 24} height={h - 24} fill={P.cork} stroke={O} strokeWidth={3} />
      {Array.from({ length: Math.round((w * h) / 2200) }, (_, i) => (
        <rect key={i} x={x + 18 + ((i * 97) % (w - 36))} y={y + 18 + ((i * 53) % (h - 36))} width={3} height={3} fill={P.corkDark} />
      ))}
    </g>
  );
}

function WallClockFace() {
  return (
    <g transform="translate(1510 162)">
      <circle r={40} fill={P.woodHi} {...stroke} />
      <circle r={32} fill={P.paper} stroke={O} strokeWidth={2} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={Math.sin(a) * 26} y1={-Math.cos(a) * 26} x2={Math.sin(a) * (i % 3 ? 28 : 30)} y2={-Math.cos(a) * (i % 3 ? 28 : 30)} stroke={O} strokeWidth={i % 3 ? 1.5 : 3} />;
      })}
    </g>
  );
}

/** Clock hands are separate so only they update each minute. */
export function WallClockHands({ minutes }: { minutes: number }) {
  const h = ((minutes / 60) % 12) * 30;
  const m = (minutes % 60) * 6;
  return (
    <g transform="translate(1510 162)">
      <line x1={0} y1={0} x2={0} y2={-15} stroke={O} strokeWidth={5} strokeLinecap="round" transform={`rotate(${h})`} />
      <line x1={0} y1={0} x2={0} y2={-24} stroke={O} strokeWidth={3} strokeLinecap="round" transform={`rotate(${m})`} />
      <circle r={3.5} fill={P.tomato} stroke={O} strokeWidth={1.5} />
    </g>
  );
}

/** String of warm bulbs along the top of the wall; they glow in the evening. */
export function FairyLights({ glow }: { glow: number }) {
  const pts = Array.from({ length: 23 }, (_, i) => {
    const x = 20 + i * 70;
    const y = 56 + Math.sin((i / 22) * Math.PI * 6) * 6 + 10 * Math.sin((i % 6) / 5 * Math.PI);
    return { x, y };
  });
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y - 6}`).join(" ");
  const colors = [P.honey, P.tomato, "#F2D785", P.glow];
  return (
    <g>
      <path d={d} fill="none" stroke={O} strokeWidth={3} />
      {pts.map((p, i) => (
        <g key={i}>
          <ellipse cx={p.x} cy={p.y + 3} rx={5} ry={7} fill={colors[i % 4]} stroke={O} strokeWidth={1.5} style={{ opacity: 0.55 + glow * 0.45 }} />
        </g>
      ))}
    </g>
  );
}

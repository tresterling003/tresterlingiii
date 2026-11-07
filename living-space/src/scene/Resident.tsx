import { O, P } from "./palette";
import type { ResidentView, Pose } from "@/engine/character";

/** Sprite bounds around the feet (0,0), aligned to the pixel grid. */
export const RESIDENT_RECT = { x: -84, y: -165, w: 168, h: 186 };

export interface ResidentFrame {
  pose: Pose;
  expression: ResidentView["expression"];
  bubble: ResidentView["bubble"];
  facing: 1 | -1;
  gaze: number; // -1 | 0 | 1 buckets
  f: number; // animation frame
  blink: boolean;
}

/** Frames per pose cycle (animated at 8 fps, like a handheld game). */
export const POSE_FRAMES: Record<Pose, number> = { stand: 8, walk: 4, sit: 8, sleep: 8, "look-up": 8, play: 6, react: 4, inspect: 8, hop: 4 };

function bodyTransform(pose: Pose, f: number): string {
  switch (pose) {
    case "stand":
      return f < 4 ? "" : "translate(0 3)";
    case "walk":
      return `translate(0 ${[0, -6, -9, -6][f % 4]}) rotate(${[-3, 0, 3, 0][f % 4]})`;
    case "sit":
      return `scale(1.06 ${f < 4 ? 0.9 : 0.88})`;
    case "sleep":
      return `translate(0 6) scale(${f < 4 ? 1.14 : 1.17} ${f < 4 ? 0.78 : 0.75})`;
    case "look-up":
      return "rotate(-4)";
    case "inspect":
      return f < 4 ? "rotate(7) translate(3 0)" : "rotate(9) translate(4 0)";
    case "react":
      return `translate(0 ${[0, -15, -21, -9][f % 4]})`;
    case "hop":
      return `translate(0 ${[0, -21, -27, -12][f % 4]}) scale(${[1.08, 0.95, 0.94, 1][f % 4]} ${[0.92, 1.06, 1.06, 1][f % 4]})`;
    case "play":
      return `translate(0 ${[0, -3, -6, -3, 0, 0][f % 6]})`;
  }
}

/** Pip — an original round "sproutling". Pure SVG; animated by frame index, not CSS. */
export function ResidentArt({ frame, body, belly, sprout }: { frame: ResidentFrame; body: string; belly: string; sprout: string }) {
  const { pose, expression, bubble, facing, gaze, f, blink } = frame;
  const ex = gaze * 4;
  const ey = pose === "look-up" ? -5 : pose === "inspect" ? 3 : 0;
  const footL = pose === "walk" ? [[-6, 0], [0, -4], [6, 0], [0, 0]][f % 4] : [0, 0];
  const footR = pose === "walk" ? [[6, 0], [0, 0], [-6, 0], [0, -4]][f % 4] : [0, 0];
  const sproutTilt = pose === "sleep" ? -30 : [-6, -3, 0, 3, 6, 3, 0, -3][f % 8];
  const eyes = blink && expression !== "sleepy" && expression !== "happy" ? "sleepy" : expression;
  return (
    <g>
      <ellipse cx={0} cy={2} rx={40} ry={9} fill="#2a1a10" opacity={0.28} />
      <g transform={`scale(${facing} 1)`}>
        <g transform={bodyTransform(pose, f)}>
          <ellipse cx={-18 + footL[0]} cy={-4 + footL[1]} rx={13} ry={8} fill={body} stroke={O} strokeWidth={3} />
          <ellipse cx={18 + footR[0]} cy={-4 + footR[1]} rx={13} ry={8} fill={body} stroke={O} strokeWidth={3} />
          <g transform={`rotate(${sproutTilt} 0 -84)`}>
            <path d="M0 -84 C 0 -96 2 -104 6 -110" fill="none" stroke={O} strokeWidth={7} strokeLinecap="round" />
            <path d="M0 -84 C 0 -96 2 -104 6 -110" fill="none" stroke={sprout} strokeWidth={3} strokeLinecap="round" />
            <path d="M6 -110 C 14 -124 32 -122 34 -112 C 26 -104 14 -104 6 -110 Z" fill={sprout} stroke={O} strokeWidth={3} strokeLinejoin="round" />
            <path d="M4 -104 C -6 -118 -22 -116 -24 -106 C -16 -98 -4 -100 4 -104 Z" fill={sprout} stroke={O} strokeWidth={3} strokeLinejoin="round" />
          </g>
          <path d="M-44 -26 C -46 -64 -26 -88 0 -88 C 26 -88 46 -64 44 -26 C 43 -8 28 -2 0 -2 C -28 -2 -43 -8 -44 -26 Z" fill={body} stroke={O} strokeWidth={3.5} strokeLinejoin="round" />
          <ellipse cx={0} cy={-24} rx={26} ry={18} fill={belly} />
          <path d={pose === "react" || pose === "hop" ? "M-42 -40 q-14 -10 -12 -24" : "M-42 -38 q-12 6 -10 18"} fill="none" stroke={O} strokeWidth={4} strokeLinecap="round" />
          <path d={pose === "react" || pose === "hop" ? "M42 -40 q14 -10 12 -24" : "M42 -38 q12 6 10 18"} fill="none" stroke={O} strokeWidth={4} strokeLinecap="round" />
          <g transform={`translate(${ex} ${ey})`}>
            <rect x={-31} y={-44} width={12} height={6} fill="#F2A99A" />
            <rect x={19} y={-44} width={12} height={6} fill="#F2A99A" />
            <Eyes expression={eyes} />
            <Mouth expression={expression} />
          </g>
        </g>
      </g>
      {pose === "play" && (
        <g transform={`translate(${46 * facing} ${[-22, -40, -55, -62, -55, -40][f % 6]})`}>
          <circle r={13} fill={P.honey} stroke={O} strokeWidth={3} />
          <path d="M-13 0 q13 -8 26 0" fill="none" stroke={P.tomato} strokeWidth={3} />
        </g>
      )}
      {bubble !== "none" && <Bubble kind={bubble} f={f} />}
    </g>
  );
}

function Eyes({ expression }: { expression: ResidentView["expression"] }) {
  if (expression === "sleepy")
    return (
      <g fill={O}>
        <rect x={-21} y={-52} width={13} height={4} />
        <rect x={8} y={-52} width={13} height={4} />
      </g>
    );
  if (expression === "happy")
    return (
      <g stroke={O} strokeWidth={4} strokeLinecap="square" fill="none">
        <path d="M-20 -50 l6 -6 l6 6" />
        <path d="M8 -50 l6 -6 l6 6" />
      </g>
    );
  const big = expression === "surprised";
  return (
    <g>
      {[-14, 14].map((x) => (
        <g key={x}>
          <rect x={x - (big ? 6 : 5)} y={big ? -61 : -59} width={big ? 12 : 10} height={big ? 16 : 13} fill={O} />
          <rect x={x} y={big ? -58 : -57} width={4} height={4} fill="#fff" />
        </g>
      ))}
      {expression === "curious" && <rect x={6} y={-69} width={15} height={4} fill={O} />}
    </g>
  );
}

function Mouth({ expression }: { expression: ResidentView["expression"] }) {
  if (expression === "surprised") return <rect x={-4} y={-41} width={8} height={9} fill={O} />;
  if (expression === "sleepy") return <rect x={-4} y={-37} width={8} height={3} fill={O} />;
  if (expression === "happy") return <path d="M-8 -40 h16 l-3 6 h-10 Z" fill="#B8513B" stroke={O} strokeWidth={3} strokeLinejoin="round" />;
  return <path d="M-6 -39 v3 h12 v-3" fill="none" stroke={O} strokeWidth={3} />;
}

function Bubble({ kind, f }: { kind: Exclude<ResidentView["bubble"], "none">; f: number }) {
  if (kind === "zzz") {
    const up = f % 8 < 4 ? 0 : -6;
    return (
      <g fill={O} transform={`translate(0 ${up})`}>
        {/* Pixel "z" glyphs */}
        <path d="M34 -108 h15 v4 l-9 9 h9 v4 h-15 v-4 l9 -9 h-9 Z" />
        <path d="M54 -126 h11 v3 l-6 7 h6 v3 h-11 v-3 l6 -7 h-6 Z" opacity={0.8} />
        <path d="M68 -140 h8 v3 l-4 4 h4 v3 h-8 v-3 l4 -4 h-4 Z" opacity={0.6} />
      </g>
    );
  }
  return (
    <g transform="translate(40 -132)">
      <path d="M-24 -21 h48 v39 h-27 l-12 12 v-12 h-9 Z" fill={P.paper} stroke={O} strokeWidth={3} strokeLinejoin="miter" />
      {kind === "exclaim" && (
        <g fill={P.tomato}>
          <rect x={-3} y={-14} width={7} height={18} />
          <rect x={-3} y={7} width={7} height={6} />
        </g>
      )}
      {kind === "question" && <path d="M-7 -12 h13 v4 h3 v7 h-3 v3 h-6 v4 h-5 v-6 h3 v-3 h3 v-5 h-7 v3 h-5 v-4 h4 Z M-2 9 h5 v5 h-5 Z" fill={P.teal} />}
      {kind === "heart" && <path d="M-12 -9 h8 v3 h8 v-3 h8 v3 h3 v9 h-3 v4 h-4 v3 h-4 v3 h-8 v-3 h-4 v-3 h-4 v-4 h-3 v-9 h3 Z" fill={P.tomato} />}
      {kind === "note" && (
        <g>
          <rect x={-12} y={-12} width={24} height={18} fill={P.glow} stroke={O} strokeWidth={3} />
          <rect x={-6} y={9} width={12} height={4} fill={O} />
        </g>
      )}
    </g>
  );
}

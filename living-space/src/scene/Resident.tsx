"use client";
import { memo } from "react";
import { O, P } from "./palette";
import type { ResidentView } from "@/engine/character";

interface Props {
  view: Pick<ResidentView, "pose" | "expression" | "bubble" | "gaze" | "facing">;
  body: string;
  belly: string;
  sprout: string;
}

/**
 * The resident: an original round "sproutling". Drawn around its feet at (0,0).
 * Poses are CSS classes on the root so transitions are smooth and cheap.
 */
export const ResidentSprite = memo(function ResidentSprite({ view, body, belly, sprout }: Props) {
  const { pose, expression, bubble, gaze, facing } = view;
  const ex = gaze * 4 * facing;
  const ey = pose === "look-up" ? -5 : pose === "inspect" ? 3 : 0;
  return (
    <svg className={`resident pose-${pose}`} width={160} height={180} viewBox="-80 -150 160 180" overflow="visible" aria-hidden>
      <ellipse className="r-shadow" cx={0} cy={2} rx={40} ry={9} fill="#2a1a10" opacity={0.25} />
      <g className="r-flip" style={{ transform: `scaleX(${facing})` }}>
        <g className="r-body">
          {/* Feet */}
          <ellipse className="r-foot r-foot-l" cx={-18} cy={-4} rx={13} ry={8} fill={body} stroke={O} strokeWidth={3} />
          <ellipse className="r-foot r-foot-r" cx={18} cy={-4} rx={13} ry={8} fill={body} stroke={O} strokeWidth={3} />
          {/* Sprout */}
          <g className="r-sprout">
            <path d="M0 -84 C 0 -96 2 -104 6 -110" fill="none" stroke={O} strokeWidth={6} strokeLinecap="round" />
            <path d="M0 -84 C 0 -96 2 -104 6 -110" fill="none" stroke={sprout} strokeWidth={3} strokeLinecap="round" />
            <path d="M6 -110 C 14 -124 32 -122 34 -112 C 26 -104 14 -104 6 -110 Z" fill={sprout} stroke={O} strokeWidth={2.5} strokeLinejoin="round" />
            <path d="M4 -104 C -6 -118 -22 -116 -24 -106 C -16 -98 -4 -100 4 -104 Z" fill={sprout} stroke={O} strokeWidth={2.5} strokeLinejoin="round" />
          </g>
          {/* Body */}
          <path d="M-44 -26 C -46 -64 -26 -88 0 -88 C 26 -88 46 -64 44 -26 C 43 -8 28 -2 0 -2 C -28 -2 -43 -8 -44 -26 Z" fill={body} stroke={O} strokeWidth={3.2} strokeLinejoin="round" />
          <ellipse cx={0} cy={-24} rx={26} ry={18} fill={belly} />
          {/* Arms */}
          <path className="r-arm r-arm-l" d="M-42 -38 q-12 6 -10 18" fill="none" stroke={O} strokeWidth={3} strokeLinecap="round" />
          <path className="r-arm r-arm-r" d="M42 -38 q12 6 10 18" fill="none" stroke={O} strokeWidth={3} strokeLinecap="round" />
          {/* Face */}
          <g className="r-face" style={{ transform: `translate(${ex}px, ${ey}px)` }}>
            <ellipse cx={-24} cy={-40} rx={7} ry={4.5} fill="#F2A99A" opacity={0.75} />
            <ellipse cx={24} cy={-40} rx={7} ry={4.5} fill="#F2A99A" opacity={0.75} />
            <Eyes expression={expression} />
            <Mouth expression={expression} />
          </g>
        </g>
      </g>
      {pose === "play" && (
        <g className="r-ball">
          <circle cx={46} cy={-22} r={13} fill={P.honey} stroke={O} strokeWidth={2.6} />
          <path d="M33 -22 q13 -8 26 0" fill="none" stroke={P.tomato} strokeWidth={2.5} />
        </g>
      )}
      {bubble !== "none" && <Bubble kind={bubble} />}
    </svg>
  );
});

function Eyes({ expression }: { expression: Props["view"]["expression"] }) {
  if (expression === "sleepy")
    return (
      <g stroke={O} strokeWidth={3} strokeLinecap="round" fill="none">
        <path d="M-20 -52 q6 5 12 0" />
        <path d="M8 -52 q6 5 12 0" />
      </g>
    );
  if (expression === "happy")
    return (
      <g stroke={O} strokeWidth={3.4} strokeLinecap="round" fill="none">
        <path d="M-20 -50 q6 -9 12 0" />
        <path d="M8 -50 q6 -9 12 0" />
      </g>
    );
  const r = expression === "surprised" ? 7.5 : 6;
  return (
    <g className="r-eyes">
      {[-14, 14].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={-52} rx={r * 0.85} ry={r} fill={O} />
          <circle cx={x + 2} cy={-55} r={2.2} fill="#fff" />
        </g>
      ))}
      {expression === "curious" && <path d="M6 -66 q8 -4 16 0" stroke={O} strokeWidth={2.5} fill="none" strokeLinecap="round" />}
    </g>
  );
}

function Mouth({ expression }: { expression: Props["view"]["expression"] }) {
  if (expression === "surprised") return <ellipse cx={0} cy={-36} rx={4} ry={5} fill={O} />;
  if (expression === "sleepy") return <path d="M-3 -36 q3 2 6 0" stroke={O} strokeWidth={2.5} fill="none" strokeLinecap="round" />;
  if (expression === "happy") return <path d="M-7 -39 q7 9 14 0 Z" fill="#B8513B" stroke={O} strokeWidth={2.2} strokeLinejoin="round" />;
  return <path d="M-5 -38 q5 5 10 0" stroke={O} strokeWidth={2.5} fill="none" strokeLinecap="round" />;
}

function Bubble({ kind }: { kind: Exclude<Props["view"]["bubble"], "none"> }) {
  if (kind === "zzz")
    return (
      <g className="r-zzz" fontFamily="Fredoka, sans-serif" fill={O} fontWeight={600}>
        <text x={34} y={-96} fontSize={18}>z</text>
        <text x={48} y={-114} fontSize={14} opacity={0.8}>z</text>
        <text x={58} y={-128} fontSize={11} opacity={0.6}>z</text>
      </g>
    );
  return (
    <g className="r-bubble" transform="translate(40 -128)">
      <path d="M-22 -20 h44 a10 10 0 0 1 10 10 v20 a10 10 0 0 1 -10 10 h-26 l-10 10 l0 -10 h-8 a10 10 0 0 1 -10 -10 v-20 a10 10 0 0 1 10 -10 Z" fill={P.paper} stroke={O} strokeWidth={2.6} strokeLinejoin="round" />
      {kind === "exclaim" && (
        <g fill={P.tomato}>
          <rect x={-3} y={-14} width={6} height={16} rx={3} />
          <circle cx={0} cy={9} r={3.4} />
        </g>
      )}
      {kind === "question" && <text x={0} y={8} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize={22} fontWeight={600} fill={P.teal}>?</text>}
      {kind === "heart" && <path d="M0 10 C -14 0 -14 -12 -6 -13 C -2 -13 0 -10 0 -8 C 0 -10 2 -13 6 -13 C 14 -12 14 0 0 10 Z" fill={P.tomato} stroke={O} strokeWidth={2} />}
      {kind === "note" && (
        <g>
          <rect x={-12} y={-11} width={24} height={18} rx={3} fill={P.glow} stroke={O} strokeWidth={2} />
          <path d="M-6 11 h12" stroke={O} strokeWidth={2.5} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

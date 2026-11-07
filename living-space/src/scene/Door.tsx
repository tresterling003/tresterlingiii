"use client";
import { memo } from "react";
import { O, SW, P } from "./palette";
import { envelopeCount, pileTier } from "@/domain/mail";

const stroke = { stroke: O, strokeWidth: SW, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

export const FrontDoor = memo(function FrontDoor({ flapAt }: { flapAt: number }) {
  return (
    <g className="obj obj-door">
      {/* Frame */}
      <rect x={70} y={172} width={234} height={436} rx={6} fill={P.paper} {...stroke} />
      <rect x={90} y={190} width={194} height={414} rx={3} fill={P.wood} {...stroke} />
      {/* Panels */}
      <rect x={112} y={300} width={66} height={110} rx={6} fill={P.woodHi} stroke={O} strokeWidth={2} />
      <rect x={196} y={300} width={66} height={110} rx={6} fill={P.woodHi} stroke={O} strokeWidth={2} />
      <rect x={112} y={470} width={66} height={110} rx={6} fill={P.woodHi} stroke={O} strokeWidth={2} />
      <rect x={196} y={470} width={66} height={110} rx={6} fill={P.woodHi} stroke={O} strokeWidth={2} />
      {/* Half-moon window */}
      <path d="M128 280 v-30 a59 46 0 0 1 118 0 v30 Z" fill="#F3D99A" stroke={O} strokeWidth={2.5} className="door-glass" />
      <path d="M187 280 v-76 M128 252 h118" stroke={O} strokeWidth={2} />
      {/* Knob */}
      <circle cx={262} cy={444} r={9} fill={P.brass} {...stroke} />
      <rect x={256} y={456} width={12} height={22} rx={3} fill={P.brass} stroke={O} strokeWidth={2} />
      {/* Mail slot */}
      <rect x={140} y={426} width={96} height={26} rx={5} fill={P.brass} {...stroke} />
      <rect x={148} y={434} width={80} height={10} rx={3} fill={P.woodDark} />
      <g key={flapAt} className={flapAt ? "flap" : ""} style={{ transformOrigin: "188px 434px" }}>
        <rect x={146} y={432} width={84} height={8} rx={3} fill="#E8B955" stroke={O} strokeWidth={1.5} />
      </g>
      <text x={188} y={470} textAnchor="middle" fontFamily="Fredoka, sans-serif" fontSize={11} fill={P.paper} opacity={0.75} letterSpacing={2}>
        MAIL
      </text>
      {/* Doormat */}
      <path d="M86 618 h204 l18 40 h-240 Z" fill="#B8823F" {...stroke} />
      <path d="M100 628 h176 l10 22 h-196 Z" fill="none" stroke="#8C5E2C" strokeWidth={3} strokeDasharray="6 6" />
      {/* Coat hook with scarf */}
      <rect x={30} y={250} width={30} height={12} rx={3} fill={P.woodHi} {...stroke} />
      <path d="M44 262 q-8 40 2 90 l14 -2 q-6 -48 4 -88 Z" fill={P.teal} {...stroke} />
      <path d="M46 344 l-4 14 M52 346 l0 14 M58 344 l4 14" stroke={O} strokeWidth={2} />
    </g>
  );
});

/** Deterministic pile layout so envelopes don't jump around between renders. */
function envelopeSlots(n: number) {
  const out: { x: number; y: number; r: number; c: string }[] = [];
  const colors = [P.paper, "#F2E2C4", "#E8EEF5", P.paper, "#F7DCCF"];
  for (let i = 0; i < n; i++) {
    const layer = Math.floor(i / 6);
    const k = i % 6;
    const spread = Math.max(40, 110 - layer * 16);
    out.push({
      x: 230 + Math.sin(i * 2.1) * spread * 0.9 + (k - 2.5) * 6,
      y: 676 - layer * 9 + Math.cos(i * 1.7) * 10 - (layer > 1 ? layer * 2 : 0),
      r: Math.sin(i * 3.3) * 28,
      c: colors[i % colors.length],
    });
  }
  return out;
}

function Envelope({ x, y, r, c, stamp }: { x: number; y: number; r: number; c: string; stamp: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) skewX(-8) scale(1 0.62)`}>
      <rect x={-22} y={-15} width={44} height={30} rx={3} fill={c} stroke={O} strokeWidth={2.4} />
      <path d="M-22 -15 L0 3 L22 -15" fill="none" stroke={O} strokeWidth={2} />
      <rect x={10} y={-11} width={8} height={9} fill={stamp} stroke={O} strokeWidth={1} />
    </g>
  );
}

export const MailPile = memo(function MailPile({ unread }: { unread: number }) {
  const tier = pileTier(unread);
  const slots = envelopeSlots(envelopeCount(unread));
  const stamps = [P.tomato, P.teal, P.honey];
  return (
    <g className="obj obj-mail" data-tier={tier}>
      {tier > 0 && <ellipse cx={232} cy={688} rx={tier === 3 ? 130 : tier === 2 ? 100 : 70} ry={16} fill="#2a1a10" opacity={0.18} />}
      {slots.map((s, i) => (
        <Envelope key={i} {...s} stamp={stamps[i % 3]} />
      ))}
      {tier === 3 && (
        // Overflowing: a parcel tag and a rubber-banded bundle make the pile read as "a lot", not a disaster.
        <g transform="translate(296 664) rotate(-8)">
          <rect x={-24} y={-18} width={48} height={32} rx={4} fill="#D8B27E" stroke={O} strokeWidth={2.4} />
          <path d="M-24 -4 h48 M0 -18 v32" stroke={P.tomato} strokeWidth={4} />
        </g>
      )}
    </g>
  );
});

/** One-shot animation of letters dropping through the slot onto the pile. */
export function MailDelivery({ at, count }: { at: number; count: number }) {
  if (!at || Date.now() - at > 4000) return null;
  const n = Math.min(3, Math.max(1, count));
  return (
    <g key={at}>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} className="mail-drop" style={{ animationDelay: `${i * 260}ms` }}>
          <g transform="translate(188 440)">
            <rect x={-20} y={-13} width={40} height={26} rx={3} fill={P.paper} stroke={O} strokeWidth={2.4} />
            <path d="M-20 -13 L0 2 L20 -13" fill="none" stroke={O} strokeWidth={2} />
            <rect x={9} y={-9} width={7} height={8} fill={P.tomato} />
          </g>
        </g>
      ))}
    </g>
  );
}

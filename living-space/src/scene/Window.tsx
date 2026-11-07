"use client";
import { memo } from "react";
import { O, SW, P } from "./palette";
import type { WeatherKind } from "@/domain/types";
import type { Lighting } from "@/domain/time";

const stroke = { stroke: O, strokeWidth: SW, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Glass area of the window in world units. */
const G = { x: 466, y: 116, w: 358, h: 296 };

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

interface Props {
  weather: WeatherKind;
  lighting: Lighting;
  minutes: number;
  reducedMotion: boolean;
}

export const RoomWindow = memo(function RoomWindow({ weather, lighting, minutes, reducedMotion }: Props) {
  const overcast = weather === "cloudy" || weather === "rain" || weather === "thunderstorm" || weather === "fog" || weather === "snow";
  const greyTop = weather === "thunderstorm" ? "#4b5163" : "#9aa3ad";
  const greyBot = weather === "thunderstorm" ? "#6b7080" : "#c9ced2";
  const k = overcast ? 0.75 : weather === "partly-cloudy" ? 0.15 : 0;
  const skyTop = mix(lighting.skyTop, mix(greyTop, lighting.skyTop, 1 - lighting.daylight), k);
  const skyBot = mix(lighting.skyBottom, mix(greyBot, lighting.skyBottom, 1 - lighting.daylight), k);
  const night = lighting.daylight < 0.3;
  // Sun/moon arc across the window
  const dayT = Math.min(1, Math.max(0, (minutes - 360) / 720));
  const sunX = G.x + 30 + dayT * (G.w - 60);
  const sunY = G.y + G.h - 40 - Math.sin(dayT * Math.PI) * (G.h - 110);
  const nightT = ((minutes + 1440 - 1080) % 1440) / 720;
  const moonX = G.x + 40 + Math.min(1, nightT) * (G.w - 80);
  const moonY = G.y + 120 - Math.sin(Math.min(1, nightT) * Math.PI) * 60;
  const landDark = 1 - lighting.daylight * (overcast ? 0.75 : 1);
  const hill1 = mix("#8DBA6A", "#1f2c33", landDark * 0.85);
  const hill2 = mix("#6E9E52", "#18242b", landDark * 0.85);
  const snowy = weather === "snow";
  const cloudCount = weather === "sunny" || weather === "clear-night" ? 1 : weather === "partly-cloudy" ? 3 : 5;
  const cloudColor = weather === "thunderstorm" ? "#7d8291" : overcast ? mix("#e7eaee", "#3a4258", 1 - lighting.daylight) : mix("#ffffff", "#5a5f86", 1 - lighting.daylight);

  return (
    <g>
      <defs>
        <clipPath id="glass">
          <rect x={G.x} y={G.y} width={G.w} height={G.h} />
        </clipPath>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={skyTop} />
          <stop offset="1" stopColor={skyBot} />
        </linearGradient>
        <radialGradient id="sunGlow">
          <stop offset="0" stopColor="#FFF4C9" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFF4C9" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Frame shadow on wall */}
      <rect x={G.x - 24} y={G.y - 16} width={G.w + 48} height={G.h + 54} rx={10} fill="#2a1a10" opacity={0.12} transform="translate(6 8)" />

      <g clipPath="url(#glass)">
        <rect x={G.x} y={G.y} width={G.w} height={G.h} fill="url(#sky)" style={{ transition: "fill 2s" }} />
        {night && !overcast && <Stars />}
        {!night && !overcast && (
          <g>
            <circle cx={sunX} cy={sunY} r={56} fill="url(#sunGlow)" />
            <circle cx={sunX} cy={sunY} r={22} fill="#FFE08A" stroke={O} strokeWidth={2} />
          </g>
        )}
        {night && weather !== "thunderstorm" && (
          <g opacity={overcast ? 0.35 : 1}>
            <circle cx={moonX} cy={moonY} r={18} fill="#F3EED8" stroke={O} strokeWidth={2} />
            <circle cx={moonX + 7} cy={moonY - 5} r={14} fill={skyTop} opacity={0.9} />
          </g>
        )}
        <Clouds count={cloudCount} color={cloudColor} still={reducedMotion} />

        {/* Landscape */}
        <path d={`M${G.x} ${G.y + 220} Q ${G.x + 90} ${G.y + 170} ${G.x + 200} ${G.y + 210} T ${G.x + G.w} ${G.y + 196} V ${G.y + G.h} H ${G.x} Z`} fill={hill1} stroke={O} strokeWidth={2} />
        <path d={`M${G.x} ${G.y + 250} Q ${G.x + 150} ${G.y + 222} ${G.x + 260} ${G.y + 246} T ${G.x + G.w} ${G.y + 236} V ${G.y + G.h} H ${G.x} Z`} fill={hill2} stroke={O} strokeWidth={2} />
        {snowy && (
          <>
            <path d={`M${G.x} ${G.y + 222} Q ${G.x + 90} ${G.y + 172} ${G.x + 200} ${G.y + 212} T ${G.x + G.w} ${G.y + 198} V ${G.y + 212} Q ${G.x + 200} ${G.y + 228} ${G.x} ${G.y + 236} Z`} fill="#F4F6FA" opacity={0.95} />
            <path d={`M${G.x} ${G.y + 252} Q ${G.x + 150} ${G.y + 224} ${G.x + 260} ${G.y + 248} T ${G.x + G.w} ${G.y + 238} V ${G.y + G.h} H ${G.x} Z`} fill="#EEF1F6" opacity={0.92} />
          </>
        )}
        {/* Little house on the hill — its window glows at night */}
        <g transform={`translate(${G.x + 236} ${G.y + 178})`}>
          <rect x={0} y={14} width={46} height={32} fill={mix("#E9D7B8", "#3b3b52", landDark * 0.8)} stroke={O} strokeWidth={2} />
          <path d="M-6 16 L23 -6 L52 16 Z" fill={snowy ? "#F4F6FA" : mix(P.tomato, "#3a2a3a", landDark * 0.8)} stroke={O} strokeWidth={2} />
          <rect x={16} y={24} width={14} height={12} fill={night ? "#FFD27A" : "#9fc6d6"} stroke={O} strokeWidth={1.5} />
        </g>
        {/* Tree */}
        <g transform={`translate(${G.x + 70} ${G.y + 150})`} className={reducedMotion ? "" : "sway-slow"} style={{ transformOrigin: `${G.x + 82}px ${G.y + 240}px` }}>
          <rect x={8} y={50} width={12} height={46} fill={P.woodDark} stroke={O} strokeWidth={2} />
          <circle cx={14} cy={36} r={30} fill={snowy ? "#E9EEF2" : mix("#5E8F49", "#14222a", landDark * 0.85)} stroke={O} strokeWidth={2} />
          <circle cx={-6} cy={52} r={18} fill={snowy ? "#DFE6EC" : mix("#6E9E52", "#14222a", landDark * 0.85)} stroke={O} strokeWidth={2} />
          <circle cx={34} cy={52} r={18} fill={snowy ? "#DFE6EC" : mix("#6E9E52", "#14222a", landDark * 0.85)} stroke={O} strokeWidth={2} />
        </g>
        {/* Fence */}
        <g stroke={O} strokeWidth={2} fill={mix("#F4E9D6", "#2f3346", landDark * 0.8)}>
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d={`M${G.x + 6 + i * 38} ${G.y + G.h} v-34 l7 -8 l7 8 v34 Z`} />
          ))}
          <rect x={G.x} y={G.y + G.h - 24} width={G.w} height={6} />
        </g>
        {weather === "fog" && <Fog still={reducedMotion} />}
        {(weather === "rain" || weather === "thunderstorm") && <Rain heavy={weather === "thunderstorm"} still={reducedMotion} />}
        {weather === "snow" && <Snow still={reducedMotion} />}
        {weather === "thunderstorm" && !reducedMotion && <rect x={G.x} y={G.y} width={G.w} height={G.h} fill="#fff" className="lightning" />}
        <rect x={G.x} y={G.y} width={G.w} height={G.h} fill="url(#glassSheen)" />
        {(weather === "rain" || weather === "thunderstorm") && <Droplets />}
      </g>

      {/* Frame + mullions */}
      <rect x={G.x - 16} y={G.y - 16} width={G.w + 32} height={G.h + 32} rx={6} fill="none" stroke={P.paper} strokeWidth={22} />
      <rect x={G.x - 27} y={G.y - 27} width={G.w + 54} height={G.h + 54} rx={8} fill="none" {...stroke} />
      <rect x={G.x - 5} y={G.y - 5} width={G.w + 10} height={G.h + 10} rx={2} fill="none" {...stroke} />
      <rect x={G.x + G.w / 2 - 6} y={G.y} width={12} height={G.h} fill={P.paper} {...stroke} />
      <rect x={G.x} y={G.y + 128} width={G.w} height={12} fill={P.paper} {...stroke} />
      {/* Sill */}
      <rect x={G.x - 44} y={G.y + G.h + 18} width={G.w + 88} height={20} rx={4} fill={P.paper} {...stroke} />
      <path d={`M${G.x - 30} ${G.y + G.h + 38} h${G.w + 60} l-10 14 h-${G.w + 40} Z`} fill={P.paperShade} {...stroke} />

      {/* Curtains */}
      <Curtain x={G.x - 64} flip={false} still={reducedMotion} />
      <Curtain x={G.x + G.w + 64} flip still={reducedMotion} />
      <rect x={G.x - 90} y={G.y - 48} width={G.w + 180} height={12} rx={6} fill={P.wood} {...stroke} />
      <circle cx={G.x - 92} cy={G.y - 42} r={10} fill={P.brass} {...stroke} />
      <circle cx={G.x + G.w + 92} cy={G.y - 42} r={10} fill={P.brass} {...stroke} />

      {/* Sill plant */}
      <g className={reducedMotion ? "" : "sway"} style={{ transformOrigin: `${G.x + 300}px ${G.y + G.h + 18}px` }}>
        <path d={`M${G.x + 300} ${G.y + G.h + 10} q-24 -30 -34 -16 M${G.x + 300} ${G.y + G.h + 10} q4 -40 22 -38 M${G.x + 300} ${G.y + G.h + 10} q22 -18 34 -6`} fill="none" stroke={P.leafDark} strokeWidth={7} strokeLinecap="round" />
        <circle cx={G.x + 268} cy={G.y + G.h - 8} r={8} fill={P.leafLight} stroke={O} strokeWidth={2} />
        <circle cx={G.x + 322} cy={G.y + G.h - 30} r={9} fill={P.leaf} stroke={O} strokeWidth={2} />
        <circle cx={G.x + 334} cy={G.y + G.h + 2} r={7} fill={P.leafLight} stroke={O} strokeWidth={2} />
      </g>
      <path d={`M${G.x + 282} ${G.y + G.h + 18} l4 -14 h28 l4 14 Z`} fill={P.pot} {...stroke} />
      <rect x={G.x + 40} y={G.y + G.h + 2} width={36} height={16} rx={3} fill={P.teal} {...stroke} />
      <rect x={G.x + 46} y={G.y + G.h - 8} width={24} height={10} rx={2} fill={P.honey} {...stroke} />
    </g>
  );
});

function Curtain({ x, flip, still }: { x: number; flip: boolean; still: boolean }) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`translate(${x} ${G.y - 42}) scale(${s} 1)`}>
      <g className={still ? "" : "curtain"} style={{ transformOrigin: "0 0" }}>
        <path d="M-24 0 H52 C52 120 30 200 44 330 C28 344 -10 344 -24 334 Z" fill={P.tomato} {...stroke} />
        <path d="M2 10 C4 120 -4 220 6 330 M26 10 C30 120 18 220 26 332" fill="none" stroke="#B8513B" strokeWidth={3} />
        <path d="M-26 196 Q 20 204 50 190" fill="none" stroke={P.honey} strokeWidth={8} strokeLinecap="round" />
      </g>
    </g>
  );
}

function Stars() {
  const stars = Array.from({ length: 22 }, (_, i) => ({ x: G.x + ((i * 89) % G.w), y: G.y + 10 + ((i * 47) % 160), r: i % 4 === 0 ? 2.2 : 1.3 }));
  return (
    <g>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFF6D8" className="twinkle" style={{ animationDelay: `${(i % 7) * 0.6}s` }} />
      ))}
    </g>
  );
}

function Cloud({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 30 a20 20 0 0 1 22 -22 a26 26 0 0 1 46 -4 a18 18 0 0 1 28 16 a14 14 0 0 1 -2 28 H6 a14 14 0 0 1 -6 -18 Z" fill={color} stroke={O} strokeWidth={2 / s} />
    </g>
  );
}

function Clouds({ count, color, still }: { count: number; color: string; still: boolean }) {
  const defs = [
    { y: 26, s: 1.0, dur: 140, delay: -20 },
    { y: 70, s: 0.75, dur: 110, delay: -70 },
    { y: 6, s: 1.25, dur: 170, delay: -120 },
    { y: 96, s: 0.9, dur: 125, delay: -40 },
    { y: 46, s: 1.4, dur: 190, delay: -150 },
  ].slice(0, count);
  return (
    <g>
      {defs.map((d, i) => (
        <g key={i} className={still ? "" : "drift"} style={{ animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }}>
          <Cloud x={G.x - 60 + (still ? 80 * i : 0)} y={G.y + d.y} s={d.s} color={color} />
        </g>
      ))}
    </g>
  );
}

function Rain({ heavy, still }: { heavy: boolean; still: boolean }) {
  const n = heavy ? 46 : 30;
  const drops = Array.from({ length: n }, (_, i) => ({ x: G.x + ((i * 61) % (G.w + 40)) - 20, y: G.y + ((i * 113) % G.h) }));
  const g = (dy: number) => drops.map((d, i) => <line key={`${dy}-${i}`} x1={d.x} y1={d.y + dy} x2={d.x - 6} y2={d.y + dy + 18} stroke="#DCE8F2" strokeWidth={2} opacity={0.75} strokeLinecap="round" />);
  return (
    <g className={still ? "" : heavy ? "rain fast" : "rain"}>
      {g(0)}
      {g(-G.h)}
    </g>
  );
}

function Snow({ still }: { still: boolean }) {
  const flakes = Array.from({ length: 34 }, (_, i) => ({ x: G.x + ((i * 71) % G.w), y: G.y + ((i * 97) % G.h), r: 2 + (i % 3) }));
  const g = (dy: number) => flakes.map((f, i) => <circle key={`${dy}-${i}`} cx={f.x} cy={f.y + dy} r={f.r} fill="#fff" opacity={0.9} />);
  return (
    <g className={still ? "" : "snow"}>
      {g(0)}
      {g(-G.h)}
    </g>
  );
}

function Fog({ still }: { still: boolean }) {
  return (
    <g opacity={0.6}>
      {[150, 200, 250].map((y, i) => (
        <rect key={y} x={G.x - 100} y={G.y + y} width={G.w + 200} height={36} rx={18} fill="#EEF0F2" className={still ? "" : "fog"} style={{ animationDelay: `${-i * 6}s` }} />
      ))}
    </g>
  );
}

function Droplets() {
  return (
    <g fill="#E7F1F8" opacity={0.55}>
      {[[30, 40], [90, 150], [150, 70], [240, 200], [300, 110], [330, 250], [60, 240]].map(([x, y], i) => (
        <ellipse key={i} cx={G.x + x} cy={G.y + y} rx={2.5} ry={4} />
      ))}
    </g>
  );
}

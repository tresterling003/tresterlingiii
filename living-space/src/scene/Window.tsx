import { O, SW, P } from "./palette";
import type { WeatherKind } from "@/domain/types";
import type { Lighting } from "@/domain/time";

const stroke = { stroke: O, strokeWidth: SW, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Glass area of the window in world units. */
export const G = { x: 466, y: 116, w: 358, h: 296 };
/** Full window footprint incl. curtains and sill (for sprite bounds). */
export const WINDOW_RECT = { x: G.x - 110, y: G.y - 70, w: G.w + 220, h: G.h + 150 };
export const GLASS_RECT = { x: G.x, y: G.y, w: G.w, h: G.h };

export function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export interface WindowLook {
  skyTop: string;
  skyBot: string;
  night: boolean;
  overcast: boolean;
  landDark: number;
  cloudColor: string;
  cloudCount: number;
  snowy: boolean;
}

/** All colour decisions for the view outside, from time + weather. */
export function windowLook(weather: WeatherKind, lighting: Lighting): WindowLook {
  const overcast = weather === "cloudy" || weather === "rain" || weather === "thunderstorm" || weather === "fog" || weather === "snow";
  const greyTop = weather === "thunderstorm" ? "#4b5163" : "#9aa3ad";
  const greyBot = weather === "thunderstorm" ? "#6b7080" : "#c9ced2";
  const k = overcast ? 0.75 : weather === "partly-cloudy" ? 0.15 : 0;
  return {
    skyTop: mix(lighting.skyTop, mix(greyTop, lighting.skyTop, 1 - lighting.daylight), k),
    skyBot: mix(lighting.skyBottom, mix(greyBot, lighting.skyBottom, 1 - lighting.daylight), k),
    night: lighting.daylight < 0.3,
    overcast,
    landDark: Math.round((1 - lighting.daylight * (overcast ? 0.75 : 1)) * 20) / 20,
    cloudColor:
      weather === "thunderstorm" ? "#7d8291" : overcast ? mix("#e7eaee", "#3a4258", 1 - lighting.daylight) : mix("#ffffff", "#5a5f86", 1 - lighting.daylight),
    cloudCount: weather === "sunny" || weather === "clear-night" ? 1 : weather === "partly-cloudy" ? 3 : 5,
    snowy: weather === "snow",
  };
}

/** Sky, stars, sun or moon. Clouds are drawn on top of this by the renderer. */
export function WindowSky({ look, minutes, weather }: { look: WindowLook; minutes: number; weather: WeatherKind }) {
  const dayT = Math.min(1, Math.max(0, (minutes - 360) / 720));
  const sunX = G.x + 30 + dayT * (G.w - 60);
  const sunY = G.y + G.h - 40 - Math.sin(dayT * Math.PI) * (G.h - 110);
  const nightT = Math.min(1, ((minutes + 1440 - 1080) % 1440) / 720);
  const moonX = G.x + 40 + nightT * (G.w - 80);
  const moonY = G.y + 120 - Math.sin(nightT * Math.PI) * 60;
  // Posterised sky: 6 flat bands instead of a smooth gradient, like an old game.
  const bands = 6;
  return (
    <g>
      {Array.from({ length: bands }, (_, i) => (
        <rect key={i} x={G.x} y={G.y + (i * G.h) / bands} width={G.w} height={G.h / bands + 1} fill={mix(look.skyTop, look.skyBot, i / (bands - 1))} />
      ))}
      {look.night && !look.overcast &&
        Array.from({ length: 22 }, (_, i) => (
          <rect key={i} x={G.x + ((i * 89) % G.w)} y={G.y + 10 + ((i * 47) % 160)} width={i % 4 === 0 ? 6 : 3} height={i % 4 === 0 ? 6 : 3} fill="#FFF6D8" />
        ))}
      {!look.night && !look.overcast && (
        <g>
          <circle cx={sunX} cy={sunY} r={40} fill="#FFF4C9" opacity={0.35} />
          <circle cx={sunX} cy={sunY} r={22} fill="#FFE08A" stroke={O} strokeWidth={3} />
        </g>
      )}
      {look.night && weather !== "thunderstorm" && (
        <g opacity={look.overcast ? 0.35 : 1}>
          <circle cx={moonX} cy={moonY} r={18} fill="#F3EED8" stroke={O} strokeWidth={3} />
          <circle cx={moonX + 7} cy={moonY - 5} r={14} fill={look.skyTop} />
        </g>
      )}
    </g>
  );
}

export function CloudShape({ color, s }: { color: string; s: number }) {
  return (
    <g transform={`scale(${s})`}>
      <path d="M0 30 a20 20 0 0 1 22 -22 a26 26 0 0 1 46 -4 a18 18 0 0 1 28 16 a14 14 0 0 1 -2 28 H6 a14 14 0 0 1 -6 -18 Z" fill={color} stroke={O} strokeWidth={3 / s} />
    </g>
  );
}

export const CLOUDS = [
  { y: 26, s: 1.0, dur: 140, delay: 20 },
  { y: 70, s: 0.75, dur: 110, delay: 70 },
  { y: 6, s: 1.25, dur: 170, delay: 120 },
  { y: 96, s: 0.9, dur: 125, delay: 40 },
  { y: 46, s: 1.4, dur: 190, delay: 150 },
];

/** Hills, house, tree and fence. */
export function WindowLand({ look }: { look: WindowLook }) {
  const { landDark, snowy, night } = look;
  const hill1 = mix("#8DBA6A", "#1f2c33", landDark * 0.85);
  const hill2 = mix("#6E9E52", "#18242b", landDark * 0.85);
  const leaf = (c: string) => (snowy ? "#E4EAEF" : mix(c, "#14222a", landDark * 0.85));
  return (
    <g>
      <path d={`M${G.x} ${G.y + 220} Q ${G.x + 90} ${G.y + 170} ${G.x + 200} ${G.y + 210} T ${G.x + G.w} ${G.y + 196} V ${G.y + G.h} H ${G.x} Z`} fill={snowy ? "#EEF1F6" : hill1} stroke={O} strokeWidth={3} />
      <path d={`M${G.x} ${G.y + 250} Q ${G.x + 150} ${G.y + 222} ${G.x + 260} ${G.y + 246} T ${G.x + G.w} ${G.y + 236} V ${G.y + G.h} H ${G.x} Z`} fill={snowy ? "#DDE4EC" : hill2} stroke={O} strokeWidth={3} />
      <g transform={`translate(${G.x + 236} ${G.y + 178})`}>
        <rect x={0} y={14} width={46} height={32} fill={mix("#E9D7B8", "#3b3b52", landDark * 0.8)} stroke={O} strokeWidth={3} />
        <path d="M-6 16 L23 -6 L52 16 Z" fill={snowy ? "#F4F6FA" : mix(P.tomato, "#3a2a3a", landDark * 0.8)} stroke={O} strokeWidth={3} />
        <rect x={15} y={24} width={15} height={12} fill={night ? "#FFD27A" : "#9fc6d6"} stroke={O} strokeWidth={3} />
      </g>
      <g transform={`translate(${G.x + 70} ${G.y + 150})`}>
        <rect x={8} y={50} width={12} height={46} fill={P.woodDark} stroke={O} strokeWidth={3} />
        <circle cx={14} cy={36} r={30} fill={leaf("#5E8F49")} stroke={O} strokeWidth={3} />
        <circle cx={-6} cy={52} r={18} fill={leaf("#6E9E52")} stroke={O} strokeWidth={3} />
        <circle cx={34} cy={52} r={18} fill={leaf("#6E9E52")} stroke={O} strokeWidth={3} />
      </g>
      <g stroke={O} strokeWidth={3} fill={mix("#F4E9D6", "#2f3346", landDark * 0.8)}>
        {Array.from({ length: 10 }, (_, i) => (
          <path key={i} d={`M${G.x + 6 + i * 38} ${G.y + G.h} v-34 l7 -8 l7 8 v34 Z`} />
        ))}
        <rect x={G.x} y={G.y + G.h - 24} width={G.w} height={6} />
      </g>
    </g>
  );
}

/** Frame, mullions, sill, curtains and the sill plant — drawn over the view. */
export function WindowFrame({ rainy }: { rainy: boolean }) {
  return (
    <g>
      {rainy && (
        <g fill="#E7F1F8" opacity={0.7}>
          {[[30, 40], [90, 150], [150, 70], [240, 200], [300, 110], [330, 250], [60, 240]].map(([x, y], i) => (
            <rect key={i} x={G.x + x} y={G.y + y} width={4} height={7} />
          ))}
        </g>
      )}
      {/* Glass glint */}
      <path d={`M${G.x + 20} ${G.y + 110} l40 -40 h12 l-40 40 Z M${G.x + 200} ${G.y + 258} l30 -30 h8 l-30 30 Z`} fill="#fff" opacity={0.28} />
      <rect x={G.x - 16} y={G.y - 16} width={G.w + 32} height={G.h + 32} fill="none" stroke={P.paper} strokeWidth={22} />
      <rect x={G.x - 27} y={G.y - 27} width={G.w + 54} height={G.h + 54} fill="none" {...stroke} />
      <rect x={G.x - 5} y={G.y - 5} width={G.w + 10} height={G.h + 10} fill="none" {...stroke} />
      <rect x={G.x + G.w / 2 - 6} y={G.y} width={12} height={G.h} fill={P.paper} {...stroke} />
      <rect x={G.x} y={G.y + 128} width={G.w} height={12} fill={P.paper} {...stroke} />
      <rect x={G.x - 44} y={G.y + G.h + 18} width={G.w + 88} height={20} fill={P.paper} {...stroke} />
      <path d={`M${G.x - 30} ${G.y + G.h + 38} h${G.w + 60} l-10 14 h-${G.w + 40} Z`} fill={P.paperShade} {...stroke} />
      <Curtain x={G.x - 64} flip={false} />
      <Curtain x={G.x + G.w + 64} flip />
      <rect x={G.x - 90} y={G.y - 48} width={G.w + 180} height={12} fill={P.wood} {...stroke} />
      <circle cx={G.x - 92} cy={G.y - 42} r={10} fill={P.brass} {...stroke} />
      <circle cx={G.x + G.w + 92} cy={G.y - 42} r={10} fill={P.brass} {...stroke} />
      <g>
        <path d={`M${G.x + 300} ${G.y + G.h + 10} q-24 -30 -34 -16 M${G.x + 300} ${G.y + G.h + 10} q4 -40 22 -38 M${G.x + 300} ${G.y + G.h + 10} q22 -18 34 -6`} fill="none" stroke={P.leafDark} strokeWidth={7} strokeLinecap="round" />
        <circle cx={G.x + 268} cy={G.y + G.h - 8} r={8} fill={P.leafLight} stroke={O} strokeWidth={3} />
        <circle cx={G.x + 322} cy={G.y + G.h - 30} r={9} fill={P.leaf} stroke={O} strokeWidth={3} />
        <circle cx={G.x + 334} cy={G.y + G.h + 2} r={7} fill={P.leafLight} stroke={O} strokeWidth={3} />
      </g>
      <path d={`M${G.x + 282} ${G.y + G.h + 18} l4 -14 h28 l4 14 Z`} fill={P.pot} {...stroke} />
      <rect x={G.x + 40} y={G.y + G.h + 2} width={36} height={16} fill={P.teal} {...stroke} />
      <rect x={G.x + 46} y={G.y + G.h - 8} width={24} height={10} fill={P.honey} {...stroke} />
    </g>
  );
}

function Curtain({ x, flip }: { x: number; flip: boolean }) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`translate(${x} ${G.y - 42}) scale(${s} 1)`}>
      <path d="M-24 0 H52 C52 120 30 200 44 330 C28 344 -10 344 -24 334 Z" fill={P.tomato} {...stroke} />
      <path d="M2 10 C4 120 -4 220 6 330 M26 10 C30 120 18 220 26 332" fill="none" stroke="#B8513B" strokeWidth={4} />
      <path d="M-26 196 Q 20 204 50 190" fill="none" stroke={P.honey} strokeWidth={9} strokeLinecap="round" />
    </g>
  );
}

/** Themes, effects, avatars and game rules. Shared by client and server. All customization is free in Settings. */

export type ThemeKey = "snow" | "candy" | "gingerbread" | "aurora" | "midnight" | "evergreen";
export type EffectKey = "none" | "snowfall" | "lights" | "stars";
export type AvatarKey =
  | "tree" | "gift" | "star" | "snowflake" | "bell" | "candy" | "cookie" | "crown" | "sparkles" | "music" | "heart" | "flame";
export type ColorKey = "red" | "green" | "gold" | "blue" | "pink" | "purple" | "teal" | "orange";

export const COLORS: Record<ColorKey, { bg: string; fg: string }> = {
  red: { bg: "#F9D4D6", fg: "#C8323C" },
  green: { bg: "#D3EBDB", fg: "#2E8B57" },
  gold: { bg: "#F7EBC2", fg: "#B88A10" },
  blue: { bg: "#D3E5F5", fg: "#3C7CC4" },
  pink: { bg: "#F6D7EA", fg: "#C85AA0" },
  purple: { bg: "#E3DAF3", fg: "#7D5BC0" },
  teal: { bg: "#CFEDEA", fg: "#2A9A8F" },
  orange: { bg: "#FAE0C8", fg: "#D2752A" },
};

export const THEMES: { key: ThemeKey; name: string; blurb: string; swatch: [string, string, string] }[] = [
  { key: "snow", name: "Fresh Snow", blurb: "Soft and bright, the classic.", swatch: ["#F4F6F8", "#FFFFFF", "#C8323C"] },
  { key: "candy", name: "Candy Cane", blurb: "Peppermint stripes and cherry red.", swatch: ["#FDEEF0", "#FFFFFF", "#D7263D"] },
  { key: "gingerbread", name: "Gingerbread", blurb: "Warm cookie browns and icing.", swatch: ["#F3E3D0", "#FFF8EF", "#9A5B2C"] },
  { key: "evergreen", name: "Evergreen", blurb: "Pine forest greens.", swatch: ["#E2EFE6", "#F8FCF9", "#1F7A4D"] },
  { key: "aurora", name: "Northern Lights", blurb: "Glowing teal and violet skies.", swatch: ["#DCEFF2", "#F7FBFD", "#6B4FD8"] },
  { key: "midnight", name: "Silent Night", blurb: "Dark mode under the stars.", swatch: ["#111827", "#1B2436", "#F2C14E"] },
];

export const EFFECTS: { key: EffectKey; name: string; blurb: string }[] = [
  { key: "none", name: "No effect", blurb: "Clean and calm." },
  { key: "snowfall", name: "Snowfall", blurb: "Gentle snow drifts over your dashboard." },
  { key: "lights", name: "String Lights", blurb: "Twinkling bulbs across the top." },
  { key: "stars", name: "Twinkle Stars", blurb: "Little stars sparkle in the background." },
];

export const AVATARS: { key: AvatarKey; name: string }[] = [
  { key: "tree", name: "Tree" },
  { key: "gift", name: "Present" },
  { key: "star", name: "Star" },
  { key: "snowflake", name: "Snowflake" },
  { key: "bell", name: "Bell" },
  { key: "candy", name: "Candy Cane" },
  { key: "cookie", name: "Cookie" },
  { key: "music", name: "Carols" },
  { key: "heart", name: "Heart" },
  { key: "flame", name: "Fireplace" },
  { key: "sparkles", name: "Sparkles" },
  { key: "crown", name: "Crown" },
];

/* ---------------------------------------------------------------- games */

export type GameKey = "catch" | "memory" | "scramble";

export const GAMES: Record<
  GameKey,
  { name: string; blurb: string; maxScore: number; minMs: number; maxMs: number; coins: (score: number) => number; cap: number }
> = {
  // Presents caught in 45 seconds; coal costs a life.
  catch: {
    name: "Present Catch",
    blurb: "Slide the sleigh to catch falling presents. Dodge the coal.",
    maxScore: 120,
    minMs: 5_000,
    maxMs: 60_000,
    coins: (s) => Math.floor(s / 2),
    cap: 40,
  },
  // Score = 100 minus wasted moves, only sent on a finished board.
  memory: {
    name: "Ornament Match",
    blurb: "Flip the ornaments and find every matching pair.",
    maxScore: 100,
    minMs: 8_000,
    maxMs: 15 * 60_000,
    coins: (s) => 10 + Math.floor(s / 4),
    cap: 35,
  },
  // Words unscrambled in 60 seconds.
  scramble: {
    name: "Jingle Jumble",
    blurb: "Unscramble as many Christmas words as you can in a minute.",
    maxScore: 25,
    minMs: 5_000,
    maxMs: 75_000,
    coins: (s) => s * 3,
    cap: 45,
  },
};

export const DAILY_COIN_CAP = 150;

/* ---------------------------------------------------------------- dates */

export function daysUntilChristmas(now = new Date()): number {
  const y = now.getMonth() === 11 && now.getDate() > 25 ? now.getFullYear() + 1 : now.getFullYear();
  const xmas = new Date(y, 11, 25);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((xmas.getTime() - today.getTime()) / 86400000);
}

export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });

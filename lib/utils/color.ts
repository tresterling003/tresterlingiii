// Appends an alpha channel to a #rrggbb hex color, e.g. withAlpha("#6366f1", "26") -> "#6366f126".
// Two-digit hex alpha is valid CSS in all evergreen browsers.
export function withAlpha(hex: string, alphaHex: string): string {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length !== 6) return hex;
  return `#${clean}${alphaHex}`;
}

export const CLASS_COLOR_PRESETS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#f43f5e", // rose
  "#14b8a6", // teal
];

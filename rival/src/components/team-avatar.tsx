import clsx from "clsx";

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

const SIZES = { xs: 24, sm: 32, md: 40, lg: 56, xl: 72 } as const;

/** Team crest: a chamfered badge in the team color with its abbreviation. */
export function TeamAvatar({
  abbr, color, size = "md", className, ring,
}: {
  abbr: string; color: string; size?: keyof typeof SIZES; className?: string; ring?: boolean;
}) {
  const px = SIZES[size];
  const dark = luminance(color) > 0.35;
  const fontSize = Math.round(px * (abbr.length > 3 ? 0.28 : abbr.length > 2 ? 0.32 : 0.38));
  return (
    <span
      className={clsx("relative inline-flex shrink-0", ring && "rounded-[22%] ring-2 ring-lime ring-offset-2 ring-offset-ink-900", className)}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <svg width={px} height={px} viewBox="0 0 40 40" className="absolute inset-0">
        <defs>
          <clipPath id={`c-${abbr}-${px}`}>
            <path d="M8 0h24l8 8v24l-8 8H8l-8-8V8z" />
          </clipPath>
        </defs>
        <g clipPath={`url(#c-${abbr}-${px})`}>
          <rect width="40" height="40" fill={color} />
          <path d="M26 -2 L44 -2 L44 16 Z" fill={dark ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.14)"} />
          <rect y="33" width="40" height="7" fill={dark ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.22)"} />
        </g>
      </svg>
      <span
        className="relative z-10 m-auto font-display font-extrabold italic leading-none tracking-wide"
        style={{ fontSize, color: dark ? "#0B0D05" : "#FFFFFF" }}
      >
        {abbr}
      </span>
    </span>
  );
}

export const TEAM_COLORS = [
  "#C8FF3D", "#3DDCFF", "#FF5D8F", "#FF8A3D", "#9B7BFF", "#FFD23D",
  "#3DFFB0", "#FF4D4D", "#4D7CFF", "#E8E9EC", "#2BB673", "#B0367C",
];

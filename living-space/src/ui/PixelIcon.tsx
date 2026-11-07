/** Tiny bitmap icons (one string row per pixel row; "#" = filled). Rendered crisp at any size. */
const ICONS = {
  close: ["#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.....#"],
  menu: ["#######", ".......", ".......", "#######", ".......", ".......", "#######"],
  wrench: ["....##.", "...#..#", "...#.#.", "..###..", ".###...", "###....", "##....."],
  share: ["...#...", "..###..", ".#.#.#.", "...#...", "##.#.##", "#.....#", "#######"],
  plus: ["#######", "#.....#", "#..#..#", "#.###.#", "#..#..#", "#.....#", "#######"],
} as const;

export type IconName = keyof typeof ICONS;

export function PixelIcon({ name, size = 21, label }: { name: IconName; size?: number; label?: string }) {
  const rows = ICONS[name];
  const h = rows.length;
  const w = rows[0].length;
  return (
    <svg className="px inline-block" width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} fill="currentColor" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {rows.flatMap((row, y) => Array.from(row).map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)))}
    </svg>
  );
}

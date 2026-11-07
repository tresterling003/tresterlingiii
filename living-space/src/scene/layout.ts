/** World geometry (logical units). The whole room is designed on a 1600×900 stage. */
export const WORLD = { w: 1600, h: 900, wallBottom: 600 } as const;

/** Floor area the resident can walk on (feet positions). */
export const FLOOR = { minX: 150, maxX: 1530, minY: 650, maxY: 860 } as const;

/** Named places the resident can go. Feet position + which way to face on arrival. */
export const SPOTS = {
  door: { x: 330, y: 700, face: -1 as const },
  window: { x: 640, y: 662, face: 1 as const },
  plant: { x: 470, y: 760, face: -1 as const },
  board: { x: 1080, y: 668, face: 1 as const },
  desk: { x: 1210, y: 720, face: 1 as const },
  cushion: { x: 900, y: 806, face: 1 as const },
  rug: { x: 720, y: 790, face: 1 as const },
  center: { x: 800, y: 740, face: 1 as const },
} as const;
export type SpotId = keyof typeof SPOTS;

/** Interactive object hit boxes (world units). Large enough for touch; checked to not overlap. */
export const HOTSPOTS = {
  door: { x: 70, y: 175, w: 230, h: 440, label: "Front door" },
  mail: { x: 130, y: 615, w: 210, h: 120, label: "Mail" },
  window: { x: 445, y: 95, w: 400, h: 345, label: "Window" },
  calendar: { x: 894, y: 138, w: 366, h: 318, label: "Today's schedule" },
  notes: { x: 1272, y: 90, w: 198, h: 219, label: "Sticky notes" },
  computer: { x: 1266, y: 368, w: 206, h: 186, label: "Computer" },
  phone: { x: 1180, y: 470, w: 82, h: 110, label: "Phone" },
} as const;
export type HotspotId = keyof typeof HOTSPOTS;

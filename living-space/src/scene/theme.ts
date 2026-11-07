/**
 * Room theme: the customisation seam. Wall/floor/accent colours, furniture variants,
 * unlocked decorations and resident appearance all flow from here, so future
 * "change furniture / seasonal theme / unlock decoration" features only add data.
 */
export interface RoomTheme {
  id: string;
  wallpaper: string;
  wallpaperStripe: string;
  wainscot: string;
  wainscotShade: string;
  floor: string;
  floorShade: string;
  rug: string;
  rugTrim: string;
  cushion: string;
  residentBody: string;
  residentBelly: string;
  residentSprout: string;
  decorations: DecorationId[];
  season: "none" | "autumn" | "winter" | "spring" | "summer";
}

export type DecorationId = "fairy-lights" | "wall-clock" | "bookshelf" | "frame-mountains" | "ball";

export const DEFAULT_THEME: RoomTheme = {
  id: "honey-sage",
  wallpaper: "#EBDCC3",
  wallpaperStripe: "#E3D0B2",
  wainscot: "#93A685",
  wainscotShade: "#7A8F6D",
  floor: "#C9915C",
  floorShade: "#B57E4C",
  rug: "#D9694F",
  rugTrim: "#F2C3B5",
  cushion: "#4F8C8C",
  residentBody: "#F6EEDC",
  residentBelly: "#FFF9EE",
  residentSprout: "#7DAA5B",
  decorations: ["fairy-lights", "wall-clock", "bookshelf", "frame-mountains", "ball"],
  season: "none",
};

export const THEMES: { id: string; name: string; patch: Partial<RoomTheme> }[] = [
  { id: "honey-sage", name: "Honey & sage", patch: {} },
  { id: "plum-dusk", name: "Plum dusk", patch: { wallpaper: "#E6D6DA", wallpaperStripe: "#DCC8CE", wainscot: "#8A7290", wainscotShade: "#735C7A", rug: "#4F8C8C", rugTrim: "#CFE3DF", cushion: "#D9694F" } },
  { id: "sea-glass", name: "Sea glass", patch: { wallpaper: "#DCE6E0", wallpaperStripe: "#CFDCD4", wainscot: "#5E8C8C", wainscotShade: "#4C7676", rug: "#E3B04B", rugTrim: "#F6E1AE", cushion: "#D9694F" } },
  { id: "terracotta", name: "Terracotta", patch: { wallpaper: "#F1DFCF", wallpaperStripe: "#E8D0BC", wainscot: "#C0785A", wainscotShade: "#A6644A", rug: "#6F8565", rugTrim: "#B7C7A8", cushion: "#E3B04B" } },
];

export const RESIDENT_COLORS: { id: string; name: string; body: string; belly: string; sprout: string }[] = [
  { id: "cream", name: "Cream", body: "#F6EEDC", belly: "#FFF9EE", sprout: "#7DAA5B" },
  { id: "peach", name: "Peach", body: "#F5C9A8", belly: "#FCE6D3", sprout: "#7DAA5B" },
  { id: "mint", name: "Mint", body: "#CDE6D2", belly: "#EAF5EC", sprout: "#D9694F" },
  { id: "lilac", name: "Lilac", body: "#D9CDEB", belly: "#F0EAF8", sprout: "#E3B04B" },
];

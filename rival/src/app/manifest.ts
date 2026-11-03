import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RIVAL — Fantasy Fitness",
    short_name: "RIVAL",
    description: "Every Move Counts. Every Week Matters.",
    start_url: "/home",
    display: "standalone",
    background_color: "#0E0F12",
    theme_color: "#0E0F12",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

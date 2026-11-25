import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/home",
    name: "Christmas HQ",
    short_name: "Christmas HQ",
    description: "Your family's Christmas dashboard.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#F2F3F5",
    theme_color: "#F2F3F5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}

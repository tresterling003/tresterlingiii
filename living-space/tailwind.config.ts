import type { Config } from "tailwindcss";

/**
 * Living Space UI tokens. These mirror src/scene/palette.ts so overlays and the
 * illustrated room share one palette. See DESIGN.md.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#4A3428", soft: "#6B5142", faint: "#8C735F" },
        paper: { DEFAULT: "#FBF5E8", warm: "#F4E9D3", edge: "#E6D5B5", line: "#D9C6A3" },
        wood: { light: "#C98F5A", DEFAULT: "#8B5A3C", dark: "#6A4129" },
        sage: { DEFAULT: "#8FA382", dark: "#6F8565", light: "#B7C7A8" },
        tomato: { DEFAULT: "#D9694F", dark: "#B8513B", soft: "#F2C3B5" },
        honey: { DEFAULT: "#E3B04B", soft: "#F6E1AE" },
        teal: { DEFAULT: "#4F8C8C", soft: "#CFE3DF" },
        sky: { DEFAULT: "#7FB7D9", night: "#28304F" },
        screen: { DEFAULT: "#1E2B33", glow: "#9FE3C9" },
      },
      fontFamily: {
        // Retro: one pixel typeface everywhere.
        sans: ['"Pixelify Sans"', "ui-monospace", "monospace"],
        display: ['"Pixelify Sans"', "ui-monospace", "monospace"],
        mono: ['"VT323"', "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["12px", { lineHeight: "16px", letterSpacing: "0.06em" }],
        xs: ["14px", { lineHeight: "18px" }],
        sm: ["16px", { lineHeight: "21px" }],
        base: ["18px", { lineHeight: "25px" }],
      },
      boxShadow: {
        card: "0 2px 0 #4A342833, 0 10px 30px -8px #2a1a1066",
        lift: "0 4px 0 #4A342840, 0 18px 40px -12px #2a1a1080",
        inset: "inset 0 2px 0 #ffffff80, inset 0 -2px 0 #4A342822",
      },
      keyframes: {
        "panel-in": { from: { opacity: "0", transform: "scale(.6)" }, to: { opacity: "1", transform: "none" } },
        "toast-in": { from: { opacity: "0", transform: "translateY(-12px)" }, to: { opacity: "1", transform: "none" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        // Stepped timing — animations snap through a few frames like an old handheld.
        "panel-in": "panel-in 240ms steps(4, end) both",
        "toast-in": "toast-in 200ms steps(3, end) both",
        "fade-in": "fade-in 160ms steps(2, end) both",
      },
    },
  },
  plugins: [],
};

export default config;

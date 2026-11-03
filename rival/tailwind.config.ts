import type { Config } from "tailwindcss";

/**
 * RIVAL design tokens.
 * Spacing follows the 8-pt grid: use even Tailwind steps (2 = 8px, 4 = 16px, 6 = 24px …).
 * Radii: sm 6 · md 10 · lg 14. Accent (lime) is reserved for "you", live state and primary actions.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#09090B",
          900: "#0E0F12", // app background
          850: "#131418", // raised surface
          800: "#181A1F", // card
          750: "#1E2026", // hover / input
          700: "#262931", // hairline
          600: "#33363F", // strong border
        },
        fg: {
          DEFAULT: "#F4F5F7",
          muted: "#A2A7B1",
          faint: "#6E737D",
        },
        lime: {
          DEFAULT: "#C8FF3D",
          soft: "#C8FF3D1F",
          dim: "#9FCC2F",
          ink: "#0B0D05",
        },
        danger: { DEFAULT: "#FF5D5D", soft: "#FF5D5D1A" },
        warn: { DEFAULT: "#FFB547", soft: "#FFB5471A" },
        info: { DEFAULT: "#7AB8FF", soft: "#7AB8FF1A" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "sans-serif"],
      },
      fontSize: {
        // label / caption / body / title / display / score
        "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.06em" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["16px", { lineHeight: "24px" }],
        lg: ["18px", { lineHeight: "24px" }],
        xl: ["22px", { lineHeight: "28px" }],
        "2xl": ["28px", { lineHeight: "32px" }],
        "3xl": ["36px", { lineHeight: "40px" }],
        score: ["56px", { lineHeight: "56px", letterSpacing: "-0.01em" }],
        "score-lg": ["80px", { lineHeight: "80px", letterSpacing: "-0.02em" }],
      },
      borderRadius: { sm: "6px", md: "10px", lg: "14px" },
      boxShadow: {
        sheet: "0 -8px 32px rgba(0,0,0,0.5)",
        pop: "0 8px 24px rgba(0,0,0,0.45)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        "sheet-up": { from: { transform: "translateY(100%)" }, to: { transform: "none" } },
        pulse2: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
        bump: { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.08)" }, "100%": { transform: "scale(1)" } },
      },
      animation: {
        "fade-up": "fade-up 240ms cubic-bezier(.2,.8,.2,1) both",
        "sheet-up": "sheet-up 280ms cubic-bezier(.2,.8,.2,1) both",
        live: "pulse2 1.6s ease-in-out infinite",
        shimmer: "shimmer 1.4s linear infinite",
        bump: "bump 420ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;

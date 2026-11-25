import type { Config } from "tailwindcss";

const v = (n: string) => `rgb(var(--${n}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Fredoka Variable"', "Fredoka", "ui-rounded", "system-ui", "sans-serif"] },
      colors: {
        bg: v("bg"),
        card: v("card"),
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        accent: v("accent"),
        good: v("good"),
        onaccent: v("onaccent"),
      },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / .04), 0 6px 18px rgb(0 0 0 / .07)",
        pop: "0 2px 4px rgb(0 0 0 / .05), 0 16px 40px rgb(0 0 0 / .14)",
        tile: "inset 0 0 0 4px rgb(255 255 255 / .55), 0 6px 14px rgb(0 0 0 / .06)",
      },
      borderRadius: { xl2: "1.25rem", xl3: "2rem" },
    },
  },
  plugins: [],
};
export default config;

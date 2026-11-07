// Builds dist/living-space.html: the whole room in ONE file (JS, CSS, pixel fonts, icon inlined).
// Open it in any modern browser, offline. Also used as the desktop app's built-in room.
//   npm run build:html
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = resolve(".");
const out = join(root, "dist");
const tmp = join(out, ".tmp");
mkdirSync(tmp, { recursive: true });

// 1) Tailwind → CSS
execFileSync(process.execPath, [require.resolve("tailwindcss/lib/cli.js"), "-i", "src/app/globals.css", "-o", join(tmp, "app.css"), "--minify"], { stdio: "inherit" });
const appCss = readFileSync(join(tmp, "app.css"), "utf8");

// 2) Fonts: keep latin + latin-ext woff2 faces, inline as data URLs
const fontFiles = [
  "@fontsource/pixelify-sans/400.css",
  "@fontsource/pixelify-sans/500.css",
  "@fontsource/pixelify-sans/600.css",
  "@fontsource/pixelify-sans/700.css",
  "@fontsource/vt323/400.css",
];
let fontCss = "";
for (const f of fontFiles) {
  const path = require.resolve(f);
  const css = readFileSync(path, "utf8");
  for (const face of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const m = /url\(\.\/files\/([^)]+?-latin-(?:ext-)?\d+-normal\.woff2)\)/.exec(face);
    if (!m) continue;
    const data = readFileSync(join(dirname(path), "files", m[1])).toString("base64");
    fontCss += face.replace(/src:[^;]+;/, `src: url(data:font/woff2;base64,${data}) format("woff2");`);
  }
}

// 3) JS bundle
const res = await build({
  entryPoints: [join(root, "standalone/entry.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2020", "safari15"],
  jsx: "automatic",
  write: false,
  tsconfig: join(root, "tsconfig.json"),
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS": JSON.stringify(process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS ?? "false"),
  },
  logLevel: "warning",
});
// An inline script must never contain a literal closing script tag.
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// 4) HTML
const icon = readFileSync(join(root, "public/icons/icon-192.png")).toString("base64");
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#4A3428">
<title>Living Space</title>
<link rel="icon" href="data:image/png;base64,${icon}">
<style>${fontCss}</style>
<style>${appCss}</style>
</head>
<body class="font-sans">
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
writeFileSync(join(out, "living-space.html"), html);
rmSync(tmp, { recursive: true, force: true });
console.log(`dist/living-space.html  ${(statSync(join(out, "living-space.html")).size / 1024).toFixed(0)} kB`);

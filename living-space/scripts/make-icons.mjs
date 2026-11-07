// Renders public/icons/icon.svg into the PNG sizes the PWA manifest needs.
// Uses the pre-installed Playwright Chromium:  node scripts/make-icons.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Resolve Playwright locally, or from the global install (NODE_PATH) if it isn't a project dependency.
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.cwd(), ...(process.env.NODE_PATH || "").split(":").filter(Boolean)] }));

const svg = readFileSync(resolve("public/icons/icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
const out = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["apple-touch-icon.png", 180, 0],
  ["icon-maskable-512.png", 512, 0.1],
];
for (const [name, size, pad] of out) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<html><body style="margin:0;background:#EBDCC3;display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: resolve("public/icons", name), omitBackground: false });
  console.log("wrote", name);
}
await browser.close();

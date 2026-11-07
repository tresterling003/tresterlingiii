// Renders public/icons/icon.svg into the PNG sizes the PWA manifest needs, as pixel art:
// the vector icon is drawn into a tiny 48×48 grid, then scaled up with nearest-neighbour.
//   NODE_PATH=$(npm root -g) node scripts/make-icons.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.cwd(), ...(process.env.NODE_PATH || "").split(":").filter(Boolean)] }));

const svg = readFileSync(resolve("public/icons/icon.svg"), "utf8");
const GRID = 48;
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
  await page.setContent(`<html><body style="margin:0;background:#EBDCC3"><canvas id="c" width="${size}" height="${size}" style="display:block"></canvas></body></html>`);
  await page.evaluate(
    async ({ svg, size, pad, GRID }) => {
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await img.decode();
      const inner = Math.round(GRID * (1 - pad * 2));
      const off = Math.round((GRID - inner) / 2);
      const small = document.createElement("canvas");
      small.width = small.height = GRID;
      const s = small.getContext("2d");
      s.fillStyle = "#EBDCC3";
      s.fillRect(0, 0, GRID, GRID);
      s.drawImage(img, off, off, inner, inner);
      const c = document.getElementById("c").getContext("2d");
      c.imageSmoothingEnabled = false;
      c.drawImage(small, 0, 0, size, size);
    },
    { svg, size, pad, GRID },
  );
  await page.locator("#c").screenshot({ path: resolve("public/icons", name) });
  console.log("wrote", name);
}
await browser.close();

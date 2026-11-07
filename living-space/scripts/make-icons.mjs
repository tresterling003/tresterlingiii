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

// Desktop app: big icon + tray icons (colour for Windows/Linux, black "template" silhouette for macOS menu bar).
{
  const browser2 = await chromium.launch();
  const pg = await browser2.newPage();
  const jobs = [
    ["desktop/build/icon.png", 512, "color", 48],
    ["desktop/build/tray.png", 32, "color", 32],
    ["desktop/build/trayTemplate.png", 22, "template", 22],
    ["desktop/build/trayTemplate@2x.png", 44, "template", 22],
  ];
  for (const [file, size, mode, grid] of jobs) {
    await pg.setViewportSize({ width: size, height: size });
    await pg.setContent(`<html><body style="margin:0;background:transparent"><canvas id="c" width="${size}" height="${size}" style="display:block"></canvas></body></html>`);
    await pg.evaluate(
      async ({ svg, size, mode, grid }) => {
        // Pip only (no room background) for tray icons; full icon for the app icon.
        const art = mode === "color" && size >= 256 ? svg : svg.replace(/<rect width="512"[^>]*\/>/, "").replace(/<rect y="360"[^>]*\/>/, "").replace(/<rect y="352"[^>]*\/>/, "").replace(/<ellipse cx="256" cy="420"[^>]*\/>/, "");
        const img = new Image();
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(art.replace('viewBox="0 0 512 512"', 'viewBox="96 120 320 320"'.replace("96 120 320 320", size >= 256 ? "0 0 512 512" : "120 150 272 272")));
        await img.decode();
        const small = document.createElement("canvas");
        small.width = small.height = grid;
        const s = small.getContext("2d");
        s.drawImage(img, 0, 0, grid, grid);
        const d = s.getImageData(0, 0, grid, grid);
        for (let i = 0; i < d.data.length; i += 4) {
          const a = d.data[i + 3] >= 110 ? 255 : 0;
          if (mode === "template") d.data[i] = d.data[i + 1] = d.data[i + 2] = 0;
          d.data[i + 3] = a;
        }
        s.putImageData(d, 0, 0);
        const c = document.getElementById("c").getContext("2d");
        c.imageSmoothingEnabled = false;
        c.drawImage(small, 0, 0, size, size);
      },
      { svg, size, mode, grid },
    );
    await pg.locator("#c").screenshot({ path: resolve(file), omitBackground: true });
    console.log("wrote", file);
  }
  await browser2.close();
}

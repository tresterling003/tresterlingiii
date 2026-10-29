// Usage: node scripts/shot.cjs <outfile> "<hash query>" [width height]
const { chromium } = require('./pw.cjs');
(async () => {
  const [out, query, w = '1600', h = '900'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${process.env.FV_URL || 'http://localhost:5173/'}#/debug?${query}`);
  await page.waitForFunction(() => window.__fv && window.__fv.ready, null, { timeout: 90000 });
  await page.screenshot({ path: out });
  await browser.close();
})();

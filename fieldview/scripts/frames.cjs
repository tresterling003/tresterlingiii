// Capture several sim times in one page load: node scripts/frames.cjs <outprefix> "<query>" t1,t2,... [w h]
const { chromium } = require('./pw.cjs');
(async () => {
  const [prefix, query, times, w = '800', h = '600'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${process.env.FV_URL || 'http://localhost:5173/'}#/debug?${query}`);
  await page.waitForFunction(() => window.__fv && window.__fv.ready, null, { timeout: 90000 });
  for (const t of times.split(',')) {
    await page.evaluate((t) => window.__fv.stage.render(+t), t);
    await page.screenshot({ path: `${prefix}-${t}.png` });
  }
  await browser.close();
})();

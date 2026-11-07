// Browser smoke test: loads the built game in headless Chromium, plays through key flows
// using the simulated recognizer (?sim), and saves screenshots. Usage: npm run build && npm run smoke
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = process.env.SHOTS ?? 'test-results';
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', '4317', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('4317')) r(); }); setTimeout(r, 6000); });

const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const sleep = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const step = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { await page.screenshot({ path: `${OUT}/FAIL-${name.replace(/\W+/g, '_')}.png` }).catch(() => {}); console.log('state', await page.evaluate(() => JSON.stringify({ busy: window.__vq.director.busy, cap: document.querySelector('.vd-bubble')?.textContent, acts: [...document.querySelectorAll('.vd-act,.vd-pic')].map((e) => e.getAttribute('aria-label') || e.dataset.key) })).catch(() => '')); errors.push(`${name}: ${e.message}`); console.log('✗', name, e.message); } };

await page.goto('http://localhost:4317/?dev=1&sim=1&quiet=1');
await step('title shows', async () => { await page.waitForSelector('.big-btn.play', { timeout: 20000 }); await sleep(1500); await shot('01-title'); });
await step('setup screen', async () => { await page.click('.big-btn.play', { force: true }); await page.waitForSelector('#go'); await shot('02-setup'); await page.click('#go'); await sleep(800); });
await step('intro dialogue + village', async () => { await sleep(2500); await shot('03-village-intro'); });
// finish intro lines quickly by cancelling speech
const idle = () => page.waitForFunction(() => !window.__vq.director.busy && !window.__vq.scenes.get('village').busy, null, { timeout: 60000 });
await idle();
await step('walk around', async () => {
  await page.keyboard.down('KeyD'); await sleep(900); await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.press('Space'); await sleep(600); await page.keyboard.up('KeyW');
  await shot('04-village-walk');
});
await step('snowman quest via simulated voice', async () => {
  const g = await page.evaluateHandle(() => window.__vq);
  // teleport next to Mister Flurry and talk (no item yet)
  await page.evaluate(async () => {
    const g = window.__vq; const v = g.scenes.get('village');
    v.ctrl.teleport(new (v.hero.position.constructor)(27.5, 0, -8), Math.PI / 2);
  });
  await sleep(600);
  await page.keyboard.press('KeyE'); await sleep(1500); await shot('05-snowman-ask');
  await page.waitForFunction(() => !window.__vq.director.busy, null, { timeout: 30000 });
  // collect the hat: teleport onto its pickup
  await page.evaluate(() => { const v = window.__vq.scenes.get('village'); const p = v.pickups.find((x) => x.item === 'hat' && !x.taken); v.ctrl.teleport(p.obj.position.clone().setY(0)); });
  await sleep(1200);
  await page.waitForFunction(() => !window.__vq.director.busy, null, { timeout: 30000 });
  await page.evaluate(() => { const v = window.__vq.scenes.get('village'); v.ctrl.teleport(new (v.hero.position.constructor)(27.5, 0, -8), Math.PI / 2); });
  await sleep(800);
  await page.keyboard.press('KeyE');
  await sleep(4000); await shot('06-snowman-voice');
  await page.waitForFunction(() => !window.__vq.director.busy, null, { timeout: 40000 });
  await sleep(500);
  const done = await page.evaluate(() => window.__vq.isFound('sm:hat'));
  if (!done) throw new Error('snowman hat not completed');
  await shot('07-snowman-happy');
});
await step('silence → options → picture path', async () => {
  await page.evaluate(() => { const d = window.__vq.director; d.simRec.queue.push({ kind: 'silence' }); });
  await page.evaluate(() => { const v = window.__vq.scenes.get('village'); v.ctrl.teleport(new (v.hero.position.constructor)(5, 0, 10)); });
  await sleep(500);
  await page.evaluate(() => { const v = window.__vq.scenes.get('village'); v.animals[0].a.position.set(5, 0, 8.5); });
  await sleep(300);
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.vd-act', { timeout: 30000 });
  await shot('08-heard-options');
  await page.$eval('.vd-act[aria-label="Pictures"]', (e) => e.click());
  await page.waitForSelector('.vd-pic.choice');
  await shot('09-picture-choice');
  await page.$eval('.vd-pic.choice:not([data-key^="x:"])', (e) => e.click());
  await page.waitForFunction(() => !window.__vq.director.busy, null, { timeout: 30000 });
  const last = await page.evaluate(() => window.__vq.store.data.attempts.at(-1).label);
  if (last !== 'Completed with help' && last !== 'Picture choice') throw new Error('unexpected label ' + last);
});
await step('toy factory', async () => {
  await page.evaluate(() => window.__vq.goto('factory'));
  await sleep(2500); await shot('10-factory');
  await page.evaluate(() => window.__vq.speaker.cancel());
  await page.waitForFunction(() => !window.__vq.director.busy, null, { timeout: 30000 });
  await sleep(4000); await shot('11-factory-belt');
});
await step('reindeer dash', async () => {
  await page.evaluate(() => window.__vq.goto('dash'));
  await sleep(1500); await shot('12-dash-start');
  await page.waitForFunction(() => window.__vq.scenes.get('dash').running, null, { timeout: 90000 });
  await page.keyboard.down('KeyA'); await sleep(1500); await page.keyboard.up('KeyA');
  await sleep(2000); await shot('13-dash-run');
  // software rendering is slow in CI; jump ahead to just before the bridge checkpoint
  await page.evaluate(() => { const d = window.__vq.scenes.get('dash'); d.body.pos.set(0, 0, -85); });
  await page.waitForFunction(() => window.__vq.scenes.get('dash').checkpoints[0].cleared, null, { timeout: 120000 });
  await sleep(1500); await shot('14-dash-bridge');
});
await step('cabin', async () => {
  await page.evaluate(() => window.__vq.goto('cabin'));
  await sleep(2500); await shot('15-cabin');
});
await step('parent dashboard', async () => {
  await page.evaluate(() => window.__vq.goto('village'));
  await sleep(1200);
  await page.evaluate(() => window.__vq.onOpenParent());
  await page.waitForSelector('#hold');
  const box = await page.locator('#hold').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 10); await page.mouse.down(); await page.waitForSelector('#q:not(.hidden)', { timeout: 20000 }); await page.mouse.up();
  const q = await page.textContent('#q label');
  const [, a, b] = q.match(/(\d+) × (\d+)/);
  await page.fill('#ans', String(a * b)); await page.click('#ok');
  await page.waitForSelector('.tabs');
  await shot('16-dashboard');
  await page.click('.tab:has-text("Progress")'); await sleep(300); await shot('17-dashboard-progress');
  await page.click('.btn.close');
});
console.log(`\nFPS estimate (swiftshader): ${await page.evaluate(() => Math.round(window.__vq.fpsEstimate))}`);
await browser.close();
server.kill();
if (errors.length) { console.log('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('\nSmoke test passed.');

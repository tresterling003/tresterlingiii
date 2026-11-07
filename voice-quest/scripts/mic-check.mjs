// Real microphone path checks (no simulation):
//  1. permission denied -> picture interaction (state D), game continues
//  2. Chromium fake audio device (a beep) -> local voice detection hears an attempt and the mic is released
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = spawn('npx', ['vite', 'preview', '--port', '4321', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => String(d).includes('4321') && r()); setTimeout(r, 6000); });
let failed = false;
async function run(label, args, grant, expectFn) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...args] });
  const ctx = await browser.newContext({ permissions: grant ? ['microphone'] : [] });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/?quiet=1');
  await page.waitForSelector('.big-btn.play');
  await page.evaluate(() => { const g = window.__vq; g.settings.setupDone = true; g.settings.voiceMode = 'activity'; g.store.save(true); });
  await page.click('.big-btn.play', { force: true });
  await page.evaluate(() => { const g = window.__vq; g.markFound('intro'); });
  await page.waitForTimeout(500);
  const res = page.evaluate(() => window.__vq.director.ask({
    activity: 'mic-check', speaker: { name: 'Test', voice: { pitch: 1, rate: 1 }, portrait: 'hat' }, question: 'Say hat',
    options: [{ key: 'hat', target: { id: 'hat', model: 'hat', modelSpoken: 'hat', accept: ['hat'], keywords: ['hat'], mode: 'keywords', level: 'B', picture: 'hat' } }],
    distractors: ['dog', 'cat'], success: () => 'yay',
  }));
  const out = await expectFn(page, res);
  const log = await page.evaluate(() => window.__vq.director.log.map((l) => ({ state: l.turn.state, mic: l.turn.micStatus, vad: l.turn.vad?.speechDetected, success: l.turn.success })));
  const tracks = await page.evaluate(() => window.__vq.director.runtimeNote);
  console.log(label, JSON.stringify({ out, log, runtimeNote: tracks }));
  await browser.close();
  return out;
}
const denied = await run('DENIED', [], false, async (page, res) => {
  await page.waitForSelector('.vd-pic.choice', { timeout: 30000 });
  await page.$eval('.vd-pic.choice[data-key="hat"]', (e) => e.click());
  return (await res).label;
});
if (denied !== 'Picture choice' && denied !== 'Completed with help') { failed = true; console.log('denied path failed'); }
const fake = await run('FAKE-MIC', ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], true, async (page, res) => {
  const r = await Promise.race([res, page.waitForSelector('.vd-act', { timeout: 30000 }).then(() => 'menu')]);
  return typeof r === 'string' ? r : r.label;
});
console.log('fake mic result:', fake, '(Practiced = beep counted as a voice attempt; menu = no voice detected)');
server.kill();
process.exit(failed ? 1 : 0);

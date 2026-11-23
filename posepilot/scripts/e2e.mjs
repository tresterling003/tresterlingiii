// Browser acceptance tests for PosePilot (the 12 tests from the project brief), at Chromebook size 1366×768.
// Usage: npm run build && npm run e2e        (SHOTS_DIR=./shots to save screenshots)
//
// TEST 5 (AI generation) runs against a MOCK image provider started by this script. The mock lives only here,
// in the test harness: it echoes back the colour-coded pose-guide image it receives, so the test can prove the
// whole pipeline (consent → request format → progress → placement → regenerate → failure → cancel) without a
// paid API key. It is never part of the app, and it does not show that a real provider draws good poses.
import http from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { preview } from 'vite';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(root, 'tests/fixtures/character-on-white.png');
const shots = process.env.SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });
const VIEW = { width: 1366, height: 768 };
const results = [];
const pass = (name) => { results.push(name); console.log(`  ✔ ${name}`); };

// ─────────────── helpers that run inside the page ───────────────
const state = (page) => page.evaluate(() => {
  const s = window.posepilot.getState();
  return { screen: s.screen, frames: s.project?.frames.map((f) => ({ id: f.id, kind: f.kind, label: f.label, hold: f.hold })) ?? [], currentId: s.project?.currentId, saveStatus: s.saveStatus, job: s.job && { status: s.job.status, items: s.job.items.map((i) => i.status) }, plan: s.project?.plan?.summary };
});
const layerStats = (page, frameId, layer) => page.evaluate(([id, layer]) => {
  const c = window.posepilot.getLayers(id)[layer];
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let opaque = 0, whiteOpaque = 0, hash = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 200) { opaque++; if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) whiteOpaque++; }
    hash = (hash * 31 + d[i + 3] + d[i]) | 0;
  }
  return { w: c.width, h: c.height, opaque, whiteOpaque, corner: d[3], hash };
}, [frameId, layer]);
/** Shape signature: the drawing cropped to its own bounding box, as a 24×24 occupancy grid (ignores position). */
const shapeSig = (page, frameId) => page.evaluate((id) => {
  const c = window.posepilot.getLayers(id).art;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const s = Math.max(x1 - x0, y1 - y0) + 1;
  const t = document.createElement('canvas'); t.width = t.height = 24;
  const g = t.getContext('2d'); g.drawImage(c, x0, y0, s, s, 0, 0, 24, 24);
  return Array.from(g.getImageData(0, 0, 24, 24).data.filter((_, i) => i % 4 === 3)).map((a) => (a > 30 ? 1 : 0));
}, frameId);
const sigDiff = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0) / a.length;
const reddish = (page) => page.evaluate(() => {
  const c = document.querySelector('[data-testid="canvas-view"] canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i] - d[i + 1] > 30 && d[i] - d[i + 2] > 30) n++;
  return n;
});
async function canvasBox(page) {
  return page.getByTestId('canvas-view').boundingBox();
}
async function drag(page, pts) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
}
async function noOverflow(page, where) {
  const o = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));
  assert.ok(o.x <= 1 && o.y <= 1, `${where}: page overflows the 1366×768 screen by ${o.x}×${o.y}px`);
}
async function inViewport(page, testid) {
  const b = await page.getByTestId(testid).first().boundingBox();
  assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= VIEW.width + 1 && b.y + b.height <= VIEW.height + 1, `${testid} is outside the screen: ${JSON.stringify(b)}`);
}
function pngSize(buf) {
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25] };
}
async function uploadFixture(page) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('start-upload').click();
  await (await chooser).setFiles(FIXTURE);
  await page.getByTestId('import-confirm').waitFor();
}

// ─────────────── mock provider (test harness only) ───────────────
const mock = { mode: 'ok', calls: [], delay: 0 };
const mockServer = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request('http://mock' + req.url, { method: req.method, headers: req.headers, body: Buffer.concat(chunks) });
  const form = await request.formData();
  const images = form.getAll('image[]');
  mock.calls.push({ prompt: form.get('prompt'), images: images.length, model: form.get('model'), fidelity: form.get('input_fidelity') });
  if (mock.delay) await new Promise((r) => setTimeout(r, mock.delay));
  if (res.destroyed) return;
  if (mock.mode === 'fail500') { res.writeHead(500); return res.end('{"error":{"message":"boom"}}'); }
  if (mock.mode === 'quota') { res.writeHead(429); return res.end('{"error":{"message":"rate limit"}}'); }
  const guide = Buffer.from(await images[1].arrayBuffer()); // echo the pose guide back
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ data: [{ b64_json: guide.toString('base64') }] }));
});
await new Promise((r) => mockServer.listen(4191, r));

const browser = await chromium.launch();

// ═════════════════════════ Part 1: no AI provider configured ═════════════════════════
{
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const server = await preview({ root, preview: { port: 4181, strictPort: true } });
  const ctx = await browser.newContext({ viewport: VIEW, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const shot = (n) => shots && page.screenshot({ path: `${shots}/${n}.png` });
  await page.goto('http://localhost:4181/');
  await page.getByTestId('ai-status-pill').filter({ hasText: /not set up/ }).waitFor();
  await shot('01-start');
  await noOverflow(page, 'start screen');

  // TEST 1 — upload a drawing on white paper; background separation is offered and enclosed white is kept
  await page.getByRole('radio', { name: /Studio/ }).click();
  await uploadFixture(page);
  await page.getByText(/plain background/).waitFor();
  await shot('02-import-dialog');
  await page.getByTestId('import-confirm').click();
  await page.getByTestId('canvas-view').waitFor();
  let st = await state(page);
  assert.equal(st.screen, 'studio');
  assert.equal(st.frames.length, 1);
  const art = await layerStats(page, st.frames[0].id, 'art');
  assert.equal(art.w, 1280);
  assert.equal(art.h, 720);
  assert.equal(art.corner, 0, 'paper background around the character became transparent');
  assert.ok(art.opaque > 20000, 'the drawing is on the canvas');
  assert.ok(art.whiteOpaque > 2000, 'white areas inside the character (face) were kept');
  await shot('03-uploaded');
  pass('TEST 1  Drawing upload (PNG on white paper → transparent background, face kept)');

  // TEST 3 — motion prompt → motion plan
  await page.getByTestId('motion-prompt').fill('make the character wave');
  await page.getByTestId('plan-summary').filter({ hasText: /^Wave/ }).waitFor();
  assert.equal(await page.locator('[data-testid="motion-plan"] ol > li').count(), 3);
  const planText = await page.getByTestId('motion-plan').innerText();
  assert.match(planText, /ANTICIPATION[\s\S]*ACTION[\s\S]*FOLLOW-THROUGH/i);
  await page.getByTestId('explain-motion').click();
  assert.match(await page.getByTestId('motion-plan').innerText(), /forearm/);
  await shot('04-plan');
  pass('TEST 3  Motion prompt → structured plan (anticipation / action / follow-through + explanation)');

  // TEST 11a — AI mode without a provider: clear explanation, no fake results, work untouched
  await page.getByTestId('mode-ai').click();
  await page.getByTestId('ai-unavailable').waitFor();
  assert.match(await page.getByTestId('ai-unavailable').innerText(), /No AI provider is configured/);
  assert.ok(await page.getByTestId('generate-poses').isDisabled());
  assert.equal((await state(page)).frames.length, 1);
  await shot('05-ai-unavailable');
  await page.getByTestId('mode-rig').click();

  // Rig mode on an uploaded drawing: auto stick rig
  await page.getByTestId('generate-poses').click();
  st = await state(page);
  assert.equal(st.frames.length, 4);
  assert.deepEqual(st.frames.map((f) => f.kind), ['original', 'rig', 'rig', 'rig']);
  await shot('06-rig-on-upload');

  // TEST 4 — procedural generation on the stick-figure demo creates visibly different poses
  await page.getByRole('button', { name: 'PosePilot home' }).click();
  await page.getByRole('radio', { name: /Studio/ }).click();
  await page.getByTestId('demo-sticks').click();
  await page.getByTestId('motion-prompt').fill('Make him jump forward');
  await page.getByTestId('plan-summary').filter({ hasText: /Jump/ }).waitFor();
  await page.getByTestId('generate-poses').click();
  st = await state(page);
  assert.equal(st.frames.length, 4);
  const sigs = [];
  for (const f of st.frames) sigs.push(await shapeSig(page, f.id));
  for (let i = 0; i < sigs.length; i++)
    for (let j = i + 1; j < sigs.length; j++) assert.ok(sigDiff(sigs[i], sigs[j]) > 0.08, `frames ${i + 1} and ${j + 1} have different shapes, not just positions (diff ${sigDiff(sigs[i], sigs[j]).toFixed(3)})`);
  await shot('07-rig-jump');
  pass('TEST 4  Procedural rig generation: 3 poses whose shapes differ (not translated copies), no AI');

  // TEST 6 — draw over a generated pose, erase part of it, undo
  const pose2 = st.frames[2].id;
  await page.getByTestId('frame-card').nth(2).click();
  await page.keyboard.press('b');
  const box = await canvasBox(page);
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await drag(page, [[cx - 150, cy - 60], [cx, cy - 20], [cx + 150, cy - 60]]);
  const afterDraw = (await layerStats(page, pose2, 'ink')).opaque;
  assert.ok(afterDraw > 300, 'stroke landed on "My lines"');
  await page.keyboard.press('e');
  await drag(page, [[cx - 20, cy - 80], [cx - 20, cy + 40], [cx + 20, cy + 40], [cx + 20, cy - 80]]);
  const afterErase = (await layerStats(page, pose2, 'ink')).opaque;
  assert.ok(afterErase < afterDraw, 'eraser removed part of the stroke');
  await shot('08-edit');
  await page.keyboard.press('Control+z');
  assert.equal((await layerStats(page, pose2, 'ink')).opaque, afterDraw, 'undo restored the erased part');
  await page.keyboard.press('Control+z');
  assert.equal((await layerStats(page, pose2, 'ink')).opaque, 0, 'second undo removed the stroke');
  await page.keyboard.press('Control+Shift+z');
  assert.equal((await layerStats(page, pose2, 'ink')).opaque, afterDraw, 'redo works');
  pass('TEST 6  Pose editing: draw, erase, undo, redo');

  // TEST 7 — onion skin with adjustable opacity
  await page.keyboard.press('b');
  await page.mouse.move(5, 5);
  const onionOn = await reddish(page);
  assert.ok(onionOn > 200, `previous pose shows as a red ghost (${onionOn} px)`);
  await page.getByRole('button', { name: 'Onion skin settings' }).click();
  await page.locator('#onion-opacity').fill('80');
  await page.waitForTimeout(150);
  const onionStrong = await reddish(page);
  assert.ok(onionStrong > onionOn, `higher opacity shows a stronger ghost (${onionOn} → ${onionStrong})`);
  await shot('09-onion');
  await page.keyboard.press('Escape');
  await page.getByTestId('onion-toggle').click();
  await page.waitForTimeout(150);
  assert.ok((await reddish(page)) < onionOn / 10, 'onion skin turns off');
  await page.getByTestId('onion-toggle').click();
  pass('TEST 7  Onion skin: previous pose ghosted, opacity adjustable, toggle off');

  // TEST 8 — playback order and holds
  await page.getByRole('button', { name: /Longer hold for Pose 1/ }).click(); // pose 1: 4 → 5
  await page.getByRole('button', { name: /Shorter hold for Pose 2/ }).click(); // pose 2: 2 → 1
  st = await state(page);
  const holds = st.frames.map((f) => f.hold);
  await page.getByRole('button', { name: '24', exact: true }).click();
  await page.getByTestId('frame-card').first().click();
  await page.evaluate(() => {
    window.__seen = [];
    const st = window.posepilot.getState;
    window.__iv = setInterval(() => {
      const s = st();
      if (!s.playing) return;
      const exp = s.project.frames.flatMap((f) => Array(f.hold).fill(f.id));
      const id = exp[s.playhead];
      if (window.__seen.length === 0 || window.__seen[window.__seen.length - 1].ph !== s.playhead) window.__seen.push({ ph: s.playhead, id });
    }, 4);
  });
  await page.getByTestId('play-button').click();
  await page.waitForTimeout(1600);
  await page.getByTestId('play-button').click();
  const seen = await page.evaluate(() => { clearInterval(window.__iv); return window.__seen; });
  const total = holds.reduce((a, b) => a + b, 0);
  const pass1 = seen.filter((s) => s.ph < total).slice(0, total).map((s) => s.ph);
  assert.deepEqual(pass1, [...Array(total).keys()], 'every playback frame visited in order');
  const order = []; for (const s of seen.slice(0, total)) if (order[order.length - 1] !== s.id) order.push(s.id);
  assert.deepEqual(order, st.frames.map((f) => f.id), 'drawings play in timeline order');
  const runs = st.frames.map((f) => seen.slice(0, total).filter((s) => s.id === f.id).length);
  assert.deepEqual(runs, holds, 'each drawing is held for its exposure count');
  pass(`TEST 8  Playback: order + holds respected (holds ${holds.join(',')} at 24 fps)`);

  // TEST 2 — save, refresh, recover
  await page.getByTestId('frame-card').nth(2).click();
  await page.keyboard.press('b');
  await drag(page, [[cx - 100, cy + 80], [cx + 100, cy + 100]]);
  const beforeReload = await layerStats(page, pose2, 'ink');
  await page.getByTestId('save-status').and(page.locator('[data-status="saved"]')).waitFor({ timeout: 5000 });
  await page.reload();
  await page.getByTestId('canvas-view').waitFor();
  const restored = await state(page);
  assert.deepEqual(restored.frames.map((f) => f.hold), holds);
  assert.deepEqual(restored.frames.map((f) => f.kind), ['original', 'rig', 'rig', 'rig']);
  assert.equal((await layerStats(page, pose2, 'ink')).hash, beforeReload.hash, 'your lines came back pixel-identical');
  pass('TEST 2  Save & restore across a page refresh (frames, timing, drawing)');

  // In-betweens (rig, real interpolation) between pose 1 and pose 2
  await page.getByRole('button', { name: /Add in-betweens between Pose 1/ }).click();
  await page.getByTestId('ib-rig').click();
  st = await state(page);
  assert.equal(st.frames.length, 6);
  assert.equal(st.frames[2].kind, 'inbetween');

  // TEST 9 — export a ZIP of numbered PNGs with identical dimensions
  await page.getByRole('button', { name: 'Export' }).click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-zip').click();
  const file = await (await dl).path();
  const zip = await JSZip.loadAsync(readFileSync(file));
  const names = Object.keys(zip.files).filter((n) => n.startsWith('frames/') && n.endsWith('.png')).sort();
  const expected = st.frames.reduce((a, f) => a + f.hold, 0);
  assert.equal(names.length, expected, 'one PNG per playback frame');
  names.forEach((n, i) => assert.equal(n, `frames/frame_${String(i + 1).padStart(4, '0')}.png`));
  for (const n of names) {
    const s = pngSize(await zip.file(n).async('nodebuffer'));
    assert.deepEqual([s.w, s.h], [1280, 720], `${n} has the project size`);
    assert.equal(s.colorType, 6, `${n} keeps an alpha channel`);
  }
  assert.ok(zip.file('HOW_TO_IMPORT_INTO_HARMONY.txt'));
  await shot('10-export');
  await page.keyboard.press('Escape');
  pass(`TEST 9  Export ZIP: ${names.length} files frame_0001…frame_${String(names.length).padStart(4, '0')}.png, all 1280×720 RGBA`);

  // TEST 10 — the studio fits a 1366×768 Chromebook
  await noOverflow(page, 'studio');
  for (const id of ['canvas-view', 'generate-poses', 'play-button', 'motion-prompt']) await inViewport(page, id);
  const cb = await canvasBox(page);
  assert.ok(cb.width > 600 && cb.height > 380, `canvas stays large (${Math.round(cb.width)}×${Math.round(cb.height)})`);

  // Quick Animate: the 4-step classroom flow
  await page.getByRole('button', { name: 'PosePilot home' }).click();
  await page.getByRole('radio', { name: /Quick Animate/ }).click();
  await page.getByTestId('demo-pip').click();
  await page.getByRole('button', { name: /Describe the motion/ }).click();
  await noOverflow(page, 'quick step 2');
  await page.getByRole('button', { name: 'Punch', exact: true }).click();
  await shot('11-quick-describe');
  await page.getByTestId('generate-poses').click();
  await page.getByRole('listbox', { name: 'Poses' }).waitFor();
  await noOverflow(page, 'quick step 3');
  await shot('12-quick-refine');
  await page.getByTestId('quick-next').click();
  await page.getByTestId('quick-play').click();
  await page.waitForTimeout(400);
  await shot('13-quick-preview');
  await page.getByTestId('quick-play').click();
  await noOverflow(page, 'quick step 4');
  await page.getByTestId('quick-export').click();
  await page.getByTestId('export-zip').waitFor();
  await page.keyboard.press('Escape');
  pass('TEST 10 Chromebook 1366×768: studio + all 4 Quick Animate steps fit, canvas stays large');

  // Teacher example + coin flip assistant
  await page.getByRole('button', { name: /Lessons/ }).click();
  await page.getByText('Follow-Through').first().click();
  await shot('14-lessons');
  await page.getByTestId('teacher-example').click();
  st = await state(page);
  assert.equal(st.frames.length, 4);
  assert.match(st.plan, /Throw/);
  await page.getByRole('button', { name: 'Coin Flip Assistant' }).click();
  await shot('15-coin');
  await page.getByTestId('coin-add').click();
  assert.equal((await state(page)).frames.length, 16);
  pass('Extras  Teacher worked example (rig) and Coin Flip Assistant');

  assert.deepEqual(errors, [], `no console errors: ${errors.join('\n')}`);
  await ctx.close();
  await new Promise((r) => server.httpServer.close(r));
}

// ═════════════════════════ Part 2: AI provider configured (mock) ═════════════════════════
{
  process.env.OPENAI_API_KEY = 'test-key-not-real';
  process.env.OPENAI_BASE_URL = 'http://localhost:4191/v1';
  const server = await preview({ root, preview: { port: 4182, strictPort: true } });
  const ctx = await browser.newContext({ viewport: VIEW, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (n) => shots && page.screenshot({ path: `${shots}/${n}.png` });
  await page.goto('http://localhost:4182/');
  await page.getByTestId('ai-status-pill').filter({ hasText: /AI drawing on/ }).waitFor();
  await page.getByRole('radio', { name: /Studio/ }).click();
  await uploadFixture(page);
  await page.getByTestId('import-confirm').click();
  await page.getByTestId('canvas-view').waitFor();
  await page.getByTestId('mode-ai').click();
  await page.getByTestId('motion-prompt').fill('Make him jump forward');
  await page.getByTestId('plan-summary').filter({ hasText: /Jump/ }).waitFor();
  const original = (await state(page)).frames[0].id;
  const origHash = (await layerStats(page, original, 'art')).hash;

  // TEST 5 — consent, then one request per pose with the drawing + a pose guide
  await page.getByTestId('generate-poses').click();
  await page.getByTestId('consent-yes').waitFor();
  await shot('20-consent');
  await page.getByTestId('consent-yes').click();
  await page.waitForFunction(() => window.posepilot.getState().job?.status === 'done', null, { timeout: 20000 });
  let st = await state(page);
  assert.deepEqual(st.frames.map((f) => f.kind), ['original', 'ai', 'ai', 'ai']);
  assert.equal(mock.calls.length, 3);
  for (const c of mock.calls) {
    assert.equal(c.images, 2, 'each request sends the original drawing and the pose guide');
    assert.equal(c.model, 'gpt-image-1');
    assert.equal(c.fidelity, 'high');
    assert.match(c.prompt, /SAME character/);
  }
  assert.match(mock.calls[0].prompt, /crouch/);
  assert.match(mock.calls[2].prompt, /in the air/);
  assert.equal((await layerStats(page, original, 'art')).hash, origHash, 'original drawing untouched');
  const s1 = await shapeSig(page, st.frames[1].id), s0 = await shapeSig(page, original);
  assert.ok(sigDiff(s0, s1) > 0.08, 'returned image is a new shape, not the original moved');
  await page.getByTestId('frame-card').nth(1).click();
  await shot('21-ai-result');
  pass('TEST 5  AI pipeline (mock provider): consent → 3 requests with drawing + pose guide → new pose frames');

  // Selective regeneration with a correction keeps the rest of the sequence
  const keep = await Promise.all(st.frames.map((f) => layerStats(page, f.id, 'art')));
  await page.getByTestId('fix-input').fill('raise the arms higher');
  await page.getByTestId('fix-button').click();
  await page.waitForFunction(() => window.posepilot.getState().job?.status === 'done', null, { timeout: 20000 });
  const last = mock.calls[mock.calls.length - 1];
  assert.equal(last.images, 3, 'regeneration also sends the previous attempt');
  assert.match(last.prompt, /raise the arms higher/);
  for (const i of [0, 2, 3]) assert.equal((await layerStats(page, st.frames[i].id, 'art')).hash, keep[i].hash, `frame ${i + 1} untouched`);

  // TEST 11b — provider failure: clear message, existing work preserved
  mock.mode = 'fail500';
  const before = (await layerStats(page, st.frames[1].id, 'art')).hash;
  await page.getByTestId('fix-button').click();
  await page.getByTestId('toast-error').waitFor();
  assert.match(await page.getByTestId('toast-error').first().innerText(), /having problems[\s\S]*not changed/);
  assert.equal((await layerStats(page, st.frames[1].id, 'art')).hash, before, 'failed regeneration changed nothing');
  await shot('22-ai-failure');
  mock.mode = 'quota';
  await page.getByTestId('fix-button').click();
  await page.waitForFunction(() => window.posepilot.getState().job?.status === 'error');
  assert.match(await page.getByTestId('job-status').innerText(), /limit or quota/);
  assert.equal((await state(page)).frames.length, 4);
  pass('TEST 11 Failure handling: no provider / provider error / quota → clear message, work preserved');

  // Cancel a slow job: no partial frames are invented
  mock.mode = 'ok';
  mock.delay = 4000;
  await page.getByTestId('frame-card').first().click();
  await page.getByTestId('generate-poses').click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForFunction(() => window.posepilot.getState().job?.status === 'cancelled', null, { timeout: 8000 });
  assert.equal((await state(page)).frames.length, 4);
  pass('Extras  AI job cancel stops the request and adds nothing');

  assert.deepEqual(errors, [], `no page errors: ${errors.join('\n')}`);
  await ctx.close();
  await new Promise((r) => server.httpServer.close(r));
}

await browser.close();
mockServer.close();
console.log(`\n${results.length} checks passed. TEST 12 (no fake features) is covered by the controls exercised above plus a manual audit — see README.`);

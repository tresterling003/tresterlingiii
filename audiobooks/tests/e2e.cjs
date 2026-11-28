// End-to-end test for Earshot. Uses the real archive.org search and metadata
// APIs; chapter MP3s are replaced by a 90-second test tone (tests/tone.mp3) so
// runs are quick and do not depend on archive.org's audio servers.
//
//   npm run build && npx vite preview --port 4173 &
//   npm run test:e2e                      # BASE_URL defaults to http://localhost:4173
//   SHOTS=/some/dir npm run test:e2e      # also save screenshots
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const SHOTS = process.env.SHOTS;
const tone = fs.readFileSync(path.join(__dirname, 'tone.mp3'));
const BOOK = 'dracula_librivox';

let passed = 0;
const failures = [];
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n    ${String(e.message || e).split('\n')[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: SHOTS ? 2 : 1 });
  // Serve the tone with byte-range support, as archive.org does, so seeking works.
  await ctx.route(/archive\.org\/download\/.*\.mp3/i, (r) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', 'Content-Type': 'audio/mpeg' };
    const m = /bytes=(\d*)-(\d*)/.exec(r.request().headers()['range'] || '');
    if (!m) return r.fulfill({ status: 200, headers: { ...headers, 'Content-Length': String(tone.length) }, body: tone });
    const start = m[1] ? Number(m[1]) : tone.length - Number(m[2]);
    const end = m[1] && m[2] ? Math.min(Number(m[2]), tone.length - 1) : tone.length - 1;
    return r.fulfill({
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${tone.length}`, 'Content-Length': String(end - start + 1) },
      body: tone.subarray(start, end + 1),
    });
  });
  // Full-size covers redirect to storage hosts; use the thumbnail service instead.
  await ctx.route(/archive\.org\/download\/([^/]+)\/.*\.jpe?g/i, (r) => {
    const id = r.request().url().match(/download\/([^/]+)\//)[1];
    return r.continue({ url: `https://archive.org/services/img/${id}` });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  const shot = async (name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const audio = (expr) => page.evaluate(`(() => { const a = window.__earshotAudio; return ${expr}; })()`);

  console.log(`Earshot e2e against ${BASE}`);
  await page.goto(BASE);

  await step('empty shelf shows the most-listened-to books', async () => {
    await page.getByRole('heading', { name: /Free audiobooks/ }).waitFor();
    await page.locator('.grid .card').first().waitFor({ timeout: 20000 });
    assert((await page.locator('.grid .card').count()) >= 6, 'expected popular books');
    await page.waitForTimeout(800);
    await shot('1-empty-shelf');
  });

  await step('search finds Dracula by title', async () => {
    await page.getByRole('link', { name: 'Browse' }).click();
    await page.getByLabel('Search by title or author').fill('dracula');
    await page.locator('.card', { hasText: 'Dracula' }).first().waitFor({ timeout: 20000 });
    assert(/books/.test(await page.locator('.count').innerText()), 'result count shown');
  });

  await step('search by author and partial word works', async () => {
    await page.getByLabel('Search by title or author').fill('austen prid');
    await page.locator('.card', { hasText: 'Pride and Prejudice' }).first().waitFor({ timeout: 20000 });
  });

  await step('genre chips filter the catalogue', async () => {
    await page.getByLabel('Search by title or author').fill('');
    await page.getByRole('button', { name: 'Mystery' }).click();
    await page.waitForFunction(() => /books/.test(document.querySelector('.count')?.textContent || ''), null, { timeout: 20000 });
    assert((await page.getByRole('button', { name: 'Mystery' }).getAttribute('aria-pressed')) === 'true', 'chip pressed');
    assert((await page.locator('.grid .card').count()) > 4, 'mystery results');
    await page.waitForTimeout(800);
    await shot('2-browse-mystery');
  });

  await step('book page lists chapters and the description', async () => {
    await page.goto(`${BASE}/#book/${BOOK}`);
    await page.getByRole('heading', { name: 'Dracula' }).waitFor();
    await page.locator('.chapters li').nth(20).waitFor({ timeout: 20000 });
    assert((await page.locator('.chapters li').count()) === 27, 'Dracula has 27 parts');
    assert((await page.locator('.desc').innerText()).length > 50, 'description');
    await page.waitForTimeout(500);
    await shot('3-book');
  });

  await step('Play starts the first chapter and shows the mini player', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.locator('.mini').waitFor();
    await page.waitForFunction(() => !window.__earshotAudio.paused && window.__earshotAudio.currentTime > 0.5, null, { timeout: 10000 });
    assert((await audio('a.src')).includes('dracula_01_stoker_64kb.mp3'), 'chapter 1 src');
    assert(await page.getByRole('button', { name: /On shelf/ }).isVisible(), 'playing adds to shelf');
  });

  await step('full player opens, speed changes playback rate', async () => {
    await page.getByRole('button', { name: 'Open player' }).click();
    await page.getByRole('dialog', { name: 'Player' }).waitFor();
    await page.getByRole('button', { name: /Speed/ }).click();
    await page.getByRole('menuitemradio', { name: '1.5×' }).click();
    assert((await audio('a.playbackRate')) === 1.5, 'rate 1.5');
    await page.waitForTimeout(400);
    await shot('4-player');
  });

  await step('skip forward and back move the position', async () => {
    const t0 = await audio('a.currentTime');
    await page.getByRole('dialog').getByRole('button', { name: 'Forward 30 seconds' }).click();
    await page.waitForTimeout(300);
    const t1 = await audio('a.currentTime');
    assert(t1 - t0 >= 28, `forward moved ${t1 - t0}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Back 15 seconds' }).click();
    await page.waitForTimeout(300);
    const t2 = await audio('a.currentTime');
    assert(t1 - t2 >= 13 && t1 - t2 < 17, `back moved ${t1 - t2}`);
  });

  await step('bookmark is saved and listed on the book page', async () => {
    await page.getByRole('button', { name: 'Bookmark' }).click();
    await page.getByRole('status').filter({ hasText: 'Bookmarked at' }).waitFor();
    await page.getByRole('button', { name: 'Close player' }).click();
    await page.locator('.marks li').first().waitFor();
    await page.getByLabel('Bookmark note').fill('Jonathan arrives at the castle');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('earshot:v1')).books.dracula_librivox.bookmarks);
    assert(saved.length === 1 && saved[0].note === 'Jonathan arrives at the castle', 'bookmark persisted');
  });

  await step('next chapter loads part 2 and highlights it', async () => {
    await page.getByRole('button', { name: 'Open player' }).click();
    await page.getByRole('button', { name: 'Next chapter' }).click();
    await page.waitForFunction(() => window.__earshotAudio.src.includes('dracula_02_stoker'), null, { timeout: 5000 });
    assert((await page.locator('.sheet-meta h2').innerText()) === 'Chapter 02', 'title shows chapter 2');
    await page.getByRole('button', { name: 'Close player' }).click();
    assert((await page.locator('.chapters li.current').innerText()).includes('Chapter 02'), 'chapter 2 highlighted');
  });

  await step('sleep timer "end of chapter" stops at the next chapter', async () => {
    await page.getByRole('button', { name: 'Open player' }).click();
    await page.getByRole('button', { name: /Sleep/ }).click();
    await page.getByRole('menuitem', { name: 'End of chapter' }).click();
    await page.waitForFunction(() => window.__earshotAudio.duration > 80, null, { timeout: 5000 });
    await page.evaluate(() => { window.__earshotAudio.currentTime = window.__earshotAudio.duration - 1; });
    await page.waitForFunction(() => window.__earshotAudio.src.includes('dracula_03_stoker'), null, { timeout: 8000 });
    await page.waitForTimeout(500);
    assert(await audio('a.paused'), 'paused after chapter ended');
    assert((await page.locator('.sheet-meta h2').innerText()) === 'Chapter 03', 'cued chapter 3');
  });

  await step('chapter list plays any chapter', async () => {
    await page.getByRole('button', { name: 'Close player' }).click();
    await page.locator('.chapters li').nth(4).getByRole('button').click();
    await page.waitForFunction(() => window.__earshotAudio.src.includes('dracula_05_stoker') && !window.__earshotAudio.paused, null, { timeout: 8000 });
    await page.waitForTimeout(1500);
  });

  let savedPos = 0;
  await step('progress survives a reload, shelf shows Continue listening', async () => {
    await page.getByRole('button', { name: 'Pause', exact: true }).first().click();
    savedPos = await audio('a.currentTime');
    await page.goto(`${BASE}/`);
    await page.reload();
    await page.getByText('Continue listening').waitFor();
    assert((await page.locator('.continue-title').innerText()) === 'Dracula', 'continue card');
    assert((await page.locator('.mini').innerText()).includes('Chapter 05'), 'mini player cued on chapter 5');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('earshot:v1')).books.dracula_librivox);
    assert(st.ch === 4 && Math.abs(st.pos - savedPos) <= 2, `saved ch ${st.ch} pos ${st.pos} vs ${savedPos}`);
    await page.waitForTimeout(500);
    await shot('5-shelf');
  });

  await step('Resume continues from the saved spot', async () => {
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForFunction(() => !window.__earshotAudio.paused, null, { timeout: 8000 });
    await page.waitForTimeout(800);
    const t = await audio('a.currentTime');
    assert(t >= savedPos - 6 && t <= savedPos + 4, `resumed at ${t}, saved ${savedPos}`);
    assert((await audio('a.playbackRate')) === 1.5, 'speed remembered');
  });

  await step('removing a book asks first, then clears it', async () => {
    await page.getByRole('button', { name: 'Pause' }).first().click();
    await page.goto(`${BASE}/#book/${BOOK}`);
    await page.getByRole('button', { name: /On shelf/ }).click();
    await page.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('button', { name: /Add to shelf/ }).waitFor();
    assert(!(await page.locator('.mini').isVisible()), 'player cleared');
  });

  await step('desktop layout renders without horizontal overflow', async () => {
    const d = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await d.goto(`${BASE}/#book/${BOOK}`);
    await d.locator('.chapters li').nth(5).waitFor({ timeout: 20000 });
    const over = await d.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert(!over, 'no overflow');
    if (SHOTS) await d.screenshot({ path: path.join(SHOTS, '6-desktop.png') });
    await d.close();
  });

  await step('no page errors', async () => {
    assert(errors.length === 0, errors.join(' | '));
  });

  await browser.close();
  console.log(`\n${passed}/${passed + failures.length} passed`);
  process.exit(failures.length ? 1 : 0);
})();

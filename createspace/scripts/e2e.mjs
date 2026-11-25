// End-to-end acceptance test in a real browser (Chromium via Playwright).
// Usage: npm run build && npm run e2e        (starts its own preview server)
// Optional: SHOTS_DIR=./shots npm run e2e     (saves screenshots)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { preview } from 'vite';

// Loaded with require so a globally installed Playwright also works (NODE_PATH=$(npm root -g)).
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 4179;
const URL = `http://localhost:${PORT}`;
const shots = process.env.SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });

const server = await preview({ preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch();
let passed = 0;
const check = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

/** Wait (up to 3s) for a locator to reach an exact count; the UI updates asynchronously after typing. */
async function expectCount(locator, n, msg = '') {
  const end = Date.now() + 3000;
  let c;
  while ((c = await locator.count()) !== n && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  assert.equal(c, n, msg);
}

const SIZES = [
  { label: 'desktop', viewport: { width: 1440, height: 900 } },
  { label: 'tablet', viewport: { width: 820, height: 1180 } },
  { label: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

async function run({ label, ...ctxOptions }) {
  console.log(`\n${label} (${ctxOptions.viewport.width}×${ctxOptions.viewport.height})`);
  const ctx = await browser.newContext({ ...ctxOptions, colorScheme: 'light' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const shot = (name) => shots && page.screenshot({ path: `${shots}/${label}-${name}.png`, fullPage: true });
  const desktop = ctxOptions.viewport.width >= 1024;
  const noOverflow = async (where) => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1, `horizontal overflow of ${over}px on ${where}`);
  };
  // Tool tiles only (the "Suggest a tool" tile has no data-tool).
  const cards = () => page.locator('main ul[aria-label="All tools"] > li[data-tool], main ul[aria-label="Search results"] > li[data-tool]');

  // ---- App starts, dashboard renders
  await page.goto(URL + '/');
  await page.getByRole('heading', { level: 1, name: 'What are you making today?' }).waitFor();
  await expectCount(cards(), 14);
  await noOverflow('dashboard');
  await shot('01-dashboard');
  check('dashboard loads with all 14 tools');

  // ---- Every tool is clearly labelled as not yet available
  const badges = await page.locator('main ul[aria-label="All tools"] > li[data-tool]', { hasText: /Coming soon|In development/ }).count();
  assert.equal(badges, 14, 'every card shows Coming soon / In development');
  await expectCount(page.getByText(/^Available$/), 0);
  check('all unfinished tools labelled Coming soon');

  // ---- Search: name, keyword, description, category, empty state, clear
  const search = page.getByRole('searchbox', { name: 'Search tools' });
  await search.fill('telep');
  await expectCount(cards(), 1);
  assert.equal(await cards().first().getByRole('heading').innerText(), 'Teleprompter');
  await search.fill('gradient'); // keyword
  await expectCount(cards(), 1);
  assert.match(await cards().first().innerText(), /Color Studio/);
  await search.fill('dialogue'); // description
  await expectCount(cards(), 1);
  assert.match(await cards().first().innerText(), /Storyboard Studio/);
  await search.fill('business'); // category
  await expectCount(cards(), 2);
  await search.fill('zzqxv');
  await page.getByText('No tools match “zzqxv”').waitFor();
  await shot('02-empty-search');
  await page.getByRole('button', { name: 'Clear search' }).first().click();
  await expectCount(cards(), 14);
  check('search matches names, keywords, descriptions, categories; empty state + clear work');

  // "/" shortcut focuses search (keyboard devices)
  if (desktop) {
    await page.locator('h1').click();
    await page.keyboard.press('/');
    assert.ok(await search.evaluate((el) => el === document.activeElement));
    await page.keyboard.press('Escape');
    check('"/" keyboard shortcut focuses search');
  }

  // ---- Category filters
  const filters = page.getByRole('group', { name: 'Filter by category' });
  for (const [name, n] of [['Creative', 6], ['Content', 3], ['Productivity', 3], ['Business', 2]]) {
    await filters.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await filters.locator('button[aria-pressed="true"]', { hasText: name }).waitFor();
    await expectCount(cards(), n, `${name} filter count`);
  }
  await search.fill('timer'); // combined with Business → nothing
  await page.getByText('No tools match “timer” in Business').waitFor();
  await page.getByRole('button', { name: 'Search all categories' }).click();
  await expectCount(cards(), 2, 'timer across all categories (Pose Challenge, Focus Room)');
  await search.fill('');
  await filters.getByRole('button', { name: /^All/ }).click();
  await expectCount(cards(), 14);
  check('category filters (and combined with search) work');

  // ---- Favorites: add, persist across reload, remove
  await page.getByText('Bookmark the tools you use most').waitFor();
  await page.getByRole('button', { name: 'Add Color Studio to favorites' }).click();
  await page.getByRole('button', { name: 'Add Invoice Maker to favorites' }).click();
  const favGrid = page.locator('ul[aria-label="Favorite tools"]');
  await expectCount(favGrid.locator('> li'), 2);
  assert.match(await favGrid.locator('> li').first().innerText(), /Invoice Maker/, 'newest favorite first');
  await page.reload();
  await expectCount(favGrid.locator('> li'), 2, 'favorites persist after reload');
  assert.equal(
    await page.getByRole('button', { name: 'Remove Color Studio from favorites' }).first().getAttribute('aria-pressed'),
    'true',
  );
  await shot('03-favorites-on-dashboard');
  check('bookmarking works and persists after refresh');

  // ---- Navigation: every tab in the bottom bar, plus the Categories sheet
  const tabs = page.getByRole('navigation', { name: 'Main' });
  const nav = async (name) => {
    if (name.endsWith(' Tools') && name !== 'All Tools') {
      await tabs.getByRole('button', { name: 'Categories' }).click();
      await page.getByRole('dialog', { name: 'Categories' }).getByRole('link', { name: new RegExp(`^${name}`) }).click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    } else {
      await tabs.getByRole('link', { name: new RegExp(`^${name}`) }).click();
    }
  };
  const routes = [
    ['All Tools', '/tools', 'All Tools'],
    ['Favorites', '/favorites', 'Favorites'],
    ['Creative Tools', '/category/creative', 'Creative Tools'],
    ['Content Tools', '/category/content', 'Content Tools'],
    ['Productivity Tools', '/category/productivity', 'Productivity Tools'],
    ['Business Tools', '/category/business', 'Business Tools'],
    ['What’s New', '/whats-new', 'What’s New'],
    ['Projects', '/projects', 'My Projects'],
    ['Home', '/', 'What are you making today?'],
  ];
  for (const [link, path, heading] of routes) {
    await nav(link);
    await page.waitForURL(URL + path);
    await page.getByRole('heading', { level: 1, name: heading }).waitFor();
    if (path.startsWith('/category/')) {
      // the Categories tab is highlighted (it's a button, so check its style state via the sheet instead)
      await tabs.getByRole('button', { name: 'Categories' }).click();
      const current = page.getByRole('dialog', { name: 'Categories' }).locator('[aria-current="page"]');
      assert.match(await current.innerText(), new RegExp(link), `${link} highlighted`);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    } else {
      assert.match(await tabs.locator('[aria-current="page"]').innerText(), new RegExp(link), `${link} highlighted`);
    }
    await noOverflow(path);
  }
  check('all 9 navigation destinations reach the right page and highlight');
  check('categories sheet opens and closes with Escape');

  // Top-bar shortcuts
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await page.getByRole('heading', { level: 1, name: 'Settings' }).waitFor();
  await page.getByRole('link', { name: 'CreateSpace home' }).click();
  await page.getByRole('heading', { level: 1, name: 'What are you making today?' }).waitFor();
  check('top-bar logo and settings buttons work');

  // ---- Favorites page: remove a bookmark, empty state
  await page.goto(URL + '/favorites');
  const favPage = page.locator('ul[aria-label="Favorite tools"] > li');
  await expectCount(favPage, 2);
  await page.getByRole('button', { name: 'Remove Invoice Maker from favorites' }).click();
  await expectCount(favPage, 1);
  await page.getByRole('button', { name: 'Remove Color Studio from favorites' }).click();
  await page.getByText('No favorites yet').waitFor();
  await page.reload();
  await page.getByText('No favorites yet').waitFor();
  check('unbookmarking works and persists; empty state shows');

  // ---- Category page search + tool page layout
  await page.goto(URL + '/category/productivity');
  await expectCount(page.locator('main ul > li'), 3);
  await page.getByRole('searchbox').fill('pomodoro');
  await expectCount(page.locator('main ul > li'), 1);
  await page.getByRole('link', { name: 'Focus Room' }).click();
  await page.waitForURL(URL + '/tools/focus-room');
  await page.getByRole('heading', { level: 1, name: 'Focus Room' }).waitFor();
  await page.getByRole('heading', { name: 'Focus Room isn’t available yet' }).waitFor();
  await page.getByRole('button', { name: 'Add Focus Room to favorites' }).first().click();
  await page.getByText('Saved', { exact: true }).waitFor();
  await shot('05-tool-page');
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Productivity Tools' }).click();
  await page.waitForURL(URL + '/category/productivity');
  check('category search, tool page, breadcrumb and tool-page bookmark work');

  // ---- Every registered tool page renders (and says it isn't available)
  for (const id of ['color-studio', 'canvas-resizer', 'storyboard-studio', 'character-vault', 'pose-challenge', 'creative-challenge',
    'background-remover', 'content-calendar', 'teleprompter', 'focus-room', 'brain-dump', 'deadline-tracker', 'rate-calculator', 'invoice-maker']) {
    await page.goto(`${URL}/tools/${id}`);
    await page.getByText(/isn’t available yet/).waitFor();
  }
  check('all 14 tool pages render with a clear "not available yet" notice');

  // ---- Suggest a tool / Projects without cloud storage: explain instead of pretending to work
  await page.goto(URL + '/');
  await page.getByRole('link', { name: /Suggest a tool/ }).click();
  await page.getByRole('heading', { level: 1, name: 'Suggest a Tool' }).waitFor();
  await page.getByText('Cloud storage isn’t available here').waitFor();
  await expectCount(page.locator('main form, main textarea'), 0, 'no form that cannot save');
  await page.goto(URL + '/projects');
  await page.getByText('Cloud storage isn’t available here').waitFor();
  await page.goto(URL + '/request-tool');
  await page.getByRole('heading', { level: 1, name: 'Suggest a Tool' }).waitFor();
  await page.goto(URL + '/tools/not-a-tool');
  await page.getByText('This page doesn’t exist').waitFor();
  await page.goto(URL + '/category/nope');
  await page.getByText('This page doesn’t exist').waitFor();
  check('without cloud storage, Suggest/Projects explain clearly; old link redirects; unknown pages show 404');

  // ---- Theme: toggle, persist, settings radio
  await page.goto(URL + '/');
  const isDark = async (expected) => {
    // give React a moment to apply the change, then report the actual state
    if (expected !== undefined)
      await page.waitForFunction((d) => document.documentElement.classList.contains('dark') === d, expected, { timeout: 3000 }).catch(() => {});
    return page.evaluate(() => document.documentElement.classList.contains('dark'));
  };
  assert.equal(await isDark(), false);
  await page.getByRole('button', { name: 'Switch to dark mode' }).first().click();
  assert.equal(await isDark(true), true);
  await page.reload();
  assert.equal(await isDark(), true, 'dark theme persists after reload');
  await shot('06-dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(bg, 'rgb(246, 244, 239)', 'dark background applied');
  await page.goto(URL + '/settings');
  await page.getByText('Light', { exact: true }).click();
  assert.equal(await isDark(false), false);
  await page.reload();
  assert.equal(await isDark(), false, 'light theme persists after reload');
  check('theme toggle and Settings theme choice work and persist');

  // ---- Settings: clear favorites and reset
  await page.goto(URL + '/settings');
  await page.getByRole('button', { name: 'Clear favorites' }).click();
  await page.getByRole('button', { name: 'Remove 1' }).click();
  await page.getByText('Favorites cleared.').waitFor();
  await page.getByRole('button', { name: 'Reset everything' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('createspace:')));
  assert.deepEqual(keys, [], 'reset removes all CreateSpace keys');
  check('Settings clear-favorites and reset work');

  // ---- Corrupted storage doesn't crash the app
  await page.evaluate(() => {
    localStorage.setItem('createspace:v1:favorites', '{not json');
    localStorage.setItem('createspace:v1:theme', '"purple"');
  });
  await page.goto(URL + '/');
  await page.getByRole('heading', { level: 1 }).waitFor();
  check('corrupted saved data falls back safely');

  assert.deepEqual(errors, [], `console errors: ${errors.join('\n')}`);
  check('no console errors');
  await ctx.close();
}

try {
  for (const size of SIZES) await run(size);
  console.log(`\nAll ${passed} checks passed.`);
} finally {
  await browser.close();
  server.httpServer.close();
}

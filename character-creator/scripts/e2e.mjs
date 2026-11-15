// End-to-end check of the whole student flow in a real browser, at phone and desktop sizes.
// Usage: npm run build && npm run e2e   (starts its own preview server)
import { createRequire } from 'node:module';
import { preview } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

// Playwright is loaded with require so a globally installed copy works (NODE_PATH=$(npm root -g)).
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const shots = process.env.SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });
const server = await preview({ preview: { port: 4178, strictPort: true } });
const URL = 'http://localhost:4178/';
const browser = await chromium.launch();

async function run(label, contextOptions, { blockClipboard = false } = {}) {
  const ctx = await browser.newContext({ ...contextOptions, acceptDownloads: true });
  if (!blockClipboard) await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (blockClipboard)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined });
      document.execCommand = () => false;
    });
  const shot = async (name) => shots && page.screenshot({ path: `${shots}/${label}-${name}.png`, fullPage: true });
  const title = () => page.locator('#q-title').innerText();
  const next = () => page.getByRole('button', { name: /Next|Reveal/ }).click();
  const noOverflow = async (where) => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1, `${label}: horizontal overflow of ${over}px on ${where}`);
  };

  await page.goto(URL);
  await shot('00-intro');
  await noOverflow('intro');
  await page.getByRole('button', { name: /Start the quiz/ }).click();

  // Q1: tap a card -> advances on its own
  assert.match(await title(), /room full of strangers/);
  await shot('01-room');
  await page.getByRole('button', { name: /quiet corner/ }).click();
  await page.waitForFunction(() => document.querySelector('#q-title')?.textContent?.includes('kind of being'));
  await shot('02-type');
  await noOverflow('type');

  // Q2: custom answer; Next stays disabled until text is typed
  await page.getByRole('button', { name: /hybrid/ }).click();
  assert.ok(await page.getByRole('button', { name: 'Next →' }).isDisabled(), 'Next should wait for custom text');
  await page.getByLabel('My character is…').fill('a half-cat librarian');
  await shot('02b-custom');
  await next();

  // Refresh mid-quiz: progress must survive
  assert.match(await title(), /Pick a world/);
  await page.reload();
  assert.match(await title(), /Pick a world/, 'refresh kept the current question');
  await page.getByRole('button', { name: '← Back' }).click();
  assert.equal(await page.getByLabel('My character is…').inputValue(), 'a half-cat librarian', 'refresh kept the custom answer');
  await next();

  for (const [expect, pick] of [
    [/Pick a world/, /Ordinary school/],
    [/show just dropped/, /Mystery/],
    [/going wrong at once/, /strange invention/],
    [/one major flaw/, /Refusing to ask for help/],
    [/want more than anything/, /uncover a secret/],
    [/standing in the way/, /keeps saying no/],
    [/art style/, /Bold and flat/],
  ]) {
    assert.match(await title(), expect);
    if (/art style|show just/.test(String(expect))) await shot(`q-${String(pick).replace(/\W+/g, '')}`);
    await page.getByRole('button', { name: pick }).click();
    await page.waitForFunction((t) => document.querySelector('#q-title')?.textContent !== t, await title());
  }

  // Two-part question
  assert.match(await title(), /shadow/);
  await page.getByRole('button', { name: /Squares and blocks/ }).click();
  assert.ok(await page.getByRole('button', { name: 'Next →' }).isDisabled(), 'both parts are required');
  await page.getByRole('button', { name: /Small and compact/ }).click();
  await shot('10-body');
  await noOverflow('body');
  await next();

  // Exactly two features, one of them custom
  assert.match(await title(), /exactly two/);
  await page.getByRole('button', { name: /Goggles/ }).click();
  assert.ok(await page.getByRole('button', { name: 'Next →' }).isDisabled(), 'one feature is not enough');
  await page.getByLabel('Add your own').fill('a bell collar');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  assert.ok(await page.getByRole('button', { name: /Antennae/ }).isDisabled(), 'a third feature is blocked');
  await shot('11-features');
  await next();

  assert.match(await title(), /colors/);
  await shot('12-palette');
  await page.getByRole('button', { name: /Ocean Arcade/ }).click();
  await page.waitForFunction(() => document.querySelector('#q-title')?.textContent?.includes('needs a name'));

  // Name: surprise button fills something, then type our own
  await page.getByRole('button', { name: 'Surprise me' }).click();
  assert.ok((await page.getByLabel(/character’s name is/).inputValue()).length > 1, 'Surprise me suggests a name');
  await page.getByLabel(/character’s name is/).fill('Marlow');
  await page.getByLabel(/never leave home without/).fill('a lucky bottle cap');
  await shot('13-name');
  await next();

  // ---------- results ----------
  await page.getByRole('heading', { name: 'Meet Marlow.' }).waitFor();
  await page.waitForTimeout(600);
  await shot('20-results');
  await noOverflow('results');
  const briefText = await page.locator('.brief').innerText();
  for (const s of ['Marlow', 'A half-cat librarian', 'Quiet and observant', 'An ordinary school with unusual secrets', 'Mystery', 'small and compact half-cat librarian', 'Goggles pushed up on their head', 'a bell collar', 'a lucky bottle cap', 'Ocean Arcade', 'keeps saying no stands in the way'])
    assert.ok(briefText.includes(s), `${label}: brief is missing "${s}"`);
  const shownPrompt = await page.locator('.prompt').innerText();
  assert.ok(shownPrompt.includes('GENERATE ONE IMAGE containing 5 distinct full-body'), 'prompt asks for one image with 5 sketches');
  assert.ok(shownPrompt.includes('Character Type: A half-cat librarian'), 'prompt contains the brief');

  // Edit: change the weakness and the name; brief, prompt and story all follow
  await page.getByRole('button', { name: /Edit My Character/ }).first().click();
  await page.getByLabel('Biggest Weakness').fill('Talks to vending machines.');
  await page.getByLabel('Character Name').fill('Juniper');
  await shot('21-editing');
  await page.getByRole('button', { name: /Done Editing/ }).first().click();
  await page.getByRole('heading', { name: 'Meet Juniper.' }).waitFor();
  const edited = await page.locator('.prompt').innerText();
  assert.ok(edited.includes('Biggest Weakness: Talks to vending machines.'), 'edit reached the prompt');
  assert.ok(edited.includes('Juniper wants to uncover the truth') && !edited.includes('Marlow'), 'rename reached the story');

  // Refresh on results keeps edits
  await page.reload();
  await page.getByRole('heading', { name: 'Meet Juniper.' }).waitFor();

  // Clipboard
  if (!blockClipboard) {
    await page.getByRole('button', { name: 'Copy Prompt', exact: true }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(clip.replace(/\r/g, ''), (await page.locator('.prompt').innerText()).trim(), 'clipboard holds the exact prompt shown');
    assert.ok(clip.startsWith('I am a beginner Digital Arts & Animation student') && clip.endsWith('Please generate the visual concept sheet now.'));
    await page.getByRole('button', { name: 'Copy Character Brief' }).click();
    const clip2 = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(clip2.startsWith('CHARACTER BRIEF') && clip2.includes('Talks to vending machines.'), 'brief copied');
    await page.getByRole('button', { name: 'Copy 5-Sketch AI Prompt' }).waitFor();
  } else {
    // Both copy methods blocked -> a select-and-copy box appears with the full prompt
    await page.getByRole('button', { name: 'Copy Prompt', exact: true }).click();
    const manual = await page.getByRole('dialog').locator('textarea').inputValue();
    assert.ok(manual.includes('Please generate the visual concept sheet now.'), 'manual copy fallback shows the whole prompt');
    await shot('22-manual-copy');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
  }

  // PDF
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Results as PDF' }).click()]);
  assert.equal(download.suggestedFilename(), 'juniper-character-brief.pdf');
  const pdfPath = await download.path();
  const size = readFileSync(pdfPath).length;
  assert.ok(size > 4000, 'PDF has content');
  if (shots) await download.saveAs(`${shots}/${label}.pdf`);

  // Go back into the quiz from results, change an answer, edits survive
  await page.getByRole('button', { name: /Edit My Character/ }).first().click();
  await page.getByRole('button', { name: /change my quiz answers/ }).click();
  assert.match(await title(), /room full of strangers/);
  await page.getByRole('button', { name: /snack table/ }).click();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(450);
    const b = page.getByRole('button', { name: /Next|Reveal/ });
    if (await b.isVisible().catch(() => false)) await b.click();
  }
  await page.getByRole('heading', { name: 'Meet Juniper.' }).waitFor();
  assert.ok((await page.locator('.brief').innerText()).includes('Awkward but easy to like'), 'changed quiz answer updated the brief');
  assert.ok((await page.locator('.brief').innerText()).includes('Talks to vending machines.'), 'manual edit survived');

  // Start over
  await page.getByRole('button', { name: 'Start Over' }).click();
  await shot('23-confirm');
  await page.getByRole('button', { name: 'Yes, start over' }).click();
  await page.getByRole('button', { name: /Start the quiz/ }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('character-creator.v1') && JSON.parse(localStorage.getItem('character-creator.v1')).answers.name), undefined);

  assert.deepEqual(errors, [], `${label}: console errors`);
  await ctx.close();
  console.log(`PASS ${label} (pdf ${size} bytes)`);
}

try {
  await run('desktop', { viewport: { width: 1366, height: 768 } });
  await run('phone', { ...devices['iPhone 13'], defaultBrowserType: undefined });
  await run('tablet', { viewport: { width: 820, height: 1180 }, hasTouch: true });
  await run('no-clipboard', { viewport: { width: 390, height: 800 }, hasTouch: true }, { blockClipboard: true });
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

// Browser test of the cloud features (Suggest a Tool, My Projects) against a stand-in for the
// hosting platform's services (scripts/fake-claude.js). Usage: npm run build && node scripts/e2e-cloud.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { preview } from 'vite';

const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 4181;
const URL = `http://localhost:${PORT}`; // site address
const shots = process.env.SHOTS_DIR;
if (shots) mkdirSync(shots, { recursive: true });
const FAKE = readFileSync(new globalThis.URL('./fake-claude.js', import.meta.url), 'utf8');
// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

const server = await preview({ preview: { port: PORT, strictPort: true } });
const browser = await chromium.launch();
let passed = 0;
const check = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};
async function expectCount(locator, n, msg = '') {
  const end = Date.now() + 4000;
  let c;
  while ((c = await locator.count()) !== n && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  assert.equal(c, n, msg);
}

async function run(label, viewport) {
  console.log(`\n${label} (${viewport.width}×${viewport.height})`);
  const ctx = await browser.newContext({ viewport, colorScheme: 'light' });
  await ctx.addInitScript(FAKE);
  const errors = [];
  const newPage = async (config) => {
    const page = await ctx.newPage();
    if (config) await page.addInitScript((c) => (window.__FAKE_CLAUDE_CONFIG__ = c), config);
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    return page;
  };
  /** Click a folder tile and wait until that folder is the one shown. */
  const enter = async (p, name) => {
    await p.locator('ul[aria-label="Folders"] > li', { hasText: name }).click();
    await p.locator('nav[aria-label="Folder path"] [aria-current="location"]', { hasText: name }).waitFor();
  };
  const shot = (page, name) => shots && page.screenshot({ path: `${shots}/${label}-${name}.png`, fullPage: true });

  // ---------------- Suggestions ----------------
  const guest = await newPage({ userId: 'u_guest', isOwner: false });
  await guest.goto(URL + '/suggest');
  await guest.getByLabel('What tool should we add?').waitFor();
  assert.equal(await guest.getByRole('tab', { name: 'Inbox' }).count(), 0, 'guests have no inbox');
  await guest.getByRole('button', { name: 'Send suggestion' }).click();
  await guest.getByText('Give your idea a short name.').waitFor();
  await guest.getByLabel('What tool should we add?').fill('Font Pairing Helper');
  await guest.getByLabel('What would it help you do?').fill('Suggest heading + body font combos.');
  await guest.getByRole('button', { name: 'Creative', exact: true }).click();
  await guest.getByRole('button', { name: 'Send suggestion' }).click();
  await guest.getByText('Thanks! Your suggestion was sent.').waitFor();
  const mine = guest.locator('ul[aria-label="Your suggestions"] > li');
  await expectCount(mine, 1);
  assert.match(await mine.first().innerText(), /Font Pairing Helper[\s\S]*Received/);
  await shot(guest, '01-suggest');
  check('guest sends a suggestion; validation and confirmation shown; no inbox for guests');

  const owner = await newPage({ userId: 'u_owner', isOwner: true });
  await owner.goto(URL + '/suggest');
  await owner.getByRole('tab', { name: 'Inbox' }).click();
  const inbox = owner.locator('ul[aria-label="All suggestions"] > li');
  await expectCount(inbox, 1);
  assert.match(await inbox.first().innerText(), /Font Pairing Helper[\s\S]*Guest Person/);
  await owner.getByLabel('Status for Font Pairing Helper').selectOption('planned');
  await shot(owner, '02-inbox');
  await guest.reload();
  await guest.locator('ul[aria-label="Your suggestions"] > li', { hasText: 'Planned' }).waitFor();
  check('owner sees it in the Inbox with the sender’s name; status change reaches the sender');

  await guest.getByRole('button', { name: 'Withdraw suggestion “Font Pairing Helper”' }).click();
  await expectCount(guest.locator('ul[aria-label="Your suggestions"] > li'), 0);
  await owner.reload();
  await owner.getByRole('tab', { name: 'Inbox' }).click();
  await owner.getByText('No suggestions yet').waitFor();
  await guest.close();
  check('withdrawing a suggestion removes it from the inbox');

  // ---------------- Projects ----------------
  const page = owner;
  await page.goto(URL + '/projects');
  await page.getByText('No projects yet').waitFor();
  await page.getByRole('link', { name: 'New project' }).first().click();
  await page.getByRole('heading', { level: 1, name: 'New Project' }).waitFor();
  await page.getByText('Brand Identity').click();
  await page.getByText('Project brief.md in Brief').waitFor();
  await page.getByLabel('Project name').fill('Acme Rebrand');
  await shot(page, '03-new-project');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('heading', { level: 1, name: 'Acme Rebrand' }).waitFor();
  const folders = page.locator('ul[aria-label="Folders"] > li');
  await expectCount(folders, 6);
  check('create a project from the Brand Identity template: 6 folders made');

  await enter(page, 'Brief');
  await page.locator('ul[aria-label="Files"] > li', { hasText: 'Project brief.md' }).waitFor();
  check('template starter file (Project brief.md) is created in Brief');

  // Upload into Logo/Sketches; a .psd is refused with a clear reason
  await page.getByRole('button', { name: 'All files' }).click();
  await enter(page, 'Logo');
  await enter(page, 'Sketches');
  await page.getByRole('button', { name: 'Upload files' }).first().waitFor();
  await page.getByTestId('upload-input').setInputFiles([
    { name: 'logo-v1.png', mimeType: 'image/png', buffer: PNG },
    { name: 'art.psd', mimeType: 'image/vnd.adobe.photoshop', buffer: Buffer.from('8BPS') },
  ]);
  await page.getByText('.psd files can’t be stored yet').waitFor();
  const files = page.locator('ul[aria-label="Files"] > li');
  await expectCount(files, 1);
  assert.match(await files.first().innerText(), /logo-v1\.png/);
  await shot(page, '04-uploaded');
  check('upload a PNG into a nested folder; unsupported .psd refused with a reason');

  // Download
  await page.getByRole('button', { name: 'Download logo-v1.png' }).click();
  await page.getByText('Downloaded logo-v1.png.').waitFor();
  assert.equal((await page.evaluate(() => window.__downloads.at(-1))).filename, 'logo-v1.png');
  check('download saves the file with its name');

  // New version + versions dialog
  await page.getByRole('button', { name: 'More actions for logo-v1.png' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Upload new version' }).click()]);
  await chooser.setFiles({ name: 'logo-v2.png', mimeType: 'image/png', buffer: Buffer.concat([PNG, Buffer.alloc(10)]) });
  await page.getByText('logo-v1.png updated to version 2.').waitFor();
  assert.match(await files.first().innerText(), /v2/);
  await page.getByRole('button', { name: 'More actions for logo-v1.png' }).click();
  await page.getByRole('button', { name: 'Versions (2)' }).click();
  await expectCount(page.locator('ul[aria-label="Versions"] > li'), 2);
  await page.getByRole('button', { name: 'Download version 1' }).click();
  await page.getByText('Downloaded logo-v1.png.').waitFor();
  await page.keyboard.press('Escape');
  check('upload a new version keeps history; older versions downloadable');

  // Rename, new folder, move
  await page.getByRole('button', { name: 'More actions for logo-v1.png' }).click();
  await files.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('File name').fill('acme-logo.png');
  await page.getByRole('button', { name: 'Save' }).click();
  await files.filter({ hasText: 'acme-logo.png' }).waitFor();
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill('Rejected');
  await page.getByRole('button', { name: 'Create folder' }).click();
  await folders.filter({ hasText: 'Rejected' }).waitFor();
  await page.getByRole('button', { name: 'More actions for acme-logo.png' }).click();
  await files.getByRole('button', { name: 'Move' }).click();
  await page.getByRole('dialog').getByText('Final', { exact: true }).click();
  await page.getByRole('button', { name: 'Move here' }).click();
  await expectCount(files, 0);
  await page.getByRole('button', { name: 'Logo', exact: true }).click();
  await enter(page, 'Final');
  await expectCount(files, 1);
  check('rename a file, create a folder, move a file between folders');

  // Persistence + "another computer" (a fresh page reading from storage)
  await page.reload();
  await page.getByRole('heading', { level: 1, name: 'Acme Rebrand' }).waitFor();
  await expectCount(files, 1);
  const other = await newPage({ userId: 'u_owner', isOwner: true });
  await other.goto(URL + '/projects');
  await other.getByRole('link', { name: /Acme Rebrand/ }).click();
  await enter(other, 'Logo');
  await enter(other, 'Final');
  await other.getByRole('button', { name: 'Download acme-logo.png' }).click();
  await other.getByText('Downloaded acme-logo.png.').waitFor();
  await other.close();
  check('project survives reload and opens in a fresh session with files downloadable');

  // Privacy: someone else can't see this person's projects
  const stranger = await newPage({ userId: 'u_guest', isOwner: false });
  await stranger.goto(URL + '/projects');
  await stranger.getByText('No projects yet').waitFor();
  await stranger.close();
  check('another person cannot see your projects');

  // Dashboard recent projects
  await page.goto(URL + '/');
  await page.locator('ul[aria-label="Recent projects"] > li', { hasText: 'Acme Rebrand' }).waitFor();
  await shot(page, '05-dashboard');
  check('dashboard shows recent projects');

  // Delete folder (with contents), then the project
  await page.goto(URL + '/projects');
  await page.getByRole('link', { name: /Acme Rebrand/ }).click();
  await enter(page, 'Logo');
  await page.getByRole('button', { name: 'Delete folder' }).click();
  await page.getByRole('button', { name: 'Delete folder' }).last().click();
  await page.getByRole('button', { name: 'All files', exact: true }).waitFor();
  await expectCount(folders, 5);
  const assetsLeft = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fake-claude:assets') || '{}')).length);
  assert.equal(assetsLeft, 1, 'only the brief remains stored after deleting the Logo folder');
  await page.locator('header').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete project' }).click();
  await page.getByRole('heading', { level: 1, name: 'My Projects' }).waitFor();
  await page.getByText('No projects yet').waitFor();
  const left = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fake-claude:assets') || '{}')).length);
  assert.equal(left, 0, 'deleting the project removes its stored files');
  check('delete a folder with its files, and delete a whole project (stored files cleaned up)');

  // Signed out
  const out = await newPage({ signedOut: true });
  await out.goto(URL + '/projects');
  await out.getByText('Sign in to use this').waitFor();
  await out.close();
  check('signed-out visitors are asked to sign in');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  assert.deepEqual(errors, [], `console errors: ${errors.join('\n')}`);
  check('no console errors, no sideways scrolling');
  await ctx.close();
}

try {
  await run('desktop', { width: 1280, height: 900 });
  await run('mobile', { width: 390, height: 844 });
  console.log(`\nAll ${passed} cloud checks passed.`);
} finally {
  await browser.close();
  server.httpServer.close();
}

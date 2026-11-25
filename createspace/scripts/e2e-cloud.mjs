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

  // ---------------- Business Dashboard ----------------
  await page.goto(URL + '/tools/business-dashboard');
  await page.getByRole('heading', { name: 'Your business at a glance' }).waitFor();
  const localDay = (offset) => page.evaluate((o) => { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }, offset);
  const dlg = page.getByRole('dialog');
  // validation
  await page.getByRole('button', { name: 'Add income' }).first().click();
  await dlg.getByRole('button', { name: 'Add income' }).click();
  await dlg.getByText('Enter an amount').waitFor();
  await dlg.getByLabel('Amount (USD)').fill('1,200.50');
  await dlg.getByLabel('Client (optional)').fill('Acme Studio');
  await dlg.getByLabel('What was it for? (optional)').fill('Logo design');
  await dlg.getByRole('button', { name: 'Add income' }).click();
  await dlg.waitFor({ state: 'detached' });
  const stat = (label) => page.locator('.tile', { hasText: label }).first().innerText();
  assert.match(await stat('Earned this month'), /\$1,200\.50/);
  // pending, overdue
  await page.getByRole('button', { name: 'Add income' }).first().click();
  await dlg.getByLabel('Amount (USD)').fill('300');
  await dlg.getByRole('button', { name: 'Waiting for payment' }).click();
  await dlg.getByLabel('Payment due (optional)').fill(await localDay(-3));
  await dlg.getByLabel('Client (optional)').fill('Acme Studio');
  await dlg.getByRole('button', { name: 'Add income' }).click();
  assert.match(await stat('Waiting to be paid'), /\$300\.00[\s\S]*overdue/);
  await page.locator('ul[aria-label="Coming up"] > li', { hasText: '3 days overdue' }).waitFor();
  check('Business Dashboard: empty start, validation, paid + overdue income show in the overview');

  // expense → profit
  await page.getByRole('button', { name: 'Add expense' }).first().click();
  await dlg.getByLabel('Amount (USD)').fill('49.99');
  await dlg.getByLabel('What was it? (optional)').fill('Font license');
  await dlg.getByRole('button', { name: 'Add expense' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.match(await stat('Profit in'), /\$1,150\.51/);
  // contract with file, ending soon
  await page.getByRole('button', { name: 'Add contract' }).first().click();
  await dlg.getByLabel('Contract name').fill('Brand package');
  await dlg.getByLabel('Client (optional)').fill('Acme Studio');
  await dlg.getByRole('button', { name: 'Signed' }).click();
  await dlg.getByLabel('Total value (optional) (USD)').fill('2500');
  await dlg.getByLabel('End / delivery date (optional)').fill(await localDay(10));
  await dlg.locator('input[type=file]').setInputFiles({ name: 'contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await dlg.getByText('contract.pdf').waitFor();
  await dlg.getByRole('button', { name: 'Add contract' }).click();
  await page.locator('ul[aria-label="Coming up"] > li', { hasText: 'in 10 days' }).waitFor();
  await shot(page, '06-business-overview');
  check('expenses reduce profit; a signed contract ending soon appears in Coming up');

  await page.getByRole('tab', { name: 'Contracts' }).click();
  await page.getByRole('button', { name: 'Download contract.pdf' }).click();
  await page.getByText('Downloaded contract.pdf.').waitFor();
  await page.getByRole('tab', { name: 'Clients' }).click();
  const client = page.locator('ul[aria-label="Client list"] > li');
  await expectCount(client, 1);
  assert.match(await client.first().innerText(), /Acme Studio[\s\S]*1 contract \(1 active\)[\s\S]*\$1,200\.50[\s\S]*\$300\.00/);
  await page.getByRole('tab', { name: 'Income' }).click();
  await page.getByRole('button', { name: 'Mark paid' }).click();
  await expectCount(page.getByRole('button', { name: 'Mark paid' }), 0);
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const csv = await page.evaluate(() => window.__downloads.at(-1));
  assert.match(csv.filename, /^createspace-income-\d{4}-\d{2}-\d{2}\.csv$/);
  check('contract file downloads; clients total up; mark paid; export income CSV');

  // currency, persistence, privacy, projects unaffected
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.getByLabel('Currency').selectOption('EUR');
  assert.match(await stat('Earned this month'), /€/);
  await page.reload();
  await page.getByRole('tab', { name: 'Overview' }).waitFor();
  assert.match(await stat('Earned this month'), /€\s?1,500\.50|1,500\.50\s?€/);
  const other2 = await newPage({ userId: 'u_guest', isOwner: false });
  await other2.goto(URL + '/tools/business-dashboard');
  await other2.getByRole('heading', { name: 'Your business at a glance' }).waitFor();
  await other2.close();
  await page.goto(URL + '/projects');
  await page.getByText('No projects yet').waitFor();
  check('currency choice and data persist after reload; private to each person; not shown as projects');

  await page.goto(URL + '/tools/business-dashboard');
  await page.getByRole('tab', { name: 'Contracts' }).click();
  await page.getByRole('button', { name: 'Delete Brand package' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Keep track of client agreements').waitFor();
  const filesLeft = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fake-claude:assets') || '{}')).length);
  assert.equal(filesLeft, 0, 'deleting a contract removes its attached file');
  check('deleting a contract removes its attached file');

  // ---------------- Background Remover ----------------
  await page.goto(URL + '/tools/background-remover');
  await page.getByRole('heading', { name: 'Drop an image here' }).waitFor();
  // a figure on a busy, noisy background
  const photo = Buffer.from(
    (await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 640, 480); g.addColorStop(0, '#6a8caf'); g.addColorStop(1, '#c9b27c'); x.fillStyle = g; x.fillRect(0, 0, 640, 480);
      let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 4000; i++) { x.fillStyle = `hsla(${rnd() * 360},40%,60%,.35)`; x.fillRect(rnd() * 640, rnd() * 480, 6, 6); }
      x.fillStyle = '#e0a57a'; x.beginPath(); x.arc(320, 150, 55, 0, 7); x.fill();
      x.fillStyle = '#c0392b'; x.beginPath(); x.ellipse(320, 340, 110, 140, 0, 0, 7); x.fill();
      return c.toDataURL('image/png');
    })).split(',')[1],
    'base64',
  );
  await page.getByTestId('image-input').first().setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: photo });
  await page.getByText('Subject detected').waitFor({ timeout: 60000 });
  const alphaAt = (x, y) => page.evaluate(([x, y]) => { const c = document.querySelector('[data-testid=stage]'); return c.getContext('2d').getImageData(x, y, 1, 1).data[3]; }, [x, y]);
  const waitAlpha = async (x, y, ok, what) => {
    const end = Date.now() + 4000; let a;
    while (!ok((a = await alphaAt(x, y))) && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    assert.ok(ok(a), `${what}: alpha ${a}`);
  };
  await waitAlpha(5, 5, (a) => a === 0, 'background corner removed');
  await waitAlpha(320, 340, (a) => a === 255, 'subject kept');
  await shot(page, '07-bg-detected');
  check('Background Remover: AI detects the subject on a busy background (runs in the browser)');

  // erase the head with a brush stroke, undo, then restore with the brush
  await page.getByRole('slider', { name: /Brush size/ }).fill('120');
  let box;
  const locate = async () => {
    await page.getByTestId('stage').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -80)); // keep it clear of the bottom tab bar
    box = await page.getByTestId('stage').boundingBox();
  };
  const toScreen = (x, y) => [box.x + (x / 640) * box.width, box.y + (y / 480) * box.height];
  await locate();
  await page.mouse.move(...toScreen(300, 150));
  await page.mouse.down();
  await page.mouse.move(...toScreen(340, 150), { steps: 5 });
  await page.mouse.up();
  await waitAlpha(320, 150, (a) => a === 0, 'erase brush removes the head');
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitAlpha(320, 150, (a) => a === 255, 'undo brings it back');
  await page.getByRole('button', { name: 'Redo' }).click();
  await waitAlpha(320, 150, (a) => a === 0, 'redo removes it again');
  await page.getByRole('radio', { name: 'Restore' }).click();
  await locate();
  await page.mouse.move(...toScreen(320, 150));
  await page.mouse.down();
  await page.mouse.up();
  await waitAlpha(320, 150, (a) => a === 255, 'restore brush brings it back');
  check('erase and restore brushes work; undo/redo work');

  // pick-color removes the red body; background color + download
  await page.getByRole('radio', { name: 'Pick color' }).click();
  await locate();
  await page.mouse.click(...toScreen(320, 380));
  await page.getByText(/Removed [\d,]+ pixels of that color/).waitFor();
  await waitAlpha(320, 380, (a) => a === 0, 'picked color removed');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('radio', { name: 'White' }).click();
  await page.getByRole('button', { name: 'Download PNG' }).click();
  await page.getByText('Downloaded portrait-new-bg.png.').waitFor();
  const dl = await page.evaluate(() => window.__downloads.at(-1));
  assert.equal(dl.filename, 'portrait-new-bg.png');
  assert.ok(dl.size > 1000, 'png has content');
  check('pick-a-color removal; white background; PNG download');

  // save into My Projects (creates "My Exports" when there are none)
  await page.getByRole('radio', { name: 'Transparent' }).click();
  await page.getByRole('button', { name: 'Save to My Projects' }).click();
  await page.getByRole('button', { name: 'Create “My Exports” and save' }).click();
  await page.getByText('Saved portrait-no-bg.png to My Exports.').waitFor();
  await page.goto(URL + '/projects');
  await page.getByRole('link', { name: /My Exports/ }).click();
  await page.locator('ul[aria-label="Files"] > li', { hasText: 'portrait-no-bg.png' }).waitFor();
  await page.locator('header').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete project' }).click();
  await page.getByText('No projects yet').waitFor();
  check('save the cut-out into My Projects');

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

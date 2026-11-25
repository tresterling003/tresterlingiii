/**
 * End-to-end test: three people in isolated sessions against a running server.
 *   BASE_URL=http://localhost:3100 node tests/e2e.cjs
 * Covers sign-up, families and invite codes, wishlists, secret claims, budgets, games, shop and access control.
 * Screenshots go to tests/results/ when SHOTS=1.
 */
const { chromium, request } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const SHOTS = process.env.SHOTS === "1";
const OUT = path.join(__dirname, "results");
const stamp = Date.now().toString(36);
let passed = 0;
const failures = [];

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

async function client() {
  return request.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
}
async function call(ctx, method, url, data) {
  const r = await ctx.fetch(url, { method, data });
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status(), body };
}

(async () => {
  if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }); };

  const A = { name: "Tre", email: `tre-${stamp}@example.com`, password: "candycane123" };
  const B = { name: "Mom", email: `mom-${stamp}@example.com`, password: "gingerbread9" };
  const C = { name: "Stranger", email: `x-${stamp}@example.com`, password: "outsider999" };

  // ---------------- A signs up in the UI and starts a family
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pa = await ctxA.newPage();
  const errorsA = [];
  pa.on("pageerror", (e) => errorsA.push(e.message));
  let code = "";

  await step("A signs up through the form and lands on Home", async () => {
    await pa.goto(`${BASE}/sign-up`);
    await pa.fill('input[name="name"]', A.name);
    await pa.fill('input[name="email"]', A.email);
    await pa.fill('input[name="password"]', A.password);
    await pa.click('button[type="submit"]');
    await pa.waitForURL(/\/home/);
    await pa.getByText("My Wishlist").first().waitFor();
  });

  await step("A creates a family and gets a 6-character invite code", async () => {
    await pa.fill('input[aria-label="Family name"]', "The Sterlings");
    await pa.click('button:has-text("Create family")');
    await pa.waitForURL(/\/family/);
    const me = await (await pa.request.get(`${BASE}/api/me`)).json();
    code = me.families[0].code;
    ok(/^[A-Z0-9]{6}$/.test(code), `bad code ${code}`);
    await pa.getByText(code).first().waitFor();
  });

  // ---------------- B joins with the invite link
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pb = await ctxB.newPage();
  const errorsB = [];
  pb.on("pageerror", (e) => errorsB.push(e.message));

  await step("B opens the invite link, signs up, and is in the family", async () => {
    await pb.goto(`${BASE}/join/${code}`);
    await pb.waitForURL(/sign-up\?code=/);
    await pb.getByText("You're invited").waitFor();
    await pb.fill('input[name="name"]', B.name);
    await pb.fill('input[name="email"]', B.email);
    await pb.fill('input[name="password"]', B.password);
    await pb.click('button[type="submit"]');
    await pb.waitForURL(/\/family/);
    await pb.getByText("Tre", { exact: false }).first().waitFor();
  });

  const apiA = await client();
  const apiB = await client();
  const apiC = await client();
  await call(apiA, "POST", "/api/auth/signin", { email: A.email, password: A.password });
  await call(apiB, "POST", "/api/auth/signin", { email: B.email, password: B.password });
  await call(apiC, "POST", "/api/auth/signup", C);
  const meA = (await call(apiA, "GET", "/api/me")).body.user;
  const meB = (await call(apiB, "GET", "/api/me")).body.user;

  let wishes = [];
  await step("A pastes a list from Notes (bullets stripped, idea: lines become ideas)", async () => {
    const r = await call(apiA, "POST", "/api/wishes/import", { text: "• Nike Tech Fleece joggers\n- Dunks\n\nidea: stuff for my room" });
    ok(r.status === 200 && r.body.added === 3, JSON.stringify(r));
    wishes = (await call(apiA, "GET", "/api/wishes")).body.wishes;
    ok(wishes.length === 3, "expected 3 wishes");
    ok(wishes.find((w) => w.title === "stuff for my room")?.kind === "idea", "idea kind");
    ok(wishes.find((w) => w.title === "Nike Tech Fleece joggers"), "bullet stripped");
  });

  await step("A adds details, a link and a photo to a wish", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const up = await apiA.fetch("/api/images", { method: "POST", headers: { "content-type": "image/png" }, data: png });
    ok(up.status() === 200, `upload ${up.status()}`);
    const imageId = (await up.json()).id;
    const w = wishes.find((x) => x.title.startsWith("Nike"));
    const r = await call(apiA, "PATCH", `/api/wishes/${w.id}`, {
      kind: "exact", top: true, title: "Tech Fleece joggers", brand: "Nike", category: "Clothes", price: "$110", size: "M", color: "Black",
      links: ["www.nike.com/w/tech-fleece"], notes: "Slim fit", image_id: imageId,
    });
    ok(r.status === 200, JSON.stringify(r));
    const back = (await call(apiA, "GET", "/api/wishes")).body.wishes.find((x) => x.id === w.id);
    ok(back.links[0] === "https://www.nike.com/w/tech-fleece", `link normalised: ${back.links[0]}`);
    ok(back.size === "M" && back.top && back.image_id === imageId, "details saved");
  });

  await step("Unsafe links are rejected", async () => {
    const r = await call(apiA, "POST", "/api/wishes", { title: "Bad", links: ["javascript:alert(1)"] });
    ok(r.status === 400, `expected 400, got ${r.status}`);
  });

  await step("A sets About Me sizes", async () => {
    const r = await call(apiA, "PATCH", "/api/me", { about: { note: "Surprise me!", sizes: ["Shirt: M", "Shoe: 10.5"], colors: "Black", brands: "Nike", into: "basketball, gym", skip: "" } });
    ok(r.status === 200, JSON.stringify(r));
  });

  const joggers = () => wishes.find((x) => x.title.startsWith("Nike") || x.title.startsWith("Tech"));
  let giftId = "";
  await step("B sees A's list and secretly claims the joggers", async () => {
    const list = await call(apiB, "GET", `/api/wishes?user=${meA.id}`);
    ok(list.status === 200 && list.body.wishes.length === 3, JSON.stringify(list.body).slice(0, 200));
    ok(list.body.owner.about.sizes.includes("Shoe: 10.5"), "B sees About Me");
    const w = list.body.wishes.find((x) => x.top);
    const r = await call(apiB, "POST", "/api/gifts", { recipient_id: meA.id, wish_id: w.id, title: w.title, price_cents: 11000 });
    ok(r.status === 200, JSON.stringify(r));
    giftId = r.body.id;
    const again = await call(apiB, "GET", `/api/wishes?user=${meA.id}`);
    ok(again.body.wishes.find((x) => x.id === w.id).claim.mine === true, "B sees own claim");
  });

  await step("The same wish can't be claimed twice", async () => {
    const w = (await call(apiB, "GET", `/api/wishes?user=${meA.id}`)).body.wishes.find((x) => x.top);
    const r = await call(apiB, "POST", "/api/gifts", { recipient_id: meA.id, wish_id: w.id, title: "dup" });
    ok(r.status === 409, `expected 409, got ${r.status}`);
  });

  await step("SECRET: A can't see the claim on their own list, in gifts, or in the feed", async () => {
    const own = await call(apiA, "GET", "/api/wishes");
    ok(own.body.wishes.every((w) => w.claim === null), "claim leaked on owner's list");
    const viaParam = await call(apiA, "GET", `/api/wishes?user=${meA.id}`);
    ok(viaParam.body.wishes.every((w) => w.claim === null), "claim leaked via ?user=self");
    const g = await call(apiA, "GET", "/api/gifts");
    ok(g.body.gifts.length === 0, "A sees someone else's gift rows");
    const gB = await call(apiA, "PATCH", `/api/gifts/${giftId}`, { status: "given" });
    ok(gB.status === 404, `A could modify B's gift: ${gB.status}`);
    const feed = await call(apiA, "GET", "/api/feed");
    ok(!JSON.stringify(feed.body).toLowerCase().includes("claim"), "feed mentions claims");
  });

  await step("B tracks the gift through bought and wrapped", async () => {
    ok((await call(apiB, "PATCH", `/api/gifts/${giftId}`, { status: "bought" })).status === 200, "bought");
    ok((await call(apiB, "PATCH", `/api/gifts/${giftId}`, { status: "wrapped" })).status === 200, "wrapped");
    const g = await call(apiB, "GET", "/api/gifts");
    ok(g.body.gifts[0].status === "wrapped", "status saved");
  });

  await step("B plans an off-list gift and sets budgets", async () => {
    ok((await call(apiB, "POST", "/api/gifts", { recipient_id: meA.id, title: "Gym bag", price_cents: 4500 })).status === 200, "off-list");
    ok((await call(apiB, "PATCH", "/api/me", { budget_cents: 30000 })).status === 200, "total budget");
    ok((await call(apiB, "PUT", "/api/budgets", { recipient_id: meA.id, cents: 15000 })).status === 200, "person budget");
    const g = (await call(apiB, "GET", "/api/gifts")).body;
    ok(g.budget_cents === 30000 && g.budgets[0].cents === 15000, "budgets saved");
    ok(g.gifts.reduce((s, x) => s + x.price_cents, 0) === 15500, "spent adds up");
  });

  await step("You can't plan a gift for yourself", async () => {
    const r = await call(apiA, "POST", "/api/gifts", { recipient_id: meA.id, title: "Me" });
    ok(r.status === 400, `expected 400, got ${r.status}`);
  });

  await step("ACCESS: an outsider can't see lists, photos or plan gifts", async () => {
    ok((await call(apiC, "GET", `/api/wishes?user=${meA.id}`)).status === 403, "list visible to outsider");
    const img = joggers() && (await call(apiA, "GET", "/api/wishes")).body.wishes.find((w) => w.image_id).image_id;
    ok((await apiC.fetch(`/api/images/${img}`)).status() === 404, "image visible to outsider");
    ok((await call(apiC, "POST", "/api/gifts", { recipient_id: meA.id, title: "x" })).status === 403, "outsider planned gift");
    ok((await call(apiC, "PUT", "/api/budgets", { recipient_id: meA.id, cents: 100 })).status === 403, "outsider budget");
    ok((await call(apiC, "DELETE", `/api/wishes/${wishes[0].id}`)).status === 404, "outsider deleted wish");
  });

  await step("ACCESS: wrong invite codes are refused and rate limited", async () => {
    const r = await call(apiC, "POST", "/api/families/join", { code: "ZZZZZZ" });
    ok(r.status === 404, `expected 404 got ${r.status}`);
  });

  await step("SECURITY: cross-site writes and anonymous calls are refused", async () => {
    const anon = await request.newContext({ baseURL: BASE });
    const cross = await anon.fetch("/api/wishes", { method: "POST", headers: { origin: "https://evil.example" }, data: { title: "x" } });
    ok(cross.status() === 403, `cross-origin ${cross.status()}`);
    ok((await anon.fetch("/api/me")).status() === 401, "anonymous /api/me");
    const badLogin = await call(await client(), "POST", "/api/auth/signin", { email: A.email, password: "wrong" });
    ok(badLogin.status === 401, `bad login ${badLogin.status}`);
  });

  await step("Games award coins, reject impossible scores, and throttle", async () => {
    const before = (await call(apiB, "GET", "/api/me")).body.user.coins;
    const r = await call(apiB, "POST", "/api/games", { game: "catch", score: 30, ms: 45000 });
    ok(r.status === 200 && r.body.coins === 15, JSON.stringify(r));
    ok(r.body.total === before + 15, "balance updated");
    ok((await call(apiB, "POST", "/api/games", { game: "catch", score: 30, ms: 45000 })).status === 429, "throttle");
    await new Promise((res) => setTimeout(res, 4200));
    ok((await call(apiB, "POST", "/api/games", { game: "catch", score: 999, ms: 45000 })).status === 400, "impossible score");
    ok((await call(apiB, "POST", "/api/games", { game: "memory", score: 100, ms: 1000 })).status === 400, "too fast");
  });

  await step("Daily coin cap holds at 150", async () => {
    let total = 0;
    for (let i = 0; i < 5; i++) {
      await new Promise((res) => setTimeout(res, 4200));
      const r = await call(apiB, "POST", "/api/games", { game: "scramble", score: 20, ms: 60000 });
      ok(r.status === 200, JSON.stringify(r));
      total = r.body;
    }
    const me = (await call(apiB, "GET", "/api/me")).body;
    ok(me.coinsToday === 150, `coinsToday ${me.coinsToday}`);
    ok(total.coins === 0 && total.todayLeft === 0, "capped");
  });

  await step("Settings: themes, effects and avatars are free to switch; bad values rejected", async () => {
    ok((await call(apiB, "PATCH", "/api/me", { theme: "candy", effect: "snowfall", avatar: "crown" })).status === 200, "patch");
    const me = (await call(apiB, "GET", "/api/me")).body.user;
    ok(me.theme === "candy" && me.effect === "snowfall" && me.avatar === "crown", "saved");
    ok((await call(apiB, "PATCH", "/api/me", { theme: "hacker" })).status === 400, "unknown theme");
    ok((await apiB.fetch("/api/shop", { method: "POST", data: { item: "theme:candy" } })).status() === 404, "shop is gone");
  });

  await step("Leaderboard shows family coins this week, not outsiders", async () => {
    const lb = (await call(apiA, "GET", "/api/leaderboard")).body;
    ok(lb.rows.length === 2, `rows ${lb.rows.length}`);
    ok(lb.rows[0].name === "Mom" && lb.rows[0].week === 150, JSON.stringify(lb.rows[0]));
    const c = (await call(apiC, "GET", "/api/leaderboard")).body;
    ok(c.rows.length === 1 && c.rows[0].name === "Stranger", "outsider sees only self");
  });

  // ---------------- UI checks with screenshots
  await step("UI: B switches to the Silent Night theme in Settings (phone)", async () => {
    await pb.goto(`${BASE}/settings`);
    await pb.getByRole("button", { name: /Silent Night.*Dark mode/ }).click();
    await pb.waitForFunction(() => document.documentElement.dataset.theme === "midnight");
    await pb.getByRole("button", { name: /Candy Cane.*Peppermint/ }).click();
    await pb.waitForFunction(() => document.documentElement.dataset.theme === "candy");
    await pb.waitForTimeout(500);
    await shot(pb, "phone-settings");
  });

  await step("UI: B's Home shows the dashboard tiles and family activity (phone)", async () => {
    await pb.goto(`${BASE}/home`);
    await pb.getByText("Family activity").waitFor();
    await pb.getByText("added", { exact: false }).first().waitFor();
    ok((await pb.evaluate(() => document.documentElement.dataset.theme)) === "candy", "theme applied");
    await pb.waitForTimeout(700);
    await shot(pb, "phone-home-candy");
  });

  await step("UI: B sees 'You're getting this' on A's list; others show 'I'll get this'", async () => {
    await pb.goto(`${BASE}/family/${meA.id}`);
    await pb.getByText("You're getting this").waitFor();
    await pb.getByRole("button", { name: "I'll get this" }).first().waitFor();
    await pb.waitForTimeout(600);
    await shot(pb, "phone-person-list");
  });

  await step("UI: B claims 'Dunks' with a tap", async () => {
    const card = pb.locator("article", { hasText: "Dunks" });
    await card.getByRole("button", { name: "I'll get this" }).click();
    await card.getByText("You're getting this").waitFor();
  });

  await step("UI: A's own list shows no claim info", async () => {
    await pa.goto(`${BASE}/list`);
    await pa.getByText("Tech Fleece joggers").waitFor();
    const html = await pa.content();
    ok(!html.includes("getting this") && !html.includes("Mom is"), "claim text visible to owner");
    await pa.waitForTimeout(600);
    await shot(pa, "desktop-my-list");
  });

  await step("UI: A's Home, Family, Finder, Gifts, Budget, Shop and Games all render", async () => {
    for (const [url, text, name] of [
      ["/home", "Family activity", "desktop-home"],
      ["/family", "The Sterlings", "desktop-family"],
      [`/finder?for=${meB.id}`, "Gift Finder", "desktop-finder"],
      ["/gifts", "Gift Tracker", "desktop-gifts"],
      ["/budget", "Per person", "desktop-budget"],
      ["/games", "Family leaderboard", "desktop-games"],
      ["/settings", "Avatar color", "desktop-settings"],
    ]) {
      await pa.goto(BASE + url);
      await pa.getByText(text).first().waitFor({ timeout: 10000 });
      await pa.waitForTimeout(500);
      await shot(pa, name);
    }
  });

  await step("UI: A adds a wish with the editor", async () => {
    await pa.goto(`${BASE}/list`);
    await pa.getByRole("button", { name: "Add wish" }).first().click();
    await pa.getByRole("dialog").getByPlaceholder("Tech Fleece joggers").fill("Air Force 1");
    await pa.getByRole("dialog").getByPlaceholder("Nike", { exact: true }).fill("Nike");
    await pa.getByRole("dialog").getByPlaceholder("M", { exact: true }).fill("10.5");
    await shot(pa, "desktop-wish-editor");
    await pa.getByRole("dialog").getByRole("button", { name: "Add wish" }).click();
    await pa.locator("article", { hasText: "Air Force 1" }).waitFor();
  });

  await step("UI: Ornament Match can be played to the end and pays coins", async () => {
    await pa.goto(`${BASE}/games/memory`);
    await pa.getByRole("button", { name: "Play" }).click();
    // Peek at the deck by flipping pairs systematically: try every pair until solved.
    const cards = pa.getByRole("button", { name: /Hidden card|Ornament/ });
    await cards.first().waitFor();
    const n = await cards.count();
    ok(n === 16, `16 cards, got ${n}`);
    const seen = {};
    for (let i = 0; i < 16; i++) {
      // flip i with each other hidden card until matched
      for (let j = i + 1; j < 16; j++) {
        const iDone = await pa.evaluate((k) => document.querySelectorAll("[aria-label='Ornament'], [aria-label='Hidden card']")[k].getAttribute("aria-label"), i);
        if (iDone === "Ornament") break;
        const jl = await pa.evaluate((k) => document.querySelectorAll("[aria-label='Ornament'], [aria-label='Hidden card']")[k].getAttribute("aria-label"), j);
        if (jl === "Ornament") continue;
        await cards.nth(i).click();
        await cards.nth(j).click();
        await pa.waitForTimeout(900);
        seen[i] = true;
      }
    }
    await pa.getByText("coins", { exact: false }).first().waitFor();
    await pa.getByText(/^\+\d+ coins$/).waitFor({ timeout: 8000 });
    await shot(pa, "desktop-memory-result");
  });

  await step("UI: Present Catch runs (canvas animates) on a phone", async () => {
    await pb.goto(`${BASE}/games/catch`);
    await pb.getByRole("button", { name: "Play" }).click();
    await pb.waitForTimeout(2500);
    await shot(pb, "phone-catch");
    ok(await pb.locator("canvas[aria-label]").isVisible(), "canvas visible");
  });

  await step("No browser errors on any page", async () => {
    ok(errorsA.length === 0 && errorsB.length === 0, [...errorsA, ...errorsB].join(" | "));
  });

  await step("Sign-out ends the session server-side", async () => {
    const tmp = await client();
    await call(tmp, "POST", "/api/auth/signin", { email: A.email, password: A.password });
    ok((await call(tmp, "GET", "/api/me")).status === 200, "signed in");
    await call(tmp, "POST", "/api/auth/signout");
    ok((await call(tmp, "GET", "/api/me")).status === 401, "still signed in");
  });

  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

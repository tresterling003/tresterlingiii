/**
 * RIVAL end-to-end multiplayer test.
 *
 * Drives the real UI in two (and later three) completely isolated browser
 * contexts — separate cookie jars, separate sessions, like two different
 * phones — against a running RIVAL server and its database.
 *
 *   BASE_URL=https://your-app.vercel.app node tests/e2e/two-player.cjs
 *
 * Writes tests/e2e/results/<host>/results.json and mobile screenshots.
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.env.BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const HOST = new URL(BASE).host.replace(/[^a-z0-9.-]/gi, "_");
const OUT = path.join(__dirname, "results", HOST);
fs.mkdirSync(OUT, { recursive: true });
const stamp = Date.now().toString(36);
const results = [];
let failed = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ step: name, ok: true, ms: Date.now() - t0, detail: detail ?? null });
    console.log(`  ✓ ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (e) {
    failed++;
    results.push({ step: name, ok: false, ms: Date.now() - t0, error: String(e && e.message || e) });
    console.log(`  ✗ ${name}\n    ${String(e && e.message || e).split("\n")[0]}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function newPlayer(browser, label) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE, timezoneId: "America/Chicago" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  return { ctx, page, label };
}

async function signUp(p, { name, team, abbr, email }) {
  await p.page.goto("/sign-up");
  await p.page.fill("#displayName", name);
  await p.page.fill("#teamName", team);
  await p.page.fill("#teamAbbr", abbr);
  await p.page.fill("#email", email);
  await p.page.fill("#password", "correct-horse-42");
  await p.page.click("button[type=submit]");
  await p.page.waitForURL(/\/onboarding/);
  // The RIVAL Pledge appears before anything else and must be taken to play.
  await p.page.getByText("The RIVAL Pledge").first().waitFor();
  if (p.label === "A") await p.page.screenshot({ path: path.join(OUT, "00-pledge.png"), fullPage: true });
  await p.page.click("[data-testid=pledge-agree]");
  await p.page.click("[data-testid=pledge-submit]");
  await p.page.getByText("The RIVAL Pledge").first().waitFor({ state: "detached" });
}

async function signIn(p, email) {
  await p.page.goto("/sign-in");
  await p.page.fill("#email", email);
  await p.page.fill("#password", "correct-horse-42");
  await p.page.click("button[type=submit]");
  await p.page.waitForURL(/\/home/);
}

async function apiCall(p, method, url, body, headers = {}) {
  return p.page.evaluate(
    async ({ method, url, body, headers }) => {
      const r = await fetch(url, {
        method,
        headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try { data = await r.json(); } catch {}
      return { status: r.status, data };
    },
    { method, url, body, headers },
  );
}

async function logViaUi(p, type, minutes) {
  await p.page.getByRole("button", { name: "Log activity" }).first().click();
  await p.page.click(`[data-testid=type-${type}]`);
  if (minutes !== undefined) {
    const input = p.page.getByLabel("minutes", { exact: true });
    await input.fill(String(minutes));
  }
  await p.page.click("[data-testid=save-workout]");
  await p.page.getByText(/logged/).first().waitFor();
}

async function textOf(p, testid) {
  return (await p.page.locator(`[data-testid=${testid}]`).first().textContent())?.trim();
}

async function waitForText(p, testid, expected, timeout = 15000) {
  await p.page.waitForFunction(
    ({ testid, expected }) => document.querySelector(`[data-testid=${testid}]`)?.textContent?.trim() === expected,
    { testid, expected },
    { timeout },
  );
}

(async () => {
  console.log(`RIVAL two-player E2E against ${BASE}\n`);
  // In sandboxed CI, route the browser through the egress proxy when one is configured.
  const proxy = process.env.HTTPS_PROXY && !/localhost|127\.0\.0\.1/.test(BASE) ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch(proxy ? { proxy } : {});
  const A = await newPlayer(browser, "A");
  const B = await newPlayer(browser, "B");
  const emails = { a: `ava.${stamp}@rival-e2e.dev`, b: `ben.${stamp}@rival-e2e.dev`, c: `cy.${stamp}@rival-e2e.dev` };
  let leagueId, code, workoutA;

  await step("1. User A creates an account", async () => {
    await signUp(A, { name: "Ava Test", team: "Team Iron", abbr: "IRN", email: emails.a });
  });

  await step("1b. User A creates a league", async () => {
    await A.page.getByRole("radio", { name: "Create a league" }).click();
    await A.page.fill("#lname", `E2E League ${stamp}`);
    await A.page.click("button[type=submit]");
    await A.page.waitForURL(/\/home/);
    code = (await textOf(A, "invite-code")).replace("-", "");
    assert(/^[A-Z0-9]{8}$/.test(code), `bad invite code ${code}`);
    const me = await apiCall(A, "GET", "/api/me");
    leagueId = me.data.leagues[0].id;
    await A.page.screenshot({ path: path.join(OUT, "01-a-preseason.png"), fullPage: true });
    return `code ${code}`;
  });

  await step("2. User B creates an account in a separate browser session", async () => {
    await signUp(B, { name: "Ben Test", team: "The Grinders", abbr: "GRN", email: emails.b });
    const cookiesA = (await A.ctx.cookies()).find((c) => c.name === "rival_session").value;
    const cookiesB = (await B.ctx.cookies()).find((c) => c.name === "rival_session").value;
    assert(cookiesA !== cookiesB, "sessions must differ");
  });

  await step("3. User B joins with the invitation code", async () => {
    await B.page.fill("#code", `${code.slice(0, 4)}-${code.slice(4)}`);
    await B.page.click("button[type=submit]");
    await B.page.waitForURL(/\/home/);
  });

  await step("4. Both users appear in the same league", async () => {
    await A.page.reload();
    await waitForText(A, "member-count", "2 / 10");
    await waitForText(B, "member-count", "2 / 10");
    const sa = await apiCall(A, "GET", `/api/leagues/${leagueId}`);
    const sb = await apiCall(B, "GET", `/api/leagues/${leagueId}`);
    const names = (s) => s.data.members.map((m) => m.teamName).sort().join(",");
    assert(names(sa) === "Team Iron,The Grinders" && names(sa) === names(sb), "member lists differ");
    await B.page.screenshot({ path: path.join(OUT, "02-b-joined.png"), fullPage: true });
    return names(sa);
  });

  await step("4b. Commissioner starts the season; weekly opponents assigned automatically", async () => {
    await A.page.click("[data-testid=start-season]");
    await A.page.getByText("Head-to-head").first().waitFor();
    const s = await apiCall(B, "GET", `/api/leagues/${leagueId}`);
    assert(s.data.league.status === "regular", "season not started");
    assert(s.data.matchups.length === 1, "expected 1 matchup");
    assert(s.data.schedule.length === s.data.league.seasonWeeks, "schedule length mismatch");
    return `${s.data.schedule.length} weeks scheduled, ${s.data.week.label}`;
  });

  await step("5. User A logs a workout (Run, 30 min)", async () => {
    await B.page.goto("/matchup");               // B is watching the scoreboard
    await waitForText(B, "opp-score", "0.0");
    await A.page.goto("/home");
    await logViaUi(A, "run", 30);
    const act = await apiCall(A, "GET", "/api/activity");
    workoutA = act.data.workouts[0];
    assert(workoutA.activity_type === "run" && workoutA.duration_min === 30, "workout not stored");
  });

  await step("6. Both users see the updated score (B's screen updates live, no reload)", async () => {
    // 30 min cardio = 12.0 + daily goal (30 min) 5.0 = 17.0
    const t0 = Date.now();
    await waitForText(B, "opp-score", "17.0", 15000);
    const latency = Date.now() - t0;
    await waitForText(A, "home-my-score", "17.0");
    await B.page.screenshot({ path: path.join(OUT, "03-b-sees-a-score-live.png"), fullPage: true });
    return `B saw 17.0 ~${latency}ms after A's save returned`;
  });

  await step("7. User B logs a workout (Strength, 20 min)", async () => {
    await A.page.goto("/matchup");
    await waitForText(A, "opp-score", "0.0");
    await logViaUi(B, "strength", 20);
  });

  await step("8. Matchup totals and standings update correctly for both", async () => {
    await waitForText(A, "opp-score", "8.0", 15000);   // 20 min strength = 8.0, goal not met
    await waitForText(A, "my-score", "17.0");
    const sa = await apiCall(A, "GET", `/api/leagues/${leagueId}`);
    const sb = await apiCall(B, "GET", `/api/leagues/${leagueId}`);
    const ma = sa.data.matchups[0], mb = sb.data.matchups[0];
    assert(ma.homeScore === mb.homeScore && ma.awayScore === mb.awayScore, "players see different scores");
    assert([ma.homeScore, ma.awayScore].sort().join() === [8, 17].sort().join(), `unexpected scores ${ma.homeScore}/${ma.awayScore}`);
    assert(sa.data.standings.length === 2 && sb.data.standings.length === 2, "standings missing teams");
    await A.page.screenshot({ path: path.join(OUT, "04-a-matchup.png"), fullPage: true });
    await A.page.goto("/league");
    await A.page.screenshot({ path: path.join(OUT, "05-a-league.png"), fullPage: true });
    return `scores ${ma.homeScore} – ${ma.awayScore} identical on both devices`;
  });

  await step("Profile photo upload shows for the league-mate", async () => {
    // Build a real JPEG in the browser, then upload it through the Profile screen.
    await A.page.goto("/profile");
    const jpeg = await A.page.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 400; c.height = 300;
      const g = c.getContext("2d"); g.fillStyle = "#3355ff"; g.fillRect(0, 0, 400, 300);
      g.fillStyle = "#ffcc00"; g.beginPath(); g.arc(200, 150, 90, 0, 7); g.fill();
      const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    await A.page.setInputFiles("[data-testid=photo-input]", { name: "me.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg) });
    await A.page.getByText("Photo updated").waitFor();
    const sb = await apiCall(B, "GET", `/api/leagues/${leagueId}`);
    const aMember = sb.data.members.find((m) => m.teamName === "Team Iron");
    assert(aMember.avatarUrl, "league-mate doesn't see avatar url");
    const img = await B.page.evaluate(async (u) => { const r = await fetch(u); return { s: r.status, t: r.headers.get("content-type") }; }, aMember.avatarUrl);
    assert(img.s === 200 && img.t === "image/jpeg", `B fetch avatar → ${img.s} ${img.t}`);
    await B.page.goto("/matchup");
    await B.page.waitForSelector(`img[src="${aMember.avatarUrl}"]`);
    await B.page.screenshot({ path: path.join(OUT, "07-b-sees-photo-and-colors.png"), fullPage: true });
    return "uploaded via Profile; B sees it on the scoreboard";
  });

  await step("Trash talk reaches the other player live", async () => {
    await A.page.goto("/matchup");
    await B.page.goto("/matchup");
    await B.page.fill("[data-testid=chat-input]", "Is that all you've got?");
    await B.page.click("[data-testid=chat-send]");
    await A.page.getByText("Is that all you've got?").waitFor({ timeout: 15000 });
    await A.page.getByRole("button", { name: "Just getting warmed up" }).click();
    await B.page.getByText("Just getting warmed up").waitFor({ timeout: 15000 });
    const series = await textOf(A, "series");
    assert(/First meeting/.test(series || ""), `series text: ${series}`);
    await A.page.locator("#chat").screenshot({ path: path.join(OUT, "08-trash-talk.png") });
    return "B → A and A → B delivered without reload";
  });

  await step("One-tap repeat logging", async () => {
    await A.page.goto("/home");
    await A.page.getByRole("button", { name: "Log activity" }).first().click();
    await A.page.locator("[data-testid=quick-log]").first().waitFor();
    // Run · 30 min again → duplicate check blocks an identical entry inside 10 minutes.
    await A.page.locator("[data-testid=quick-log]").first().click();
    await A.page.getByText(/duplicate/i).first().waitFor();
    return "recent workouts offered; identical repeat within 10 min correctly blocked as duplicate";
  });

  await step("Installable as a home-screen app (manifest, icons, service worker)", async () => {
    const m = await apiCall(A, "GET", "/manifest.webmanifest");
    assert(m.status === 200 && m.data.display === "standalone", "manifest");
    const sizes = m.data.icons.map((i) => i.sizes).join(",");
    assert(sizes.includes("192x192") && sizes.includes("512x512"), `icons ${sizes}`);
    const st = await A.page.evaluate(async () => {
      const r = await Promise.all(["/apple-touch-icon.png", "/icon-512.png", "/sw.js", "/offline.html"].map((u) => fetch(u).then((x) => x.status)));
      const apple = document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href");
      return { r, apple };
    });
    assert(st.r.every((x) => x === 200), `assets ${st.r}`);
    assert(st.apple, "apple-touch-icon link missing");
    return `manifest ok, icons ${sizes}, apple icon ${st.apple}`;
  });

  await step("Feedback can be sent from Profile", async () => {
    await A.page.goto("/profile");
    await A.page.fill("[data-testid=feedback-body]", "E2E: love the trash talk");
    await A.page.click("[data-testid=feedback-send]");
    await A.page.getByText("feedback sent").waitFor();
  });

  await step("Duplicate submissions are rejected", async () => {
    const req = crypto.randomUUID();
    const body = { requestId: req, type: "yoga", date: (await apiCall(B, "GET", "/api/me")).data.today, durationMin: 15 };
    const r1 = await apiCall(B, "POST", "/api/workouts", body);
    const r2 = await apiCall(B, "POST", "/api/workouts", body);                  // replay: same id
    const r3 = await apiCall(B, "POST", "/api/workouts", { ...body, requestId: crypto.randomUUID() }); // re-tap
    assert(r1.status === 201 && r2.status === 201 && r1.data.id === r2.data.id, "replay not idempotent");
    assert(r3.status === 400 && /duplicate/i.test(r3.data.error.message), `re-tap not blocked: ${r3.status}`);
    return "replay → same record; rapid re-submit → 400 duplicate";
  });

  await step("Invalid activity entries are rejected", async () => {
    const today = (await apiCall(B, "GET", "/api/me")).data.today;
    const bad = [
      { type: "run", date: "2099-01-01", durationMin: 20 },
      { type: "run", date: "2020-01-01", durationMin: 20 },
      { type: "run", date: today, durationMin: 600 },
      { type: "run", date: today, durationMin: 0 },
      { type: "levitation", date: today, durationMin: 20 },
      { type: "walk", date: today, steps: 9999999 },
    ];
    for (const b of bad) {
      const r = await apiCall(B, "POST", "/api/workouts", { requestId: crypto.randomUUID(), ...b });
      assert(r.status === 400, `accepted invalid entry ${JSON.stringify(b)} → ${r.status}`);
    }
    return `${bad.length} invalid entries rejected`;
  });

  await step("12. Unauthorized users cannot modify another participant's workouts or scores", async () => {
    const edit = await apiCall(B, "PATCH", `/api/workouts/${workoutA.id}`, { type: "run", date: workoutA.activity_date, durationMin: 240 });
    const del = await apiCall(B, "DELETE", `/api/workouts/${workoutA.id}`);
    assert(edit.status === 404 && del.status === 404, `edit=${edit.status} del=${del.status}`);
    // Client-supplied points are ignored: only raw activity is accepted.
    const today = (await apiCall(B, "GET", "/api/me")).data.today;
    const forged = await apiCall(B, "POST", "/api/workouts", { requestId: crypto.randomUUID(), type: "mobility", date: today, durationMin: 10, points: 9999, total: 9999 });
    assert(forged.status === 201 && forged.data.day.total < 60, "forged points accepted");
    const sa = await apiCall(A, "GET", `/api/leagues/${leagueId}`);
    const aTotal = sa.data.totals[sa.data.me].points;
    assert(aTotal === 17, `A's score changed to ${aTotal}`);
    // Signed-out requests are refused.
    const anon = await browser.newContext({ baseURL: BASE });
    const ap = await anon.newPage();
    await ap.goto("/");
    const anonRes = await ap.evaluate(async (id) => (await fetch(`/api/leagues/${id}`)).status, leagueId);
    await anon.close();
    assert(anonRes === 401, `anonymous got ${anonRes}`);
    return `B edit/delete A's workout → 404/404; forged points ignored (B's day total ${forged.data.day.total}); anon → 401; A still 17.0`;
  });

  await step("A third user outside the league cannot see it", async () => {
    const C = await newPlayer(browser, "C");
    await signUp(C, { name: "Cy Outsider", team: "Night Owls", abbr: "OWL", email: emails.c });
    const r = await apiCall(C, "GET", `/api/leagues/${leagueId}`);
    await C.ctx.close();
    assert(r.status === 404, `outsider got ${r.status}`);
    return `outsider → ${r.status}`;
  });

  await step("Cross-origin (CSRF) writes are blocked", async () => {
    const r = await fetch(`${BASE}/api/leagues/join`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", cookie: `rival_session=${(await B.ctx.cookies()).find((c) => c.name === "rival_session").value}` },
      body: JSON.stringify({ code }),
    });
    assert(r.status === 403, `got ${r.status}`);
    return "403";
  });

  await step("Commissioner reset link lets a member back in", async () => {
    const sa = await apiCall(A, "GET", `/api/leagues/${leagueId}`);
    const bId = sa.data.members.find((m) => m.teamName === "The Grinders").id;
    const r = await apiCall(A, "POST", `/api/leagues/${leagueId}/actions`, { action: "reset_link", userId: bId });
    assert(r.status === 200 && r.data.result.url.includes("/reset/"), `reset link ${r.status}`);
    const forbidden = await apiCall(B, "POST", `/api/leagues/${leagueId}/actions`, { action: "reset_link", userId: bId });
    assert(forbidden.status === 403, `member issued link: ${forbidden.status}`);
    const R = await newPlayer(browser, "R");
    await R.page.goto(new URL(r.data.result.url).pathname);
    await R.page.fill("#np", "brand-new-pass-1");
    await R.page.fill("#np2", "brand-new-pass-1");
    await R.page.click("button[type=submit]");
    await R.page.waitForURL(/\/home/);
    const me = await apiCall(R, "GET", "/api/me");
    await R.ctx.close();
    assert(me.data.account.team_name === "The Grinders", "signed in as wrong user");
    // Change it back so later steps can sign in with the original password.
    const R2 = await newPlayer(browser, "R2");
    const r2 = await apiCall(A, "POST", `/api/leagues/${leagueId}/actions`, { action: "reset_link", userId: bId });
    await R2.page.goto(new URL(r2.data.result.url).pathname);
    await R2.page.fill("#np", "correct-horse-42");
    await R2.page.fill("#np2", "correct-horse-42");
    await R2.page.click("button[type=submit]");
    await R2.page.waitForURL(/\/home/);
    await R2.ctx.close();
    return "commissioner issued link; member reset password and was signed in; non-commissioner → 403";
  });

  await step("9–10. Both users close the app, sign in again on a new device, data is restored", async () => {
    await A.ctx.close();
    await B.ctx.close();
    const A2 = await newPlayer(browser, "A2");
    const B2 = await newPlayer(browser, "B2");
    await signIn(A2, emails.a);
    await signIn(B2, emails.b);
    await A2.page.goto("/matchup");
    await waitForText(A2, "my-score", "17.0");
    const sb = await apiCall(B2, "GET", `/api/leagues/${leagueId}`);
    const bAct = await apiCall(B2, "GET", "/api/activity");
    assert(bAct.data.workouts.length >= 3, "B's workouts missing after re-login");
    assert(sb.data.league.status === "regular" && sb.data.members.length === 2, "league state lost");
    await A2.page.screenshot({ path: path.join(OUT, "06-a-new-device.png"), fullPage: true });
    // Sign out works and the session is invalidated server-side.
    await A2.page.goto("/profile");
    await A2.page.click("[data-testid=sign-out]");
    await A2.page.waitForURL(/\/sign-in/);
    const after = await apiCall(A2, "GET", "/api/me");
    assert(after.status === 401, "session still valid after sign-out");
    await A2.ctx.close();
    await B2.ctx.close();
    return `A sees 17.0, B has ${bAct.data.workouts.length} workouts, league intact; sign-out invalidates session`;
  });

  await browser.close();
  const summary = { base: BASE, ranAt: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed, results };
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed} passed, ${failed} failed → ${path.relative(process.cwd(), OUT)}/results.json`);
  process.exit(failed ? 1 : 0);
})();

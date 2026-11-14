/**
 * RIVAL Solo end-to-end test: drives the real UI on a phone-sized browser.
 *   BASE_URL=https://your-app.vercel.app node tests/e2e/solo.cjs
 * Writes tests/e2e/results/<host>/results.json and screenshots.
 */
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.env.BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const OUT = path.join(__dirname, "results", new URL(BASE).host.replace(/[^a-z0-9.-]/gi, "_"));
fs.mkdirSync(OUT, { recursive: true });
const stamp = Date.now().toString(36);
const results = [];
let failed = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ step: name, ok: true, ms: Date.now() - t0, detail: detail ?? null });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    failed++;
    results.push({ step: name, ok: false, ms: Date.now() - t0, error: String(e?.message || e) });
    console.log(`  ✗ ${name}\n    ${String(e?.message || e).split("\n")[0]}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

async function player(browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], baseURL: BASE, timezoneId: "America/Chicago" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  return { ctx, page };
}
const api = (p, method, url, body) => p.page.evaluate(async ({ method, url, body }) => {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}, { method, url, body });

async function signUp(p, email, name) {
  await p.page.goto("/sign-up");
  await p.page.fill("#displayName", name);
  await p.page.fill("#teamName", `${name} Fit`);
  await p.page.fill("#email", email);
  await p.page.fill("#password", "correct-horse-42");
  await p.page.click("button[type=submit]");
  await p.page.waitForURL(/\/program/);
  await p.page.getByText("The RIVAL Pledge").first().waitFor();
  await p.page.click("[data-testid=pledge-agree]");
  await p.page.click("[data-testid=pledge-submit]");
  await p.page.getByText("The RIVAL Pledge").first().waitFor({ state: "detached" });
}

(async () => {
  console.log(`RIVAL solo E2E against ${BASE}\n`);
  const proxy = process.env.HTTPS_PROXY && !/localhost|127\.0\.0\.1/.test(BASE) ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch(proxy ? { proxy } : {});
  const A = await player(browser);
  const email = `solo.${stamp}@rival-e2e.dev`;
  let pushId;

  await step("Sign up and take the pledge; lands on Program", () => signUp(A, email, "Sam"));

  await step("Add a starter program (Push/Pull/Legs)", async () => {
    await A.page.click("[data-testid=starter-ppl]");
    await A.page.locator("[data-testid=template-row]").first().waitFor();
    const prog = await api(A, "GET", "/api/program");
    assert(prog.data.templates.length === 5, `templates ${prog.data.templates.length}`);
    pushId = prog.data.templates.find((t) => t.name === "Push Day").id;
    return `${prog.data.templates.length} workouts, schedule ${prog.data.schedule.filter(Boolean).length}/7 days`;
  });

  await step("Schedule Push Day for today", async () => {
    const wd = await A.page.evaluate(() => ((new Date().getDay() + 6) % 7) + 1);
    await A.page.selectOption(`[data-testid=day-${wd}]`, { label: "Push Day" });
    await A.page.waitForTimeout(800);
    const prog = await api(A, "GET", "/api/program");
    assert(prog.data.schedule[wd - 1] === pushId, "schedule not saved");
    await A.page.screenshot({ path: path.join(OUT, "01-program.png"), fullPage: true });
  });

  await step("Today shows the workout; check off exercises with a weight; finish", async () => {
    await A.page.goto("/home");
    await A.page.locator("[data-testid=workout-name]").filter({ hasText: "Push Day" }).waitFor();
    const checks = A.page.locator("[data-testid=exercise-check]");
    assert((await checks.count()) === 5, "expected 5 exercises");
    await A.page.getByRole("button", { name: /Bench Press/ }).click();
    await A.page.fill("[data-testid=weight-input]", "135");
    await checks.nth(0).click();
    await checks.nth(1).click();
    await A.page.waitForTimeout(900);                          // autosave
    await A.page.screenshot({ path: path.join(OUT, "02-today-workout.png"), fullPage: true });
    await A.page.click("[data-testid=finish-workout]");
    await A.page.getByText(/Push Day complete|New PR/).first().waitFor();
    await A.page.locator("[data-testid=workout-complete]").waitFor();
    const t = await api(A, "GET", "/api/today");
    const d = t.data.days.find((x) => x.day === t.data.today);
    assert(d.plan_done && d.strength_pts > 0, `day ${JSON.stringify({ plan: d.plan_done, s: d.strength_pts })}`);
    return `today ${d.total} pts (strength ${d.strength_pts} + program bonus ${d.plan_pts}${d.goal_pts ? ` + goal ${d.goal_pts}` : ""})`;
  });

  await step("Log water and protein; they persist and score", async () => {
    for (let i = 0; i < 8; i++) await A.page.click("[data-testid=water-plus]");
    for (let i = 0; i < 4; i++) await A.page.click("[data-testid=protein-plus-40]");
    await A.page.waitForTimeout(1500);
    await A.page.reload();
    await A.page.locator("[data-testid=water-count]").filter({ hasText: "8" }).waitFor();
    await A.page.locator("[data-testid=protein-count]").filter({ hasText: "160" }).waitFor();
    const t = await api(A, "GET", "/api/today");
    const d = t.data.days.find((x) => x.day === t.data.today);
    assert(d.water_met && d.protein_met && d.habit_pts === 6, "habits not scored");
    await A.page.screenshot({ path: path.join(OUT, "03-today-done.png"), fullPage: true });
    return `habits +${d.habit_pts}; today now ${d.total} pts`;
  });

  await step("Progress shows level, weekly score and the personal record", async () => {
    await A.page.goto("/activity");
    await A.page.locator("[data-testid=level-card]").waitFor();
    await A.page.locator("[data-testid=prs]").getByText("Bench Press").waitFor();
    await A.page.locator("[data-testid=prs]").getByText("135 lb").waitFor();
    await A.page.screenshot({ path: path.join(OUT, "04-progress.png"), fullPage: true });
  });

  await step("Edit a workout in the program builder", async () => {
    await A.page.goto("/program");
    await A.page.locator("[data-testid=template-row]").filter({ hasText: "Pull Day" }).click();
    await A.page.fill("[data-testid=template-name]", "Pull Day A");
    await A.page.click("[data-testid=save-template]");
    await A.page.locator("[data-testid=template-row]").filter({ hasText: "Pull Day A" }).waitFor();
  });

  await step("Another account can't see or change your program", async () => {
    const B = await player(browser);
    await signUp(B, `other.${stamp}@rival-e2e.dev`, "Other");
    const del = await api(B, "DELETE", `/api/program/templates/${pushId}`);
    const sched = await api(B, "PUT", "/api/program/schedule", { weekday: 1, templateId: pushId });
    const prog = await api(B, "GET", "/api/program");
    await api(B, "POST", "/api/me/delete", { password: "correct-horse-42" });
    await B.ctx.close();
    assert(del.status === 404 && sched.status === 404 && prog.data.templates.length === 0, `del=${del.status} sched=${sched.status}`);
    return "delete → 404, schedule → 404, sees 0 workouts";
  });

  await step("Close the app, sign in fresh: everything is still there", async () => {
    await A.ctx.close();
    const A2 = await player(browser);
    await A2.page.goto("/sign-in");
    await A2.page.fill("#email", email);
    await A2.page.fill("#password", "correct-horse-42");
    await A2.page.click("button[type=submit]");
    await A2.page.waitForURL(/\/home/);
    await A2.page.locator("[data-testid=workout-complete]").waitFor();
    await A2.page.locator("[data-testid=water-count]").filter({ hasText: "8" }).waitFor();
    // Clean up: delete the test account.
    const r = await api(A2, "POST", "/api/me/delete", { password: "correct-horse-42" });
    await A2.ctx.close();
    assert(r.status === 200, `delete account ${r.status}`);
    return "workout + habits restored; test account deleted";
  });

  await browser.close();
  const summary = { base: BASE, ranAt: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed, results };
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

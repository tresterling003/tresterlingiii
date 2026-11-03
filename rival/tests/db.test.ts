import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { setupDb, expectFail, type Db } from "./helpers";

// Wednesday 2026-11-04 12:00 in America/Chicago. Week runs Mon 11-02 … Sun 11-08.
const WED = "2026-11-04T18:00:00Z";
const TODAY = "2026-11-04";
const MONDAY = "2026-11-02";

let db: Db;

beforeAll(async () => {
  db = await setupDb("rival_test");
  await db.setClock(WED);
});
afterAll(async () => db?.close());

async function league(owner: string, opts: { weeks?: number; playoffs?: number; max?: number } = {}) {
  const [r] = await db.as(owner, "select create_league($1, $2, $3, $4, $5) as id", [
    "Test League", opts.max ?? 12, opts.weeks ?? 4, opts.playoffs ?? 0, "America/Chicago",
  ]);
  const [{ code }] = await db.as(owner, "select code from leagues where id = $1", [r.id]);
  return { id: r.id as string, code: code as string };
}

async function join(uid: string, code: string) {
  const [r] = await db.as(uid, "select join_league($1) as id", [code]);
  if (!r.id) throw Object.assign(new Error("invalid_code"), { detail: "invalid_code" });
  return r.id as string;
}

// ---------------------------------------------------------------------------
describe("scoring engine", () => {
  let u: string; let L: string;
  beforeAll(async () => {
    u = await db.signup();
    L = (await league(u)).id;
  });

  it("scores partial increments and rounds down", async () => {
    await db.log(u, "steps", TODAY, { steps: 7350 });   // 7.35 × 2 = 14.7
    await db.log(u, "run", TODAY, { min: 25 });          // 2.5 × 4 = 10.0
    await db.log(u, "strength", TODAY, { min: 13 });     // 1.3 × 4 = 5.2
    await db.log(u, "yoga", TODAY, { min: 15 });         // 1.5 × 3 = 4.5
    const d = await db.day(u, L, TODAY);
    expect(Number(d.steps_pts)).toBe(14.7);
    expect(Number(d.cardio_pts)).toBe(10);
    expect(Number(d.strength_pts)).toBe(5.2);
    expect(Number(d.mobility_pts)).toBe(4.5);
    // 53 active minutes ≥ default goal of 30 → +5
    expect(d.goal_met).toBe(true);
    expect(Number(d.goal_pts)).toBe(5);
    expect(Number(d.total)).toBe(39.4);
    expect(d.is_active).toBe(true);
  });

  it("caps a category per day and caps the day total", async () => {
    const v = await db.signup();
    const lv = (await league(v)).id;
    await db.log(v, "run", TODAY, { min: 150 });
    await db.log(v, "cycle", TODAY, { min: 60 });       // 210 cardio min → capped at 120 → 48
    let d = await db.day(v, lv, TODAY);
    expect(Number(d.cardio_pts)).toBe(48);
    await db.log(v, "steps", TODAY, { steps: 30000 });  // capped at 25k → 50
    d = await db.day(v, lv, TODAY);
    expect(Number(d.steps_pts)).toBe(50);
    expect(Number(d.raw_total)).toBe(103);              // 48 + 50 + 5 goal
    expect(Number(d.total)).toBe(60);                   // daily cap
  });

  it("counts steps once: daily total vs. walks takes the higher, never the sum", async () => {
    const v = await db.signup();
    const lv = (await league(v)).id;
    await db.log(v, "walk", TODAY, { steps: 3000 });
    await db.log(v, "walk", TODAY, { steps: 2000, min: 20 });
    let d = await db.day(v, lv, TODAY);
    expect(d.steps).toBe(5000);
    expect(Number(d.steps_pts)).toBe(10);
    expect(d.active_minutes).toBe(0);                    // walk minutes are not also cardio
    await db.log(v, "steps", TODAY, { steps: 9000 });    // phone total includes the walks
    d = await db.day(v, lv, TODAY);
    expect(d.steps).toBe(9000);
    expect(Number(d.steps_pts)).toBe(18);
  });

  it("goal changes take effect tomorrow, not retroactively", async () => {
    const v = await db.signup();
    const lv = (await league(v)).id;
    await db.log(v, "run", TODAY, { min: 15 });          // under the default 30-min goal
    const [{ eff }] = await db.as(v, "select set_goal(10, 1000)::text as eff");
    expect(eff).toBe("2026-11-05");
    const d = await db.day(v, lv, TODAY);
    expect(d.goal_met).toBe(false);
  });

  it("awards the planned-workout bonus only for plans made in advance", async () => {
    const v = await db.signup();
    const lv = (await league(v)).id;
    await expectFail(db.as(v, "select set_plan($1, 'strength', 30)", [TODAY]), "Plan workouts for tomorrow");
    await db.as(v, "select set_plan('2026-11-05', 'strength', 30)");
    await db.setClock("2026-11-05T18:00:00Z");
    try {
      await db.log(v, "strength", "2026-11-05", { min: 20 });
      let d = await db.day(v, lv, "2026-11-05");
      expect(d.plan_done).toBe(false);
      await db.log(v, "strength", "2026-11-05", { min: 10 });
      d = await db.day(v, lv, "2026-11-05");
      expect(d.plan_done).toBe(true);
      expect(Number(d.plan_pts)).toBe(5);
    } finally {
      await db.setClock(WED);
    }
  });

  it("awards the consistency bonus for five active days", async () => {
    const v = await db.signup();
    const lv = (await league(v)).id;
    for (const [i, date] of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"].entries()) {
      await db.setClock(`${date}T18:00:00Z`);
      await db.log(v, "run", date, { min: 20 + i });
    }
    await db.setClock(WED);
    const [wk] = await db.as(v, "select * from league_week_totals($1, $2) where user_id = $3", [lv, MONDAY, v]);
    expect(wk.active_days).toBe(5);
    expect(Number(wk.bonus)).toBe(10);
    // 20..24 min → 8.0 + 8.4 + 8.8 + 9.2 + 9.6 = 44, no goals met (<30) → 44 + 10
    expect(Number(wk.points)).toBe(54);
  });

  it("recalculates after edits and deletes", async () => {
    const v = await db.signup();
    const lv = (await league(v)).id;
    const id = await db.log(v, "run", TODAY, { min: 20 });
    expect(Number((await db.day(v, lv, TODAY)).total)).toBe(8);
    await db.as(v, "select update_workout($1, 'strength', $2, 40, null, null, 'edited')", [id, TODAY]);
    let d = await db.day(v, lv, TODAY);
    expect(Number(d.cardio_pts)).toBe(0);
    expect(Number(d.strength_pts)).toBe(16);
    expect(Number(d.total)).toBe(21);
    await db.as(v, "select delete_workout($1)", [id]);
    d = await db.day(v, lv, TODAY);
    expect(Number(d.total)).toBe(0);
  });

  it("applies commissioner scoring changes to everyone and validates bounds", async () => {
    const v = await db.signup();
    const w = await db.signup();
    const lv = await league(v);
    await join(w, lv.code);
    await db.log(w, "run", TODAY, { min: 10 });
    expect(Number((await db.day(v, lv.id, TODAY)).total)).toBe(0);
    const before = await db.as(v, "select * from league_day_scores($1, $2, $2) where user_id = $3", [lv.id, TODAY, w]);
    expect(Number(before[0].cardio_pts)).toBe(4);
    await db.as(v, `select update_league($1, '{"scoring":{"cardio":{"per":10,"points":6,"daily_cap":120}}}')`, [lv.id]);
    const after = await db.as(v, "select * from league_day_scores($1, $2, $2) where user_id = $3", [lv.id, TODAY, w]);
    expect(Number(after[0].cardio_pts)).toBe(6);
    await expectFail(
      db.as(v, `select update_league($1, '{"scoring":{"cardio":{"per":10,"points":50,"daily_cap":120}}}')`, [lv.id]),
      "invalid_scoring",
    );
    await expectFail(
      db.as(v, `select update_league($1, '{"scoring":{"cardio":{"per":10,"points":4,"daily_cap":1000}}}')`, [lv.id]),
      "invalid_scoring",
    );
    await expectFail(db.as(w, `select update_league($1, '{"name":"Hijacked"}')`, [lv.id]), "forbidden");
  });
});

// ---------------------------------------------------------------------------
describe("workout validation and duplicates", () => {
  let u: string;
  beforeAll(async () => { u = await db.signup(); });

  it("replaying the same submission is idempotent", async () => {
    const req = randomUUID();
    const a = await db.log(u, "cycle", TODAY, { min: 33, req });
    const b = await db.log(u, "cycle", TODAY, { min: 33, req });
    expect(a).toBe(b);
    const rows = await db.as(u, "select count(*)::int as n from workouts where client_request_id = $1", [req]);
    expect(rows[0].n).toBe(1);
  });

  it("rejects an identical workout re-submitted within 10 minutes", async () => {
    await db.log(u, "swim", TODAY, { min: 27 });
    await expectFail(db.log(u, "swim", TODAY, { min: 27 }), "duplicate");
  });

  it("handles concurrent double-taps safely", async () => {
    const v = await db.signup();
    const results = await Promise.allSettled([
      db.log(v, "hiit", TODAY, { min: 21 }),
      db.log(v, "hiit", TODAY, { min: 21 }),
      db.log(v, "hiit", TODAY, { min: 21 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rows = await db.as(v, "select count(*)::int as n from workouts");
    expect(rows[0].n).toBe(1);
  });

  it("allows only one daily step total per day", async () => {
    const v = await db.signup();
    await db.log(v, "steps", TODAY, { steps: 4000 });
    await expectFail(db.log(v, "steps", TODAY, { steps: 6000 }), "duplicate_steps");
  });

  it("rejects invalid entries", async () => {
    await expectFail(db.log(u, "run", "2026-11-05", { min: 20 }), "future_date");
    await expectFail(db.log(u, "run", "2026-11-02", { min: 20 }), "too_old");
    await expectFail(db.log(u, "run", TODAY), "Enter how many minutes");
    await expectFail(db.log(u, "run", TODAY, { min: 0 }), "between 1 and 240");
    await expectFail(db.log(u, "run", TODAY, { min: 300 }), "between 1 and 240");
    await expectFail(db.log(u, "run", TODAY, { min: 20, steps: 4000 }), "Steps can only");
    await expectFail(db.log(u, "teleport", TODAY, { min: 20 }), "invalid_type");
    await expectFail(db.log(u, "walk", TODAY, { steps: 500000 }), "between 1 and 100,000");
    const v = await db.signup();
    await db.log(v, "run", TODAY, { min: 240 });
    await db.log(v, "cycle", TODAY, { min: 200 });
    await expectFail(db.log(v, "hike", TODAY, { min: 60 }), "8 hours");
  });

  it("allows yesterday but locks older entries from edits", async () => {
    const v = await db.signup();
    const id = await db.log(v, "run", "2026-11-03", { min: 20 });
    await db.setClock("2026-11-06T18:00:00Z");
    try {
      await expectFail(db.as(v, "select delete_workout($1)", [id]), "locked");
      await expectFail(db.as(v, "select update_workout($1, 'run', '2026-11-03', 90, null, null, null)", [id]), "locked");
    } finally {
      await db.setClock(WED);
    }
  });
});

// ---------------------------------------------------------------------------
describe("timezone boundaries", () => {
  it("uses each person's own local date for 'today'", async () => {
    // 2026-11-04 10:30 UTC = Nov 4 23:30 in Auckland (UTC+13) … wait: Auckland is UTC+13 in Nov.
    // 10:30Z → Auckland 23:30 Nov 4; Los Angeles 02:30 Nov 4.
    // At 11:30Z → Auckland 00:30 Nov 5; LA 03:30 Nov 4.
    await db.setClock("2026-11-04T11:30:00Z");
    try {
      const akl = await db.signup({ tz: "Pacific/Auckland" });
      const lax = await db.signup({ tz: "America/Los_Angeles" });
      await db.log(akl, "run", "2026-11-05", { min: 20 });               // already Thursday there
      await expectFail(db.log(lax, "run", "2026-11-05", { min: 20 }), "future_date");
      await db.log(lax, "run", "2026-11-03", { min: 20 });               // LA yesterday is OK
      await expectFail(db.log(akl, "run", "2026-11-03", { min: 20 }), "too_old");
    } finally {
      await db.setClock(WED);
    }
  });

  it("finalizes a week at 00:00 Tuesday in the league's time zone, not UTC", async () => {
    const a = await db.signup();
    const b = await db.signup();
    const L = await league(a, { weeks: 2 });
    await join(b, L.code);
    await db.as(a, "select start_season($1, 'this_week')", [L.id]);
    // Tue 2026-11-10 03:00 UTC = Mon 11-09 21:00 Chicago → not final yet
    await db.setClock("2026-11-10T03:00:00Z");
    try {
      await db.as(a, "select rival_advance_league($1)", [L.id]);
      let [m] = await db.as(a, "select finalized_at from matchups where league_id = $1 and week = 1", [L.id]);
      expect(m.finalized_at).toBeNull();
      // Tue 2026-11-10 06:01 UTC = Tue 00:01 Chicago → final
      await db.setClock("2026-11-10T06:01:00Z");
      await db.as(a, "select rival_advance_league($1)", [L.id]);
      [m] = await db.as(a, "select finalized_at from matchups where league_id = $1 and week = 1", [L.id]);
      expect(m.finalized_at).not.toBeNull();
    } finally {
      await db.setClock(WED);
    }
  });
});

// ---------------------------------------------------------------------------
describe("access control (row-level security)", () => {
  let a: string, b: string, outsider: string, L: { id: string; code: string }, wid: string;
  beforeAll(async () => {
    a = await db.signup(); b = await db.signup(); outsider = await db.signup();
    L = await league(a);
    await join(b, L.code);
    wid = await db.log(a, "run", TODAY, { min: 30 });
  });

  it("raw workouts are private to their owner", async () => {
    expect(await db.as(b, "select * from workouts where id = $1", [wid])).toHaveLength(0);
    expect(await db.as(a, "select * from workouts where id = $1", [wid])).toHaveLength(1);
  });

  it("the app role cannot write tables directly", async () => {
    await expectFail(db.as(b, "update workouts set duration_min = 240 where id = $1", [wid]), "permission denied");
    await expectFail(db.as(a, "update workouts set duration_min = 240 where id = $1", [wid]), "permission denied");
    await expectFail(
      db.as(b, "insert into matchups (league_id, season, week, week_start, home_id) values ($1, 1, 1, $2, $3)", [L.id, MONDAY, b]),
      "permission denied",
    );
    await expectFail(db.as(b, "update leagues set version = 0"), "permission denied");
    await expectFail(db.as(b, "select * from user_credentials"), "permission denied");
    await expectFail(db.as(b, "select * from sessions"), "permission denied");
    await expectFail(db.as(b, "insert into test_clock values (true, now())"), "permission denied");
  });

  it("cannot modify another participant's workouts through the API", async () => {
    await expectFail(db.as(b, "select update_workout($1, 'run', $2, 240, null, null, null)", [wid, TODAY]), "not_found");
    await expectFail(db.as(b, "select delete_workout($1)", [wid]), "not_found");
    const [w] = await db.as(a, "select duration_min from workouts where id = $1", [wid]);
    expect(w.duration_min).toBe(30);
  });

  it("internal scoring functions are not callable by the app", async () => {
    await expectFail(db.as(b, "select rival_score_day(rival_default_scoring(), $1, $2)", [a, TODAY]), "permission denied");
    await expectFail(db.as(b, "select rival_finalize_matchup(gen_random_uuid())"), "permission denied");
    await expectFail(db.as(b, "select rival_crown($1, $2, null, 1, 1)", [L.id, b]), "permission denied");
  });

  it("league-mates see points, not raw metrics, unless sharing is enabled", async () => {
    const rows = await db.as(b, "select * from league_day_scores($1, $2, $2) where user_id = $3", [L.id, TODAY, a]);
    expect(Number(rows[0].cardio_pts)).toBe(12);
    expect(rows[0].active_minutes).toBeNull();
    expect(rows[0].cardio_min).toBeNull();
    await db.as(a, `select update_profile('{"share_details": true}')`);
    const shared = await db.as(b, "select * from league_day_scores($1, $2, $2) where user_id = $3", [L.id, TODAY, a]);
    expect(shared[0].cardio_min).toBe(30);
    await db.as(a, `select update_profile('{"share_details": false}')`);
  });

  it("outsiders cannot see the league or its members", async () => {
    expect(await db.as(outsider, "select * from leagues where id = $1", [L.id])).toHaveLength(0);
    expect(await db.as(outsider, "select * from league_members where league_id = $1", [L.id])).toHaveLength(0);
    expect(await db.as(outsider, "select id from users where id = $1", [a])).toHaveLength(0);
    await expectFail(db.as(outsider, "select * from league_day_scores($1, $2, $2)", [L.id, TODAY]), "not_found");
    await expectFail(db.as(outsider, "select * from league_standings($1)", [L.id]), "not_found");
  });

  it("league-mates cannot read each other's email", async () => {
    await expectFail(db.as(b, "select email from users where id = $1", [a]), "permission denied");
    const [me] = await db.as(a, "select * from my_account()");
    expect(me.email).toMatch(/@test\.dev$/);
  });

  it("anonymous callers can't use the write API", async () => {
    await expectFail(db.as(null, "select log_workout(gen_random_uuid(), 'run', $1, 20, null, null, null)", [TODAY]), "unauthenticated");
    await expectFail(db.as(null, "select create_league('X League', 8, 4, 0, 'UTC')"), "unauthenticated");
  });

  it("only the commissioner manages members", async () => {
    await expectFail(db.as(b, "select remove_member($1, $2)", [L.id, a]), "forbidden");
    await expectFail(db.as(b, "select regenerate_invite($1)", [L.id]), "forbidden");
    await expectFail(db.as(b, "select start_season($1, 'this_week')", [L.id]), "forbidden");
  });
});

// ---------------------------------------------------------------------------
describe("league membership", () => {
  it("joins by code case-insensitively and ignores formatting", async () => {
    const a = await db.signup(); const b = await db.signup();
    const L = await league(a);
    const pretty = `${L.code.slice(0, 4).toLowerCase()}-${L.code.slice(4)}`;
    expect(await join(b, pretty)).toBe(L.id);
    expect(await join(b, L.code)).toBe(L.id);   // re-join is a no-op
    const members = await db.as(a, "select * from league_members where league_id = $1", [L.id]);
    expect(members).toHaveLength(2);
  });

  it("rejects bad codes and rate-limits guessing", async () => {
    const g = await db.signup();
    for (let i = 0; i < 10; i++) await expectFail(join(g, "ZZZZZZZZ"), "invalid_code");
    await expectFail(join(g, "ZZZZZZZZ"), "rate_limited");
  });

  it("enforces the member cap", async () => {
    const a = await db.signup();
    const L = await league(a, { max: 4 });
    for (let i = 0; i < 3; i++) await join(await db.signup(), L.code);
    await expectFail(join(await db.signup(), L.code), "full");
  });

  it("needs two members to start", async () => {
    const a = await db.signup();
    const L = await league(a);
    await expectFail(db.as(a, "select start_season($1, 'this_week')", [L.id]), "at least one rival");
  });

  it("regenerating the invite invalidates the old code", async () => {
    const a = await db.signup();
    const L = await league(a);
    const [{ code }] = await db.as(a, "select regenerate_invite($1) as code", [L.id]);
    expect(code).not.toBe(L.code);
    await expectFail(join(await db.signup(), L.code), "invalid_code");
    await join(await db.signup(), code);
  });
});

// ---------------------------------------------------------------------------
describe("scheduling", () => {
  async function schedule(size: number, weeks: number) {
    const owner = await db.signup();
    const L = await league(owner, { weeks, max: 20 });
    const ids = [owner];
    for (let i = 1; i < size; i++) { const u = await db.signup(); await join(u, L.code); ids.push(u); }
    await db.as(owner, "select start_season($1, 'next_week')", [L.id]);
    const rows = await db.as(owner, "select week, home_id, away_id from matchups where league_id = $1 order by week", [L.id]);
    return { ids, rows };
  }

  for (const size of [2, 4, 5, 7, 8, 20]) {
    it(`every team plays exactly once per week (${size} teams)`, async () => {
      const weeks = size % 2 ? size : size - 1;   // one full rotation
      const { ids, rows } = await schedule(size, weeks);
      for (let w = 1; w <= weeks; w++) {
        const wk = rows.filter((r) => r.week === w);
        const seen = wk.flatMap((r) => [r.home_id, r.away_id]).filter(Boolean);
        expect(new Set(seen).size).toBe(size);
        expect(seen).toHaveLength(size);
        expect(wk.filter((r) => r.away_id === null)).toHaveLength(size % 2);
      }
      // Over one full rotation every pair meets exactly once and byes are evenly spread.
      if (size > 2) {
        const pairs = rows.filter((r) => r.away_id).map((r) => [r.home_id, r.away_id].sort().join());
        expect(new Set(pairs).size).toBe(pairs.length);
        expect(pairs).toHaveLength((size * (size - 1)) / 2);
      }
      if (size % 2) {
        const byes = rows.filter((r) => !r.away_id).map((r) => r.home_id);
        expect(new Set(byes).size).toBe(size);
      }
      // Home/away is balanced to within one game per rotation.
      for (const id of ids) {
        const home = rows.filter((r) => r.home_id === id && r.away_id).length;
        const away = rows.filter((r) => r.away_id === id).length;
        expect(Math.abs(home - away)).toBeLessThanOrEqual(2);
      }
    });
  }

  it("rebuilds only future weeks when someone joins mid-season", async () => {
    const a = await db.signup(); const b = await db.signup();
    const L = await league(a, { weeks: 4 });
    await join(b, L.code);
    await db.as(a, "select start_season($1, 'this_week')", [L.id]);
    const c = await db.signup();
    await join(c, L.code);
    const rows = await db.as(a, "select week, home_id, away_id from matchups where league_id = $1 order by week", [L.id]);
    const wk1 = rows.filter((r) => r.week === 1);
    expect(wk1).toHaveLength(1);                         // current week untouched
    expect([wk1[0].home_id, wk1[0].away_id]).not.toContain(c);
    for (let w = 2; w <= 4; w++) {
      const seen = rows.filter((r) => r.week === w).flatMap((r) => [r.home_id, r.away_id]).filter(Boolean);
      expect(seen.sort()).toEqual([a, b, c].sort());
    }
  });
});

// ---------------------------------------------------------------------------
describe("weekly processing, standings and playoffs", () => {
  it("runs a full season: results, ties, standings, playoffs, champion", async () => {
    const [a, b, c, d] = [await db.signup({ name: "Ava" }), await db.signup({ name: "Ben" }), await db.signup({ name: "Cy" }), await db.signup({ name: "Dee" })];
    const L = await league(a, { weeks: 3, playoffs: 2 });
    for (const u of [b, c, d]) await join(u, L.code);
    await db.as(a, "select start_season($1, 'this_week')", [L.id]);

    const wk = async (w: number) =>
      db.as(a, "select * from matchups where league_id = $1 and week = $2 order by home_id", [L.id, w]);
    const opponent = (rows: any[], u: string) => {
      const m = rows.find((r) => r.home_id === u || r.away_id === u);
      return m.home_id === u ? m.away_id : m.home_id;
    };

    // Week 1 (current): a logs more than his opponent; c and d tie exactly.
    const w1 = await wk(1);
    const aOpp = opponent(w1, a);
    const others = [b, c, d].filter((x) => x !== aOpp);
    await db.log(a, "run", TODAY, { min: 40 });           // 16 + 5 goal = 21
    await db.log(aOpp, "run", TODAY, { min: 10 });        // 4
    await db.log(others[0], "strength", TODAY, { min: 20 });
    await db.log(others[1], "strength", TODAY, { min: 20 });

    // Live scores are visible to everyone before finalization.
    const live = await db.as(b, "select * from league_week_totals($1, $2)", [L.id, MONDAY]);
    expect(Number(live.find((r) => r.user_id === a).points)).toBe(21);

    // Monday night: still live. Tuesday: week 1 final, week 2 in progress.
    await db.setClock("2026-11-10T04:00:00Z");
    await db.as(a, "select rival_advance_league($1)", [L.id]);
    expect((await wk(1)).every((m) => m.finalized_at === null)).toBe(true);
    await db.setClock("2026-11-10T18:00:00Z");
    const [{ changed }] = await db.as(a, "select rival_advance_league($1) as changed", [L.id]);
    expect(changed).toBe(true);
    const f1 = await wk(1);
    const mA = f1.find((m) => m.home_id === a || m.away_id === a);
    expect(mA.winner_id).toBe(a);
    const mTie = f1.find((m) => m !== mA);
    expect(mTie.is_tie).toBe(true);
    expect(mTie.winner_id).toBeNull();
    expect(Number(mTie.home_score)).toBe(Number(mTie.away_score));

    // Workouts logged after a week is final don't change the snapshot.
    await db.log(aOpp, "run", "2026-11-09", { min: 120 });
    await db.as(a, "select rival_advance_league($1)", [L.id]);
    const again = (await wk(1)).find((m) => m.id === mA.id);
    expect(Number(again[again.home_id === aOpp ? "home_score" : "away_score"])).toBe(4);

    // Idempotent: calling again changes nothing.
    const [{ changed: c2 }] = await db.as(a, "select rival_advance_league($1) as changed", [L.id]);
    expect(c2).toBe(false);

    let st = await db.as(a, "select * from league_standings($1) order by rank", [L.id]);
    const sa = st.find((r) => r.user_id === a);
    expect([sa.wins, sa.losses, sa.ties]).toEqual([1, 0, 0]);
    expect(st.find((r) => r.user_id === others[0]).ties).toBe(1);
    expect(st[0].user_id).toBe(a);

    // Jump past the regular season (weeks 2–3 scoreless → ties).
    await db.setClock("2026-11-24T18:00:00Z");
    await db.as(a, "select rival_advance_league($1)", [L.id]);
    const [lg] = await db.as(a, "select status from leagues where id = $1", [L.id]);
    expect(lg.status).toBe("playoffs");
    const champ = await db.as(a, "select * from matchups where league_id = $1 and kind = 'championship'", [L.id]);
    expect(champ).toHaveLength(1);
    expect(champ[0].home_id).toBe(a);                    // #1 seed hosts
    expect(champ[0].home_seed).toBe(1);
    expect(champ[0].week).toBe(4);

    // Championship week: seed 2 outscores seed 1.
    const seed2 = champ[0].away_id;
    await db.log(seed2, "cycle", "2026-11-24", { min: 30 });
    await db.setClock("2026-12-01T18:00:00Z");
    await db.as(a, "select rival_advance_league($1)", [L.id]);
    const [done] = await db.as(a, "select status from leagues where id = $1", [L.id]);
    expect(done.status).toBe("complete");
    const [hist] = await db.as(b, "select * from season_history where league_id = $1", [L.id]);
    expect(hist.champion_id).toBe(seed2);
    expect(hist.runner_up_id).toBe(a);

    // A new season can start and old history remains.
    await db.as(a, "select new_season($1)", [L.id]);
    const [ns] = await db.as(a, "select status, season from leagues where id = $1", [L.id]);
    expect(ns).toEqual({ status: "preseason", season: 2 });
    st = await db.as(a, "select * from league_standings($1)", [L.id]);
    expect(st.every((r) => r.wins === 0 && r.losses === 0)).toBe(true);
    await db.setClock(WED);
  });

  it("6-team playoff bracket gives the top two seeds byes and breaks playoff ties by seed", async () => {
    await db.setClock(WED);
    const ids = [await db.signup()];
    const L = await league(ids[0], { weeks: 1, playoffs: 6 });
    for (let i = 0; i < 5; i++) { const u = await db.signup(); await join(u, L.code); ids.push(u); }
    await db.as(ids[0], "select start_season($1, 'this_week')", [L.id]);
    await db.setClock("2026-11-10T18:00:00Z");
    await db.as(ids[0], "select rival_advance_league($1)", [L.id]);
    const r1 = await db.as(ids[0], "select * from matchups where league_id = $1 and round = 1 order by home_seed", [L.id]);
    expect(r1.map((m) => [m.home_seed, m.away_seed])).toEqual([[1, null], [2, null], [3, 6], [4, 5]]);
    // Nobody scores → playoff ties go to the higher seed.
    await db.setClock("2026-11-17T18:00:00Z");
    await db.as(ids[0], "select rival_advance_league($1)", [L.id]);
    const r2 = await db.as(ids[0], "select * from matchups where league_id = $1 and round = 2 order by home_seed", [L.id]);
    expect(r2.map((m) => [m.home_seed, m.away_seed])).toEqual([[1, 4], [2, 3]]);
    await db.setClock("2026-11-24T18:00:00Z");
    await db.as(ids[0], "select rival_advance_league($1)", [L.id]);
    const r3 = await db.as(ids[0], "select * from matchups where league_id = $1 and round = 3", [L.id]);
    expect(r3).toHaveLength(1);
    expect(r3[0].kind).toBe("championship");
    expect([r3[0].home_seed, r3[0].away_seed]).toEqual([1, 2]);
    await db.setClock(WED);
  });

  it("catches up several missed weeks in one pass (no cron for a month)", async () => {
    await db.setClock(WED);
    const a = await db.signup(); const b = await db.signup(); const c = await db.signup();
    const L = await league(a, { weeks: 4, playoffs: 2 });
    await join(b, L.code); await join(c, L.code);
    await db.as(a, "select start_season($1, 'this_week')", [L.id]);
    await db.setClock("2027-01-15T18:00:00Z");
    await db.as(a, "select rival_advance_league($1)", [L.id]);
    const [lg] = await db.as(a, "select status from leagues where id = $1", [L.id]);
    expect(lg.status).toBe("complete");
    const open = await db.as(a, "select count(*)::int as n from matchups where league_id = $1 and finalized_at is null", [L.id]);
    expect(open[0].n).toBe(0);
    await db.setClock(WED);
  });

  it("a removed member forfeits their in-progress matchup and leaves the standings", async () => {
    await db.setClock(WED);
    const a = await db.signup(); const b = await db.signup();
    const L = await league(a, { weeks: 2 });
    await join(b, L.code);
    await db.as(a, "select start_season($1, 'this_week')", [L.id]);
    await db.log(b, "run", TODAY, { min: 60 });
    await db.as(a, "select remove_member($1, $2)", [L.id, b]);
    // b no longer sees the league
    expect(await db.as(b, "select * from leagues where id = $1", [L.id])).toHaveLength(0);
    await db.setClock("2026-11-10T18:00:00Z");
    await db.as(a, "select rival_advance_league($1)", [L.id]);
    const [m] = await db.as(a, "select * from matchups where league_id = $1 and week = 1", [L.id]);
    expect(m.winner_id).toBe(a);
    const st = await db.as(a, "select * from league_standings($1)", [L.id]);
    expect(st.map((r) => r.user_id)).toEqual([a]);
    // Week 2 was rebuilt without b → a has a bye.
    const w2 = await db.as(a, "select * from matchups where league_id = $1 and week = 2", [L.id]);
    expect(w2).toHaveLength(1);
    expect(w2[0].away_id).toBeNull();
    await db.setClock(WED);
  });

  it("version counter bumps on every change that should refresh other devices", async () => {
    const a = await db.signup(); const b = await db.signup();
    const L = await league(a);
    const v = async () => Number((await db.as(a, "select version from leagues where id = $1", [L.id]))[0].version);
    const v0 = await v();
    await join(b, L.code);
    const v1 = await v();
    expect(v1).toBeGreaterThan(v0);
    await db.log(b, "run", TODAY, { min: 12 });
    const v2 = await v();
    expect(v2).toBeGreaterThan(v1);
    await db.as(b, `select update_profile('{"team_name": "Night Shift"}')`);
    expect(await v()).toBeGreaterThan(v2);
  });
});

// ---------------------------------------------------------------------------
describe("profile photos", () => {
  it("are visible to the owner and league-mates only, and validated", async () => {
    const a = await db.signup(); const b = await db.signup(); const outsider = await db.signup();
    const L = await league(a);
    await join(b, L.code);
    const img = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 7)]);
    const [{ ts }] = await db.as(a, "select set_avatar($1, 'image/jpeg') as ts", [img]);
    expect(ts).toBeTruthy();
    expect(await db.as(a, "select image from get_avatar($1)", [a])).toHaveLength(1);
    expect(await db.as(b, "select image from get_avatar($1)", [a])).toHaveLength(1);
    expect(await db.as(outsider, "select image from get_avatar($1)", [a])).toHaveLength(0);
    await expectFail(db.as(b, "select * from user_avatars"), "permission denied");
    await expectFail(db.as(a, "select set_avatar($1, 'image/gif')", [img]), "JPEG, PNG or WebP");
    await expectFail(db.as(a, "select set_avatar($1, 'image/jpeg')", [Buffer.alloc(400000, 1)]), "too large");
    const [{ avatar_updated_at }] = await db.as(b, "select avatar_updated_at from users where id = $1", [a]);
    expect(avatar_updated_at).not.toBeNull();
    await db.as(a, "select delete_avatar()");
    expect(await db.as(b, "select image from get_avatar($1)", [a])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("trash talk", () => {
  it("members post and read; outsiders can't; posting bumps live sync; rate-limited", async () => {
    const a = await db.signup(); const b = await db.signup(); const outsider = await db.signup();
    const L = await league(a);
    await join(b, L.code);
    const v0 = Number((await db.as(a, "select version from leagues where id = $1", [L.id]))[0].version);
    const [{ id }] = await db.as(a, "select post_message($1, $2) as id", [L.id, "  Catch me if you can  "]);
    expect(Number((await db.as(a, "select version from leagues where id = $1", [L.id]))[0].version)).toBeGreaterThan(v0);
    const seen = await db.as(b, "select body from league_messages where league_id = $1", [L.id]);
    expect(seen.map((r) => r.body)).toEqual(["Catch me if you can"]);
    expect(await db.as(outsider, "select * from league_messages where league_id = $1", [L.id])).toHaveLength(0);
    await expectFail(db.as(outsider, "select post_message($1, 'hi')", [L.id]), "not_found");
    await expectFail(db.as(b, "select delete_message($1)", [id]), "not_found");     // not B's message
    await expectFail(db.as(b, "insert into league_messages (league_id, user_id, body) values ($1, $2, 'x')", [L.id, b]), "permission denied");
    await expectFail(db.as(a, "select post_message($1, '   ')", [L.id]), "Say something");
    await expectFail(db.as(a, "select post_message($1, $2)", [L.id, "x".repeat(281)]), "280");
    await db.as(a, "select delete_message($1)", [id]);
    for (let i = 0; i < 10; i++) await db.as(b, "select post_message($1, $2)", [L.id, `msg ${i}`]);
    await expectFail(db.as(b, "select post_message($1, 'one more')", [L.id]), "rate_limited");
  });
});

// ---------------------------------------------------------------------------
describe("the RIVAL Pledge", () => {
  it("is required before logging, enforced by the server, and recorded once", async () => {
    const u = await db.signup({ noPledge: true });
    await expectFail(db.log(u, "run", TODAY, { min: 20 }), "pledge_required");
    const [{ ts }] = await db.as(u, "select take_pledge() as ts");
    expect(ts).toBeTruthy();
    const [{ ts: again }] = await db.as(u, "select take_pledge() as ts");
    expect(new Date(again).getTime()).toBe(new Date(ts).getTime());    // first pledge date is kept
    await db.log(u, "run", TODAY, { min: 20 });
    const [me] = await db.as(u, "select pledged_at from my_account()");
    expect(me.pledged_at).not.toBeNull();
    await expectFail(db.as(u, "update users set pledged_at = null"), "permission denied");
  });
});

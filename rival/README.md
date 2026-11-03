# RIVAL — Fantasy Fitness

**Every Move Counts. Every Week Matters.**

**Live: https://tresterlingiii.vercel.app** — sign up, create a league, and send the invite link to friends and family.

RIVAL runs private head-to-head fantasy leagues for friends and family. Each person is their own team. Real activity (steps, cardio, strength, mobility) turns into fantasy points. Every week you face a new opponent from a round-robin schedule. A season brings standings, playoffs and a champion.

This folder is a self-contained app. It doesn't touch the gift registry at the repository root.

---

## Architecture

| Layer | Choice | Why |
|---|---|---|
| UI | Next.js 14 (App Router), React, Tailwind, SWR, lucide icons | Mobile-first PWA-style web app, one codebase for phones and desktop |
| API | Next.js route handlers on Vercel (Node runtime) | Validates sessions and input; never computes or accepts points |
| Database | Postgres (Neon) | Real hosted relational DB with row-level security |
| Scoring and league engine | PL/pgSQL `SECURITY DEFINER` functions | **Server-authoritative**: points are derived inside the database from stored activity records |
| Auth | Email + password (bcrypt), opaque session tokens (SHA-256 stored), httpOnly cookies | Persistent accounts that work across devices |
| Realtime | Server-Sent Events, watching a per-league `version` counter | Every write bumps the counter in the same transaction; open devices refetch within ~2s |
| Weekly processing | Vercel Cron (daily) **and** an idempotent `rival_advance_league()` that runs on every league load | Weeks finalize correctly even between cron runs |

```
rival/
  db/migrations/      001_core · 002_scoring · 003_league · 004_security · 005_personal
  db/scripts/migrate.ts
  src/lib/            db (RLS transactions), auth, league snapshot, projections, validation
  src/app/api/        auth, me, workouts, plans, activity, leagues (+ stream, actions), cron, health
  src/app/(app)/      home · matchup · league (+ manage) · activity · profile · onboarding
  src/components/     design system (ui/*), scoreboard, breakdown, standings, bracket, feed …
  tests/              db.test.ts (42), projections.test.ts (5), e2e/two-player.cjs (16 steps)
```

### Security model

- The web app connects as **`rival_app`**. That Postgres role owns nothing, has no `BYPASSRLS`, and has **no INSERT/UPDATE/DELETE on any table**.
- Each request runs in a transaction that sets `rival.user_id` after the session cookie is verified. RLS policies use it:
  - workouts, plans and goals: visible only to their owner;
  - leagues, members, matchups and history: visible only to active league members;
  - league-mates can't read each other's email (column-level grant).
- All writes go through validated database functions: `log_workout`, `update_workout`, `join_league`, `start_season`, and so on. Internal functions such as `rival_score_day` and `rival_finalize_matchup` aren't executable by the app role.
- Password hashes and sessions live in tables the app role can't select.
- CSRF protection uses an Origin check on every mutation plus `SameSite=Lax` cookies.
- Sign-in and invite-code guessing are rate-limited. Unknown emails take as long to reject as wrong passwords.

### Scoring (RIVAL defaults; commissioners can customise per league)

| Activity | Points | Daily cap |
|---|---|---|
| 1,000 steps | 2 | 25,000 steps |
| 10 min cardio (run, cycle, swim, HIIT, sport, hike…) | 4 | 120 min |
| 10 min strength | 4 | 90 min |
| 10 min yoga / mobility | 3 | 60 min |
| Completed planned workout | 5 | 1 per day |
| Personal daily goal achieved | 5 | 1 per day |
| 5 active days in a week | 10 bonus | weekly |
| **Any single day** | | **60 points max** |

- **Partial increments.** Points accrue per minute and per step, rounded *down* to 0.1, so 25 min of cardio = 10.0.
- **No double counting.** Steps count once per day: the daily total or the sum of logged walks, whichever is higher. Walk minutes aren't also scored as cardio. One daily step total per day.
- **The RIVAL Pledge.** Before logging anything, every player signs a short honor pledge (log honestly, take care of yourself, keep it fun, fix mistakes). It's enforced server-side, and league-mates see a *Pledged* mark.
- **Abuse limits.** Entries can be dated today or yesterday only (in the user's time zone). Max 240 min per entry, 8 h and 20 entries per day, 100k steps per entry. Duplicates are rejected (idempotency key plus a 10-minute identical-entry check, serialised per user). Entries are labelled self-reported.
- **Fair across abilities.** Personal goals (active minutes *or* steps) earn the same bonus for everyone. Goal changes take effect the next day. Plans must be made at least a day ahead.
- **Recalculation.** Scores are computed from current records, so edits, deletes and commissioner rule changes recalculate all non-final weeks instantly. Weeks lock at **12:00 AM Tuesday** (league time zone) and their scores are snapshotted.
- **Privacy.** League-mates see points per category only. Minutes and steps are shown to them only if a user enables *Share workout details*. Distance and notes are always private.

### League rules

- 4–20 member cap. A season can start once 2 people have joined. 1–26 week regular season. 0/2/4/6/8 playoff teams.
- **Scheduling.** Circle-method round robin: every team plays once per week, every pair meets once per rotation, odd leagues get evenly spread byes, and home/away is balanced to within one game. Mid-season joins and removals rebuild only weeks that haven't started.
- **Results.** W/L/T, points for/against, standings by win % then PF.
- **Playoffs.** Single elimination with reseeding. With 6 teams the top 2 get byes. Playoff ties go to the higher seed. Champion history is kept across seasons.
- **Leaving or removal.** A member who leaves or is removed forfeits their in-progress matchup and drops out of the standings.
- **Win probability.** A normal model over each team's daily pace. It's shown only after 3 in-season days of data, and is presentation-only.

---

## Run locally

Requirements: Node 20+, a Postgres 14+ you can connect to as a superuser or owner.

```bash
cd rival
npm install
cp .env.example .env.local

# 1. Create a database, then apply migrations as its owner (this also creates rival_app):
createdb rival_dev
MIGRATION_DATABASE_URL=postgres://postgres@localhost:5432/rival_dev npm run db:migrate

# 2. Point the app at the restricted role (local trust auth shown):
echo 'DATABASE_URL=postgres://rival_app@localhost:5432/rival_dev' >> .env.local

npm run dev            # http://localhost:3000
```

Open two different browsers (or a normal and a private window) to play as two people.

### Tests

```bash
# Database + scoring + RLS + scheduling + playoffs (creates a throwaway DB "rival_test")
TEST_ADMIN_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test

# Two-player end-to-end against a running server (uses Playwright + Chromium)
npm run build && npx next start -p 3100 &
BASE_URL=http://localhost:3100 npm run test:e2e
```

## Deploy online (Vercel + Neon, both free tiers)

1. **Neon.** Create a project (Postgres 16). Copy the owner connection string (direct, not pooled).
2. **Vercel.** Create a project from this repository with **Root Directory = `rival`**. In Settings → Build, set the **Build Command** to `npm run db:migrate && next build`.
3. **Environment variables** (Production + Preview):
   - `MIGRATION_DATABASE_URL`: Neon owner connection string (direct host).
   - `RIVAL_APP_DB_PASSWORD`: a random password (`openssl rand -hex 24`). The migration sets it on `rival_app`.
   - `DATABASE_URL`: `postgresql://rival_app:<that password>@<your-endpoint>-pooler.<region>.aws.neon.tech/neondb?sslmode=require`. Use the **pooled** host (`-pooler`).
   - `CRON_SECRET`: a random string (`openssl rand -hex 32`).
4. **Deploy.** The build applies migrations, then builds. `vercel.json` registers the daily cron at `/api/cron/advance`.
5. **Deployment Protection.** In Settings, set Vercel Authentication to **Only Preview Deployments** (or off) so friends can open the production URL. RIVAL has its own login.
6. **Verify.** Open `https://<project>.vercel.app/api/health`, which should report `db: connected`. Then run the E2E suite against the live URL:
   `BASE_URL=https://<project>.vercel.app npm run test:e2e`

---

## What's been verified

| Suite | Result | Where |
|---|---|---|
| Database: scoring, caps, double counting, goals, plans, consistency, edits/deletes, rule changes, idempotency, concurrent double-taps, invalid entries, timezone boundaries, RLS/permissions, invite codes, rate limits, scheduling for 2/4/5/7/8/20 teams, mid-season joins, finalization, ties, standings, playoffs (2- and 6-team), multi-week catch-up, forfeits, live-sync counter | **42 / 42 pass** | `tests/db.test.ts` (real Postgres 16, run as `rival_app`) |
| Projections / win probability | **5 / 5 pass** | `tests/projections.test.ts` |
| Two-player E2E in two isolated browser sessions (separate cookie jars, mobile viewport) against a local production build + Postgres | **16 / 16 pass** | `tests/e2e/results/localhost_3100/` |
| **Same E2E against the live deployment** (tresterlingiii.vercel.app → Vercel + Neon), 2026-11-03 | **16 / 16 pass** — live update reached the other player in ~0.65 s | `tests/e2e/results/tresterlingiii.vercel.app/` |

The E2E run covers the full user journey:
- **Signup and joining.** Sign up as A, create a league, sign up B, join by code.
- **Shared view and season start.** Both see the same roster. The commissioner starts the season and the schedule is generated.
- **Live updates.** A logs a run and **B's open scoreboard updates without reloading in < 1 s**. Then B logs, and A's screen updates.
- **Consistency.** Both devices show identical scores and standings.
- **Data integrity.** Duplicate and invalid entries are rejected.
- **Access control.** B can't edit or delete A's workout (404), forged `points` fields are ignored, anonymous requests are refused (401), outsiders get 404, and cross-origin writes are refused (403).
- **Persistence.** Both close their sessions and sign in fresh with all data intact. Sign-out invalidates the session server-side.

Week rollover, playoffs and timezone edges are verified with a controllable database clock in `tests/db.test.ts`. A live deployment can't be time-travelled.

## Limitations and unfinished work

- **No native health sync yet.** Apple Health and Android Health Connect need a native companion app, because browsers can't read them. The schema already has `source` and `external_id` (unique per user) for deduplicated imports. Profile shows them honestly as *Not available*.
- **No email verification or password reset.** These need an email provider such as Resend or Postmark. Accounts are email + password only.
- **Live sync is near-real-time.** It polls a version counter (~1.5 s), not database push. Each open screen holds one serverless stream that reconnects every ~55 s, which is fine for friends-and-family scale.
- **Activity is self-reported.** It's bounded by caps, date windows and duplicate checks, but there's no league-mate flagging or commissioner voiding yet.
- **Mid-season joins and leaves.** A new member's first matchup is the next Monday. Leaving forfeits the current week.
- **Not yet built:** league deletion, account deletion, push notifications and chat.
- **Time zones** are typed as IANA names (e.g. `America/Chicago`), not picked from a list.

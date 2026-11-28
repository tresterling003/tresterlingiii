# Christmas HQ

**Live: https://tresterlingiii.vercel.app**

> The site also serves **Earshot**, the audiobook app from `../audiobooks`, at `/earshot`. Its built files live in `public/earshot/` (regenerate with `npm run build:hq` in `audiobooks/`).
>
> This folder is named `rival/` because the existing Vercel project (which used to host RIVAL, now in `rival-fitness/`) builds this folder. Christmas HQ reuses that project's database and environment variables: its tables live in a separate `hq` schema, RIVAL's tables are untouched, and the migration grants the existing `rival_app` role access to `hq`. A `public/sw.js` removes RIVAL's old offline service worker from browsers that had it.

A family Christmas dashboard. Everyone makes a wishlist with sizes, colors, photos and buy links (or open-ended gift ideas). Family members secretly claim gifts so nobody doubles up, track what they've bought and wrapped, plan a budget, find ideas, and play quick Christmas games to climb a family leaderboard. Themes, effects and avatars are free in Settings.

The layout borrows the feel of myClassroom's tool board: pastel tool tiles in a rounded panel, a rounded font (Fredoka), round icon buttons along the top and a five-tab bar at the bottom.

## What's in it

| Tab / tile | What it does |
|---|---|
| **Home** | Christmas countdown, coins, 12 tool tiles, family activity, gift progress, daily coins |
| **My Wishlist** | Add wishes (exact pick or gift idea, top wish, brand, size, color, price, up to 5 links, photo, notes), paste a whole list from Notes, About Me (sizes, favorite colors and brands, interests, "please skip") |
| **Family** | Create or join families with a 6-character code or an invite link (`/join/CODE`), see everyone's lists, leave a family. You can be in up to 10 families (for example your household plus grandparents). |
| **Person's list** | "I'll get this" claims a wish. Other family members see who's getting it. **The person receiving never sees any claim.** Plan off-list gifts too. |
| **Gift Tracker** | Your gifts grouped by person: To buy → Bought → Wrapped → Given, with prices and per-person budget bars. Private to you. |
| **Budget** | Total budget, per-person budgets, "split evenly", spent vs. left |
| **Gift Finder** | Pick a person, budget, interests (pre-filled from their list and About Me) and gift type. Shows their unclaimed wishes in budget plus ideas from a bank of about 50, with a shopping search link and "Plan it". |
| **Games** | Present Catch (canvas, touch or arrow keys), Ornament Match (memory), Jingle Jumble (word scramble). Coins earned feed a weekly family leaderboard. |
| **Settings** | Name, avatar (12), avatar color, theme (6, including a dark "Silent Night") and effect (snowfall, string lights, twinkle stars). All free. |

## Stack

Next.js 14 (App Router), React, Tailwind, SWR, lucide icons, Postgres (`pg`), zod, bcrypt. Same shape as `rival/`.

## Privacy and security

- Email + password accounts (bcrypt). Sessions are random tokens stored as SHA-256 hashes, in httpOnly SameSite=Lax cookies, valid 90 days.
- You can only read wishlists, About Me and photos of people you share a family with. Everything else returns 403/404.
- Gift rows are only ever returned to their giver. A wish's claim is computed per viewer and is always `null` when the viewer owns the wish.
- Every write checks the Origin header (CSRF). Sign-in, sign-up and join codes are rate limited.
- Links must be `https://`. Bare domains are upgraded and anything else is rejected.
- Coins are awarded on the server: per-game score limits, minimum and maximum play time, one result every 4 seconds, at most 150 coins a day. Scores are still reported by the browser, so a determined person could fake them up to those limits. That's fine for family fun.

## Run locally

```bash
cd rival
npm install
echo 'DATABASE_URL=postgresql://USER:PASS@localhost:5432/hq' > .env.local
npm run db:migrate
npm run build && npm start         # or: npm run dev
BASE_URL=http://localhost:3000 npm run test:e2e   # SHOTS=1 saves screenshots to tests/results/
```

## Deploy

It deploys automatically: pushing to `main` builds this folder on the existing Vercel project, runs `npm run db:migrate` (creates or updates the `hq` schema) and then `next build`. It uses the project's existing `DATABASE_URL` and `MIGRATION_DATABASE_URL`.

To host it somewhere fresh instead: create a Vercel project with Root Directory `rival`, connect a Neon database (Storage tab) so `DATABASE_URL` is set, and deploy. Check `/api/health` shows `db: connected`.

## Tested

`tests/e2e.cjs`: **31/31 pass** against a local production build on Postgres 16, including a run on a copy of RIVAL's database with the app connected as the restricted `rival_app` role, which is how production runs. Also **31/31 against the live site** (https://tresterlingiii.vercel.app) on 2026-11-25. To rerun it from a sandbox with an HTTPS proxy: `NODE_EXTRA_CA_CERTS=<ca bundle> BASE_URL=https://tresterlingiii.vercel.app npm run test:e2e`. Each run leaves three `@example.com` test accounts in their own family; real families never see them. It runs three people in separate sessions (desktop and phone) and covers sign-up, invite links, pasting from Notes, photos, About Me, secret claims (including that the recipient sees nothing in their list, gift plan or feed), double claims, gift status, budgets, outsider access, CSRF, games and coin caps, switching themes in Settings, the family leaderboard (outsiders excluded), a full Ornament Match round, Present Catch on a phone, sign-out, and no browser errors.

## Not built yet

- Email verification and password reset need an email provider such as Resend.
- No push notifications. Family activity refreshes every 30 seconds while the app is open.
- No Secret Santa draw. It would fit as another tile.

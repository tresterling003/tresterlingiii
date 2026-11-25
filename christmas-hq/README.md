# Christmas HQ

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
cd christmas-hq
npm install
echo 'DATABASE_URL=postgresql://USER:PASS@localhost:5432/hq' > .env.local
npm run db:migrate
npm run build && npm start         # or: npm run dev
BASE_URL=http://localhost:3000 npm run test:e2e   # SHOTS=1 saves screenshots to tests/results/
```

## Deploy (Vercel + Neon, both free)

1. **Vercel → Add New → Project →** import this repo. Set **Root Directory** to `christmas-hq`. `vercel.json` already sets the build command to run migrations first.
2. **Database.** In the new project, open **Storage → Create Database → Neon (Postgres)** and connect it to the project. This adds `DATABASE_URL` automatically. Don't reuse RIVAL's database: both apps have a `users` table.
3. **Deploy** (or Redeploy if the first build ran before the database existed).
4. **Deployment Protection.** In Settings, set Vercel Authentication to *Only Preview Deployments* (or off) so family can open the production URL. The app has its own login.
5. **Check** `https://<project>.vercel.app/api/health` reports `db: connected`, then sign up, create your family and share the invite link.

## Tested

`tests/e2e.cjs`: **31/31 pass** against a local production build and Postgres 16. It runs three people in separate sessions (desktop and phone) and covers sign-up, invite links, pasting from Notes, photos, About Me, secret claims (including that the recipient sees nothing in their list, gift plan or feed), double claims, gift status, budgets, outsider access, CSRF, games and coin caps, switching themes in Settings, the family leaderboard (outsiders excluded), a full Ornament Match round, Present Catch on a phone, sign-out, and no browser errors.

## Not built yet

- Email verification and password reset need an email provider such as Resend.
- No push notifications. Family activity refreshes every 30 seconds while the app is open.
- No Secret Santa draw. It would fit as another tile.

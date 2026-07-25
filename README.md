# Family Gift Registry

A private gift registry with two sides:

- **`/admin`** — you add, edit, and reorder gifts, and customize the theme. You can never see which gifts have been claimed or by whom — that data is structurally inaccessible to every admin-facing code path (see "How privacy is enforced" below).
- **`/g/<FAMILY_ACCESS_SLUG>`** — the unlisted link you share with family. No login required. Family members browse gifts and claim one as "bought" by entering their name, so others can see it's spoken for.

Gifts and claims live in a real Postgres database — nothing is stored in the browser, so nothing gets wiped by a cache clear or a new device.

## Stack

Next.js (App Router) + TypeScript, Prisma + Postgres, Tailwind CSS, Framer Motion, deployed on Vercel.

## One-time setup (~10 minutes)

1. **Database — [Neon](https://neon.tech)** (free tier)
   - Create an account and a new project.
   - From the project dashboard, copy the **pooled** connection string → this is `DATABASE_URL`.
   - Copy the **direct** (unpooled) connection string → this is `DIRECT_URL`.

2. **Hosting — [Vercel](https://vercel.com)** (free tier)
   - Create an account with GitHub, then "Add New Project" → import this repository.
   - Don't deploy yet — add environment variables first (next step).

3. **Environment variables** — in the Vercel project's Settings → Environment Variables, add (see `.env.example` for descriptions):
   - `DATABASE_URL`, `DIRECT_URL` — from Neon.
   - `AUTH_SECRET` — random string, e.g. run `openssl rand -hex 32` locally.
   - `FAMILY_ACCESS_SLUG` — random string, e.g. `openssl rand -hex 16`. This becomes part of the family link: `https://<your-project>.vercel.app/g/<FAMILY_ACCESS_SLUG>`.
   - `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` — your admin login. Used once by the seed step below; you can remove them from Vercel afterward if you like.

4. **Blob storage** (for theme background image uploads) — in Settings → Storage, click "Create Database" → choose **Blob** → connect it to this project. This automatically adds `BLOB_READ_WRITE_TOKEN`.

5. **Deploy** — click Deploy. The build runs `prisma migrate deploy` against Neon automatically, then builds the app.

6. **Seed the admin account** (one-time, from your own machine):
   ```bash
   npm install
   # Paste the same DATABASE_URL / DIRECT_URL / ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD
   # values you set in Vercel into a local .env file, then:
   npm run db:seed
   ```

7. Visit `https://<your-project>.vercel.app/admin/login`, sign in, and add your first gifts. Share `https://<your-project>.vercel.app/g/<FAMILY_ACCESS_SLUG>` with family — that link is the only thing they need.

## Local development

```bash
npm install
cp .env.example .env   # fill in a local Postgres connection string, etc.
npx prisma migrate deploy
npm run db:seed
npm run dev
```

## How privacy is enforced

The admin side must never see purchase/claim data — this isn't just hidden in the UI, it's structural:

- `Gift` and `Claim` are separate tables with no Prisma-level relation between them, so `Gift`'s generated type has no `claims` field to accidentally select.
- `lib/db/gifts.ts` (admin queries) and `lib/db/claims.ts` (claim queries) are separate files. `lib/db/family-gifts.ts` is the *only* module allowed to combine them, and it's used solely by the public family route.
- An ESLint rule blocks `app/admin/**` and `app/api/admin/**` from ever importing `lib/db/claims` or `lib/db/family-gifts` — a violation fails linting/CI, not just code review.
- Admin API responses are typed as `AdminGiftDTO`, which has no `claimed`/`claimedBy` fields at all.

## Changing the look for a holiday, sports team, etc.

Go to `/admin/theme` — colors, background image, and an animation pack (confetti, snow, fireworks, paw prints, team spirit) are all editable there and apply to the family page immediately, no redeploy needed.

# Classroom HQ

A private teaching dashboard for a teacher juggling multiple classes — one page per class that tracks your pacing
and what you've actually covered, drafts lessons/slides/notes/worksheets/quizzes/tests/projects with AI, and grades
photographed student work against a rubric or answer key you provide.

Single-login, single-teacher app — there's no student-facing side.

## What's in here

- **Per-class dashboard** — each class gets its own page: overview, curriculum (unit-by-unit pacing), a day-by-day
  timeline of what you've covered, a resource library, and a roster.
- **Import from your planning chats** — paste the export from a chat conversation where you've been tracking a
  class, and it's parsed into a structured curriculum + timeline automatically. Safe to run more than once per class.
- **AI resource generation** — pick a type (lesson plan, slide outline, notes, worksheet, quiz, test, or project) and
  a topic; it drafts something classroom-ready as fully editable Markdown.
- **Photo-based grading** — create an assignment with a rubric and/or an answer key, snap a photo of a student's
  test/project/worksheet, and get a per-criterion AI grade with feedback — which you review and adjust before it's
  final. Nothing is ever auto-finalized without you.

## Stack

Next.js (App Router) + TypeScript, Prisma + Postgres, Tailwind CSS, the Anthropic SDK (Claude), deployed on Vercel
with Vercel Blob for photo storage.

## One-time setup (~10 minutes)

1. **Database — [Neon](https://neon.tech)** (free tier)
   - Create an account and a new project.
   - From the project dashboard, copy the **pooled** connection string → this is `DATABASE_URL`.
   - Copy the **direct** (unpooled) connection string → this is `DIRECT_URL`.

2. **Hosting — [Vercel](https://vercel.com)** (free tier)
   - Create an account with GitHub, then "Add New Project" → import this repository.
   - Don't deploy yet — add environment variables first (next step).

3. **Claude API key — [console.anthropic.com](https://console.anthropic.com)**
   - Create an API key and make sure billing is enabled on the account (generation and grading calls use it).
   - This becomes `ANTHROPIC_API_KEY`.

4. **Environment variables** — in the Vercel project's Settings → Environment Variables, add (see `.env.example`
   for full descriptions):
   - `DATABASE_URL`, `DIRECT_URL` — from Neon.
   - `AUTH_SECRET` — random string, e.g. run `openssl rand -hex 32`.
   - `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` — your login. Used once by the seed step below; safe to remove
     from Vercel afterward.
   - `ANTHROPIC_API_KEY` — from step 3.
   - `ANTHROPIC_MODEL` (optional) — defaults to `claude-opus-5` for the best quality. If you're generating or
     grading at high volume and want to cut cost, set it to `claude-sonnet-5` or `claude-haiku-4-5`.

5. **Blob storage** (for photos of graded work) — in Settings → Storage, click "Create Database" → choose **Blob**
   → connect it to this project. This automatically adds `BLOB_READ_WRITE_TOKEN`.

6. **Deploy** — click Deploy. The build runs `prisma migrate deploy` against Neon automatically, then builds the app.

7. **Seed your login** (one-time, from your own machine):
   ```bash
   npm install
   # Paste the same DATABASE_URL / DIRECT_URL / ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD
   # values you set in Vercel into a local .env file, then:
   npm run db:seed
   ```

8. Visit `https://<your-project>.vercel.app/login`, sign in, and add your first class. You'll land on that class's
   Import page — paste your planning chat export there to seed its curriculum and timeline.

## Local development

```bash
npm install
cp .env.example .env   # fill in a local Postgres connection string, your Anthropic key, etc.
npx prisma migrate deploy
npm run db:seed
npm run dev
```

## A note on cost

Every resource generation and every photo grade is a real Claude API call, billed to your Anthropic account.
`claude-opus-5` (the default) gives the best quality; switching `ANTHROPIC_MODEL` to `claude-sonnet-5` cuts the
per-call cost substantially with a smaller quality tradeoff, and `claude-haiku-4-5` is cheaper still if you're
grading a large stack of submissions at once. You can change this at any time in your environment variables without
touching code.

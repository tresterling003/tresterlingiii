# Cartoon Character Creator

A personality-quiz style character discovery tool for Digital Arts & Animation 1 (grades 10–12).
Students answer 13 quick questions and leave with:

1. a personalized **Character Brief**,
2. a **story premise**, and
3. a one-click **ChatGPT prompt** that already contains their brief and asks for one image with 5 full-body inspiration sketches.

No accounts, no paid APIs, no server. Answers are stored only in the student's own browser (`localStorage`) so a refresh doesn't erase their work. Nothing is uploaded.

## Share it with students

**Live link (after this is merged to `main`):**
https://tresterling003.github.io/tresterlingiii/character-creator/play/

The repository already publishes with GitHub Pages from `main`, and the ready-to-serve site is committed in `play/`, so merging is all it takes.

**Google Classroom:** Classwork → Create → Assignment (or Material) → Add → **Link** → paste the link above. Students open it on a Chromebook, phone, or tablet; nothing to install or sign in to.

Suggested assignment text:

> Take the Character Creator quiz. When you finish, click **Download Results as PDF** and turn the PDF in here. Then copy your 5-sketch prompt into ChatGPT to make your inspiration sheet.

### Other ways to publish

The site is plain static files, so any static host works:

- **Netlify (drag and drop):** run `npm run build`, then drag the `dist/` folder onto https://app.netlify.com/drop.
- **Vercel / Netlify from GitHub:** import this repository, set the root directory to `character-creator`, build command `npm run build`, output directory `dist`.

Use an `https://` link. The one-tap copy button needs it (on plain `http://` the app falls back to an older copy method, then to a select-and-copy box).

## Run or change it

```bash
cd character-creator
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests for the brief, story and prompt wording
npm run build        # type-check + production build in dist/
npm run build:live   # rebuild the published copy in play/ (commit it to update the live site)
```

Full browser test of the student flow (quiz, refresh, editing, clipboard, PDF, start over) at desktop, phone and tablet sizes:

```bash
npm run build
NODE_PATH=$(npm root -g) npm run e2e    # needs Playwright + Chromium available
```

### Editing the questions

Everything students read lives in [`src/data/questions.ts`](src/data/questions.ts). Each answer has a `label` (what the card says) and the phrases used to write the brief and story (`brief`, `phrase`). Change wording, add answers, or add a question there; the results page and prompt follow automatically.

The prompt template and the "What to do next" steps are in [`src/lib/brief.ts`](src/lib/brief.ts).

## How it works

| Piece | Where |
|---|---|
| Questions and answer cards | `src/data/questions.ts` |
| Brief, story premise, prompt text | `src/lib/brief.ts` |
| PDF (multi-page, wrapped text) | `src/lib/pdf.ts` |
| Copy to clipboard with fallbacks | `src/lib/clipboard.ts` |
| Saved progress | `src/lib/storage.ts` |
| Screens | `src/App.tsx`, `src/components/` |

Notes for the classroom:

- **The quiz does not generate images.** It writes the prompt; the student pastes it into an AI tool that supports image generation. The results page says so plainly.
- **Every result is editable.** Edits flow into the prompt and the PDF. Renaming the character also renames them in the story.
- **PDF:** names written with emoji or non-Latin alphabets can't be drawn by the built-in PDF font, so in that case the app opens the browser's print window (choose *Save as PDF*) with a print layout that contains the full brief and prompt.
- **Shared devices:** "Start Over" erases the saved character from that browser.

## Credits and licenses

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). All artwork is bundled with the app (no external image requests, so nothing can fail to load on a filtered school network).

# CreateSpace

**Make space for creativity.**

CreateSpace is an all-in-one toolbox for graphic designers, animators, filmmakers, photographers,
content creators, artists and freelancers. It's a single place with practical tools that solve
everyday creative problems.

> **Current version: 0.1.0 (Foundation).** This release is the site's frame: dashboard,
> navigation, branding, search, favorites and themes. **None of the 14 tools work yet.** Each one is
> clearly labelled *Coming soon* and its page says so.

## Live version

**Open it here: https://claude.ai/artifact/Gua8Qo63JjnndtTuu1aFM6** (no setup needed).

This hosted copy starts private to the owner; use **Share** on that page to give others access.
It's built with `npm run build:embedded`, which keeps page navigation in memory because the
hosting frame can't change the address bar. Everything else behaves the same as the normal build.
The only difference: refreshing that page returns to the dashboard (your favorites and theme are kept).

## Getting started

You need [Node.js](https://nodejs.org) 20.19+ or 22.12+.

```bash
cd createspace
npm install        # first time only: downloads the libraries
npm run dev        # start the development server, then open the printed address (http://localhost:5173)
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with instant reload while you edit |
| `npm run build` | Type-checks the code and builds the production site into `dist/` |
| `npm run build:embedded` | Builds the hosted copy (into `dist-embedded/`) used for the live link above |
| `npm run preview` | Serves the production build locally to check it before publishing |
| `npm test` | Unit tests (search ranking, favorites helpers, tool registry) |
| `npm run e2e` | Browser test of every acceptance criterion at desktop, tablet and phone size (run `npm run build` first) |

## Current features (0.1.0)

- **Dashboard** (home page): greeting, search, your Favorites, every tool with category filters, What's New and a *Request a Tool* entry point (marked **Planned**)
- **Navigation**: sidebar on desktop; top bar + slide-out menu on tablets and phones
- **Tool cards**: name, icon, description, category, bookmark button and status for each tool, each with its own accent color
- **Favorites**: bookmark or un-bookmark any tool; saved in the browser and kept after refresh
- **Search**: live, matches names, descriptions, categories and keywords (press `/` to jump to search)
- **Category filters** and dedicated category pages
- **Light / dark / system theme**, remembered across visits
- **Tool pages**: a shared layout (title, description, status, bookmark, workspace area) used by every tool
- **Settings**: theme, clear favorites, reset all saved data
- **What's New** page, **404 page**

## Project structure

```
createspace/
├── index.html                 Page shell + early theme script (prevents a white flash in dark mode)
├── public/favicon.svg         Brand mark
├── scripts/e2e.mjs            Browser acceptance test
└── src/
    ├── main.tsx               Entry point: fonts, styles, app-wide providers, router
    ├── app/router.tsx         Every page address
    ├── tools/                 ★ Tool architecture
    │   ├── registry.ts          THE list of tools: id, name, description, category, icon, accent, keywords, route, status
    │   ├── categories.ts        Category list (drives filters + nav)
    │   ├── status.ts            Status labels (Coming soon, In development, Beta, Available)
    │   └── types.ts             The shape every tool entry must have
    ├── components/
    │   ├── brand/Logo.tsx       Wordmark + symbol
    │   ├── layout/              App shell, sidebar, mobile drawer, nav config
    │   ├── tools/               ToolCard, ToolGrid, BookmarkButton, CategoryFilter, ToolPageLayout, …
    │   └── ui/                  Generic pieces: Button, Badge, SearchInput, EmptyState, PageHeader, ThemeToggle
    ├── pages/                 One file per page
    ├── state/                 ThemeProvider, FavoritesProvider (app-wide state)
    ├── hooks/                 useToolFilters (search/filter in the URL), useDocumentTitle
    ├── lib/                   Plain logic: storage, search, favorites, theme (+ unit tests)
    ├── data/updates.ts        What's New entries
    └── styles/index.css       Design tokens (colors, fonts, shadows) for light & dark
```

### How to add a tool later

1. Build its interface in `src/tools/<tool-id>/`.
2. In `src/tools/registry.ts`, set its `status` (e.g. `'beta'`) and add
   `workspace: lazy(() => import('./<tool-id>/MyTool'))`.

The dashboard, search, filters, navigation counts, favorites and the tool's page
(`/tools/<tool-id>`, wrapped in `ToolPageLayout`) all pick it up automatically. A tool's workspace is
only shown when its status is *beta* or *available*, so an unfinished tool can't appear usable by accident.

### Key decisions (plain-language)

- **One registry file.** Every page reads tools from one list, so adding a tool is one edit instead of many.
- **Search and filters live in the address bar** (`?q=color&category=creative`), so Back, refresh and shared links keep them.
- **Saved data goes through `src/lib/storage.ts`.** Keys are namespaced (`createspace:v1:…`), bad data is ignored rather than crashing, and when accounts and cloud sync arrive this is the one file to change.
- **Semantic color tokens** (`bg-surface`, `text-muted` …) in `styles/index.css` define both themes in one place.
- **Fonts are bundled** (Inter + Bricolage Grotesque via Fontsource), with no calls to outside font services.
- **Tools load on demand.** Each tool's code downloads only when someone opens it, which keeps the dashboard fast as tools are added.

## Hosting note

This is a single-page app using real URLs (`/tools/color-studio`). When it's published, the host must
send every unknown path to `index.html` (a "SPA fallback"). Netlify, Vercel and Cloudflare Pages
support this with a one-line setting. That will be set up as part of deployment, which isn't done yet.

## Known limitations

- No individual tool works yet (by design for this milestone).
- *Request a Tool* is a placeholder: nothing is collected or sent.
- Favorites and theme are stored per browser/device only (no accounts or sync yet).
- The live link is a claude.ai hosted page, private until you share it. A standalone public domain isn't set up yet.
- Tested in Chromium only (desktop, tablet and phone sizes); Safari and Firefox have not been tested.

See [ROADMAP.md](ROADMAP.md) for what's next and [CHANGELOG.md](CHANGELOG.md) for history.

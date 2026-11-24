# CreateSpace Roadmap & Development Checklist

Each task is built, tested and approved before the next starts.

## ✅ Task #001: Website Foundation (v0.1.0)

- [x] Brand: wordmark, crop-mark symbol, favicon, color & type system
- [x] Light and dark themes (plus "System"), remembered across reloads
- [x] Dashboard: greeting, search, Favorites, All Tools, category filters, What's New, Request a Tool (Planned)
- [x] Navigation: desktop sidebar, tablet/phone top bar + drawer
- [x] Tool cards with icon, description, category, bookmark, status
- [x] Favorites saved in LocalStorage, persist after refresh
- [x] Real-time search (name, description, category, keywords) + empty states
- [x] Central tool registry + shared tool-page layout
- [x] Settings, What's New, 404 pages
- [x] README, ROADMAP, CHANGELOG
- [x] Unit tests + browser acceptance test at 3 screen sizes
- [ ] **Awaiting approval**

## Version 1 tools (planned, not started)

| # | Tool | Category | Status |
|---|---|---|---|
| 1 | Color Studio (includes Gradient Maker) | Creative | Coming soon |
| 2 | Canvas Resizer | Creative | Coming soon |
| 3 | Storyboard Studio | Creative | Coming soon |
| 4 | Character Vault *(tentative)* | Creative | Coming soon |
| 5 | Pose Challenge | Creative | Coming soon |
| 6 | Background Remover | Content | Coming soon |
| 7 | Content Calendar | Content | Coming soon |
| 8 | Teleprompter | Content | Coming soon |
| 9 | Focus Room | Productivity | Coming soon |
| 10 | Brain Dump | Productivity | Coming soon |
| 11 | Creative Challenge | Creative | Coming soon |
| 12 | Deadline Tracker | Productivity | Coming soon |
| 13 | Rate Calculator & Project Estimator | Business | Coming soon |
| 14 | Invoice Maker | Business | Coming soon |

Categories are a proposal and easy to change in `src/tools/registry.ts`.

## Later (not scheduled)

- Public deployment (static host with SPA fallback)
- Working *Request a Tool* (needs a backend or form service; requires approval)
- Accounts and cloud sync of favorites and tool data (`src/lib/storage.ts` is the seam for this)
- Cross-browser testing (Safari, Firefox) and an accessibility audit

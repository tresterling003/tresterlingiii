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

## ✅ Task #002: Cloud Projects & Tool Suggestions (v0.2.0)

- [x] Suggest a Tool page + owner-only inbox with statuses
- [x] Cloud project folders from templates, nested folders
- [x] Upload, preview, download, versions, rename, move, delete
- [x] Works across computers via the person's claude.ai account; no keys or setup
- [ ] **Awaiting approval**

## ✅ Task #003: Business Dashboard + Favorites on Home (v0.3.0)

- [x] Income, expenses, contracts (with files), clients, overview, reminders, CSV export
- [x] Favorites tab removed; favorites at top of Home
- [ ] **Awaiting approval**

## ✅ Task #004: Background Remover (v0.4.0)

- [x] Automatic subject detection in the browser + plain-background removal
- [x] Brushes, color pick, edges, undo/redo, compare, backgrounds, PNG export, save to project
- [ ] **Awaiting approval**

## Version 1 tools (planned, not started)

| # | Tool | Category | Status |
|---|---|---|---|
| 1 | Color Studio (includes Gradient Maker) | Creative | Coming soon |
| 2 | Canvas Resizer | Creative | Coming soon |
| 3 | Storyboard Studio | Creative | Coming soon |
| 4 | Character Vault *(tentative)* | Creative | Coming soon |
| 5 | Pose Challenge | Creative | Coming soon |
| 6 | Background Remover | Content | **Beta (working)** |
| 7 | Content Calendar | Content | Coming soon |
| 8 | Teleprompter | Content | Coming soon |
| 9 | Focus Room | Productivity | Coming soon |
| 10 | Brain Dump | Productivity | Coming soon |
| 11 | Creative Challenge | Creative | Coming soon |
| 12 | Deadline Tracker | Productivity | Coming soon |
| 13 | Rate Calculator & Project Estimator | Business | Coming soon |
| 14 | Invoice Maker | Business | Coming soon |
| + | Business Dashboard | Business | **Beta (working)** |

Categories are a proposal and easy to change in `src/tools/registry.ts`.

## Later (not scheduled)

- Public deployment (static host with SPA fallback)
- Sync favorites to the account (currently per browser)
- Save tool work (palettes, storyboards…) straight into projects
- Cross-browser testing (Safari, Firefox) and an accessibility audit

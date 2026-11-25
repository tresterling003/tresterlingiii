# Changelog

All notable changes to CreateSpace. Versions follow [Semantic Versioning](https://semver.org).

## [0.4.0] Background Remover (2026-11-25)

### Added
- **Background Remover** (Beta): in-browser AI subject detection (U²-Net-p via ONNX Runtime Web, bundled; nothing uploaded), plain-background removal by color, erase/restore brushes, pick-a-color removal, edge cleanup/softness, undo/redo (Ctrl/⌘+Z), hold-to-compare, background color choice, PNG download, Save to My Projects, drag-drop and paste. Falls back to the color method where AI can't run.
- Reusable "Save to My Projects" dialog for tools.
- THIRD_PARTY_NOTICES.md.

## [0.3.0] Business Dashboard (2026-11-25)

### Added
- **Business Dashboard** (first working tool, Beta): income with paid/waiting status, due dates and overdue alerts; expenses by category; contracts with status, value, dates, notes and an attached file; clients summarized automatically; 12-month income chart; "Coming up" list; currency choice; CSV export of income and expenses. Private to each person, saved to their account, starts empty.

### Changed
- Removed the Favorites tab: bookmarked tools show at the top of Home. The old `/favorites` link opens Home.
- All Tools now says how many tools are ready to use.

## [0.2.0] Cloud Projects & Suggestions (2026-11-25)

### Added
- **My Projects**: cloud project folders saved to each person's account, private to them. Templates (Animation, Film & Video, Brand Identity, Photo Shoot, Social Content, Client Project, Blank) create ready-made folders and starter files (project brief, shot list).
- Upload files by button or drag-and-drop; preview images and video; download; upload new versions (last 10 kept, older ones downloadable); rename, move, delete files; create, rename and delete nested folders; delete projects. Stored files are cleaned up when deleted.
- **Suggest a Tool**: send tool ideas and follow their status. The site owner gets a private Inbox with everyone's suggestions, filters and status controls.
- Recent projects on the dashboard; Projects tab in the bottom bar (Settings moved to the top bar).
- Cloud e2e test (30 checks) using a test-only stand-in for the hosting platform.

### Changed
- "Request a Tool (Planned)" replaced by the working Suggest a Tool page; the old address redirects.

## [0.1.0] Foundation (2026-11-24, redesigned 2026-11-25)

### Changed (2026-11-25)
- Redesigned to a launcher style: soft grey background, rounded panels, square pastel tool tiles with large icons, pill-shaped controls, rounded Nunito font.
- Replaced the sidebar with a pill top bar and a bottom tab bar on all screen sizes; categories open in a sheet.
- "Request a tool" is now a dashed tile at the end of the grid.

### Added
- CreateSpace brand: wordmark, crop-mark symbol, favicon, warm off-white light theme and deep charcoal dark theme, per-tool accent colors.
- Dashboard with greeting, tool search, Favorites, All Tools with category filters, What's New, and a *Request a Tool* entry point marked **Planned**.
- Navigation: Home, All Tools, Favorites, Creative/Content/Productivity/Business Tools, What's New, Settings. Sidebar on desktop, drawer on tablet/phone.
- Central tool registry with all 14 planned Version 1 tools, every one labelled **Coming soon**.
- Tool cards with icon, description, category, bookmark control and status.
- Favorites (bookmarks) saved in LocalStorage; persist after refresh and sync between open tabs.
- Live search across names, descriptions, categories and keywords; `/` shortcut; helpful empty states.
- Category pages with in-category search.
- Shared `ToolPageLayout` (breadcrumb, title, description, status, bookmark, workspace area) with an honest "not available yet" workspace for unbuilt tools.
- Light / Dark / System theme, remembered across reloads, applied before first paint.
- Settings page: theme, clear favorites, reset all saved data.
- What's New page and 404 page.
- Live hosted copy on claude.ai, built with the new `npm run build:embedded` mode.
- Unit tests (Vitest) and a browser acceptance test (Playwright) at desktop, tablet and phone sizes.

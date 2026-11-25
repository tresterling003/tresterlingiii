# Changelog

All notable changes to CreateSpace. Versions follow [Semantic Versioning](https://semver.org).

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

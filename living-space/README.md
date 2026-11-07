# Living Space

A cozy, Tamagotchi-style home that turns your real day into events in an animated room.
Letters arrive at the door (Gmail), today's plans hang on the board (Google Calendar), the window shows your real sky (Open-Meteo), and devices on the desk light up when connected services report activity. A small resident, **Pip**, lives there and goes about its day.

The whole app *is* the room. There are no dashboard cards: every piece of information lives in an object you can click.

![The room on desktop](docs/room-desktop.png)

## Run it

```bash
cd living-space
npm install
cp .env.example .env.local      # optional; the room runs without it
npm run dev                     # http://localhost:3000
```

Production: `npm run build && npm start`. Tests: `npm test`. Typecheck: `npm run typecheck`.

On first launch you can pick **“Set up my real day”** (live mode) or **“Look around with sample data”** (demo mode). Switch any time under **Home → Mode**.

## Modes

| | Demo | Live |
|---|---|---|
| Mail, calendar, weather | Realistic sample data. Every panel shows a **SAMPLE DATA** stamp, the corner shows **Demo · sample data**, and the board sheet carries a SAMPLE stamp. | Only real data from connected services. If something isn't connected, the room says so and offers to connect. **Nothing is ever substituted.** |
| Dev tools (wrench, top right) | Deliver mail, set unread count, empty or sample calendar, event in 5 min, computer/phone events | Time-of-day and weather *scene* overrides only (data buttons are disabled) |

The dev tools appear in `npm run dev`, or in production when `NEXT_PUBLIC_ENABLE_DEVTOOLS=true`.

## Connecting Google (Gmail + Calendar)

1. In Google Cloud Console, create a project and enable the **Gmail API** and **Google Calendar API**.
2. Configure the OAuth consent screen. While it is in testing, add yourself as a test user.
3. Create an **OAuth client ID → Web application** with this authorised redirect URI: `${APP_URL}/api/auth/google/callback`
4. Fill in `.env.local`: `APP_URL`, `SESSION_SECRET` (32+ random chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Optional: `APP_OWNER_EMAIL` to lock the app to your account.
5. Restart, then go to **Home → Connections → Connect**.

**Scopes requested (minimum):** `openid email`, `gmail.readonly`, `calendar.events.readonly`.
Set `GOOGLE_ALLOW_MARK_READ=true` to request `gmail.modify` instead. The inbox then shows an explicit **Mark as read** button. Nothing is ever marked read automatically.

**Security:**
- OAuth uses the authorization-code flow with PKCE and a signed `state`.
- Access and refresh tokens are kept in an AES-256-GCM encrypted, `httpOnly`, `SameSite=Lax` cookie. Client JavaScript never sees them, and they are never stored in a database.
- All Google calls happen in server route handlers.
- Gmail and Calendar content is never written to `localStorage` or the service-worker cache.
- Disconnecting revokes the grant at Google.

**Behaviour:**
- **Mail** polls every 60 s, pauses while the tab is hidden or offline, and backs off on errors and 429s. The unread count comes from the INBOX label. The newest 20 unread messages are listed.
- **New-delivery detection** uses stable Gmail message ids plus an `internalDate` high-water mark. The first sync is treated as backlog (no animation), and an old email re-marked unread doesn't count as a delivery. See `src/domain/mail.ts` and its tests.
- **Calendar** fetches *today* only, using the local-day window the browser computes. That keeps DST days (23 h / 25 h) correct. It also sends your IANA zone, so all-day events land on the right date. It re-fetches when the date or the time zone changes, and refreshes every 5 min. Events are marked *Ended* by time only; it never claims you did them.

## Weather

[Open-Meteo](https://open-meteo.com) needs no key. Pick a city under **Home → Location**, or press **Use my location**, which asks the browser once. Coordinates are rounded to about 1 km and no precise position is stored. The server proxies and caches responses for 10 minutes, the client refreshes every 15 minutes, and the last forecast is kept for offline use.

## Phone alerts (Apple Shortcuts & automations)

A web page **cannot** read iPhone notifications, iMessages or calls, and this app doesn't pretend to. Instead the phone shows:
- app-generated reminders (sticky notes due today, calendar events starting within 10 minutes)
- alerts **you** push from a Shortcut or automation

Setup:
1. Set `ALERTS_INGEST_TOKEN` (24+ random chars) and `SESSION_SECRET`.
2. In a Shortcut, add **Get Contents of URL**:
   - `POST {APP_URL}/api/alerts`
   - Header `Authorization: Bearer <token>`
   - JSON body `{ "title": "…", "body": "…", "url": "https://…", "source": "Shortcuts" }`
3. In the room, open the phone and enter the token once to **pair** that browser. The browser gets an encrypted, httpOnly pairing cookie. The token is not kept in the browser, and rotating it unpairs every device.

Ingest is rate-limited and validated. Alerts are stored by `src/lib/server/alerts-store.ts` as a JSON file in `DATA_DIR`.

## Architecture

```
src/
  domain/          Pure, tested logic: lighting curve, WMO→scene weather, mail tiers & arrival diff,
                   calendar ordering/status, pet vitals, Open-Meteo normalisation.
  engine/          Client "environment controller"
    store.ts         one typed external store (useSyncExternalStore); persists only durable slices
    clock.ts         20 s clock + sceneLook() = time + weather → lighting
    poll.ts          visibility/online-aware polling with backoff; typed API errors
    character.ts     the resident's brain: behaviour state machine, walking (rAF only while moving)
    adapters/        event-adapter architecture (gmail, calendar, weather, alerts, tasks, demo)
    boot.ts          picks adapters for the mode, wires online/offline + OAuth return
  scene/           Rendering: layered SVG world (1600×900 stage), depth-sorted props, the resident sprite,
                   window weather, camera (fit on desktop, pan on portrait phones), hotspots
  ui/              In-world panels (letter, paper agenda, postcard, monitor, phone, sticky note…), HUD, toasts
  lib/server/      Server-only: env, sealed cookies, Google OAuth/Gmail/Calendar, weather proxy, alert store
  app/api/         Route handlers
```

**Rendering choice.** The room is hand-built SVG layered in the DOM, with CSS animation for ambient motion. PixiJS wasn't needed: the scene has a few hundred vector shapes and one moving character. With SVG, every object stays crisp at any device pixel ratio. Each interactive object is a real `<button>`, so keyboard, screen readers and focus rings come for free. Ambient motion is compositor-friendly transforms. The only JavaScript frame loop is the resident's walk, and it stops when Pip stops.

**Adding a source.** Implement `SourceAdapter` (`src/engine/adapters/types.ts`). Write your own store slice, and/or call `pushActivity()` with `channel: "computer" | "phone"`. Then register the adapter in `boot.ts`. The computer lists exactly the adapters that are running, so it never claims sources that aren't integrated.

**Customisation seam.** `src/scene/theme.ts` (`RoomTheme`) drives wall, floor, rug and cushion colours, the resident's colours, the decoration list and a season field. Four room palettes and four resident colours are already selectable. Furniture variants and seasonal themes only need new data and props.

## Accessibility & motion

- Every object is a focusable button with a live label (for example “Mail: 4 unread”).
- Panels are dialogs with a focus trap. Escape closes them and focus returns to the object.
- Touch targets are at least 44 px. Safe-area insets are respected.
- `prefers-reduced-motion` stops the ambient loops. The resident glides between spots instead of walking, and lightning is off.

## Testing done

These ran in this environment:
- **Unit tests** (`npm test`, 23 tests): pile tiers, arrival diffing, calendar ordering/status, DST day bounds and zone midnights, lighting continuity, WMO mapping, Open-Meteo parsing, pet vitals, hotspot non-overlap, camera, cookie sealing.
- **API checks** (curl against a production build): OAuth redirect parameters, `state` mismatch rejection, `not_connected` / `not_configured` errors, alert ingest auth, pairing, read-after-pair, and the 502 path when weather is unreachable.
- **Playwright on a production build:**
  - desktop 1440×900
  - iPhone 13 portrait and landscape: tap, zone panning, panels
  - keyboard: Tab to an object, Enter opens it, Escape returns focus
  - every panel, mail delivery and the 30-letter pile
  - all weather scenes and day/night
  - a task survives a reload
  - an end-to-end Shortcut alert reaches the phone
  - offline reload served by the service worker
  - reduced motion

**Not verifiable here:** a real Google sign-in (needs your OAuth client) and live Open-Meteo responses (this sandbox's network blocks the host; parsing is unit-tested against the documented response shape).

## Limitations

- The alert store is a JSON file. On serverless hosts with an ephemeral filesystem (for example Vercel), swap `FileAlertsStore` for Postgres/KV; the interface is three methods.
- Gmail is polled, not pushed. Gmail push via Pub/Sub would give instant delivery but needs a public webhook and a GCP topic.
- Tasks, pet and settings are saved per device in `localStorage`; there's no cross-device sync yet.
- The art is a cohesive hand-built vector set (see `DESIGN.md`), not commissioned illustration. The scene components are the asset pipeline: swap any prop's SVG while keeping its footprint in `layout.ts`.
- iPhone layouts were tested with Playwright's iPhone 13 profile in Chromium, not real Safari. Check on a device before relying on it.

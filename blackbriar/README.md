# After Hours: Blackbriar High

First-person custodial horror for 1–4 players. Clean an abandoned high school overnight, get paid per piece, and be inside the bolted maintenance office before 4:00 AM.

## Play
- **Solo on any device (phone included):** https://claude.ai/artifact/5pXyxYFGoi3yCpeunKr7WM — static copy; co-op buttons are disabled there because that host blocks network connections.
- **Co-op (up to 4):** needs `server.js` running on a public host (see Deploy). Then: open the link → *Create co-op crew* → *Pause → Copy invite link* → friends open it and press *Join crew*. Crew codes are 4 letters; the save belongs to the crew code and lives on the server (`rooms/CODE.json`, written atomically).

## Run locally
```
cd blackbriar
npm ci
npm start            # http://localhost:8080
npm test             # rules tests for the shared simulation
```
Env: `PORT`, `ROOMS_DIR`, `LAG_MS` (fake latency), `DEBUG_TP=1` (allow test teleports).

## Deploy (the one missing step)
Any Node 18+ host with WebSockets and a persistent disk works. Two ready options:
- **Render:** New → Blueprint → this repo (uses `render.yaml` + `Dockerfile`). Needs your Render account; the Starter plan + 1 GB disk keeps crew saves.
- **Any Docker host (Fly.io, Railway, a VPS):** `docker build -t blackbriar blackbriar && docker run -p 8080:8080 -v blackbriar-rooms:/data blackbriar`.
I could not deploy from this sandbox: it has no outbound access to hosting providers and no account credentials.

## Controls
Desktop: WASD move · mouse look · Shift sprint · Ctrl/C crouch · E interact (hold to revive) · F flashlight · Tab backpack · 1 vacuum / 2 mop / 3 hands · left mouse use · right mouse secondary (vacuum focus / mop scrub) · G ping · Esc pause.
If the browser refuses mouse capture you get **free-look mode**: move the mouse (no button) to look, hold the cursor at a screen edge to keep turning, arrow keys also look. It is usable, not identical to captured look.
Touch (phones/tablets): left thumb moves, right thumb looks, on-screen buttons. Playable but desktop is the target.

## Layout
`shared/` (config, level data, authoritative `Sim`) is imported by both `server.js` and the browser. `client/` renders and predicts. See `STORY.md`, `ASSET_CREDITS.md`, `TEST_REPORT.md`.

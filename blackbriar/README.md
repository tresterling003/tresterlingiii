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

## What's in the building
- **Upper floor:** red-locker hallway, Room 112, janitor closet, maintenance office, service corridor.
- **Athletics floor (below):** gym, locker room, natatorium (pool), and a locked **cafeteria** where the display mannequins are stored (key: hanging on the lifeguard chair at the pool). The Monitor is one of them. The west stairwell doors are chained; the key is in the teacher's desk in Room 112.
- **Janitor cart:** push it with E; empty the vacuum into its bag and rinse the mop in its bucket anywhere.
- **Mop:** gets dirtier as it lifts mud, cleans worse, and past 75% smears dirt back down. Rinse at the closet bucket or the cart. Re-cleaning a smear never pays twice.
- **Lockers:** about 60 open: loose change, or lost property to sell at `lostfound.exe`. Coins also lie on the floors (vacuum them: $0.25 each).
- **Shop (`skills.exe`):** suction, wide nozzle, bigger bags, quiet motor, wide mop head, absorbent strands, flashlight, work boots, and robot vacuums you carry to a room and set down.
- **Log off for the night** at the computer (whole crew in the office) ends the shift: summary, then Night N.
- **Scares:** something peeks at you from behind locker banks and corners and snaps out of sight the moment you notice it (running footsteps follow); a tall figure stands in far doorways; the power cuts out around you while the far end of the hall stays lit. Each worker gets their own apparitions; timing is decided by the server.
- **Mopping:** cleaned floor gleams (lamps and your flashlight reflect in it), dirty floor stays dull under a grime film, and the wet trail dries slowly.
- **Graphics:** real CC0 models and photo textures from Poly Haven (desks, chairs, shelving, safety gear, gym/pool/concrete floors), bloom, film grade, grain and vignette. Low quality skips post-processing.
- **The Monitor** is a jointed display mannequin. While anyone has it in view it cannot move; when nobody is looking it moves, and in a chase it sprints faster than you. Standing still it takes the exact pose of the stored mannequins.
- **Calm mode** (solo, off by default, tick it on the title screen): no monster or scares.

## Controls
Desktop: WASD move · mouse look · Shift sprint · Ctrl/C crouch · E interact (hold to revive) · F flashlight · Tab backpack · 1 vacuum / 2 mop / 3 hands · left mouse use · right mouse secondary (vacuum focus / mop scrub) · G ping · Esc pause.
If the browser refuses mouse capture you get **free-look mode**: move the mouse (no button) to look, hold the cursor at a screen edge to keep turning, arrow keys also look. It is usable, not identical to captured look.
Touch (phones/tablets): left thumb moves, right thumb looks, on-screen buttons. Playable but desktop is the target.

## Layout
`shared/` (config, level data, authoritative `Sim`) is imported by both `server.js` and the browser. `client/` renders and predicts. See `STORY.md`, `ASSET_CREDITS.md`, `TEST_REPORT.md`.

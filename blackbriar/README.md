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
- **The Monitor** is a jointed display mannequin and a stalker. It never moves while anyone is looking at it.
  - Most of the night it toys with you: it stands at the far end of a hall and is gone when you look back, follows you and stops when you turn, opens doors behind you, slams lockers, knocks, kills the lights, leaves muddy footprints up to your heels, whispers, and has the PA call your name.
  - A few times a night (2/3/4 by night) it **hunts**: lights stutter, the PA calls attendance. Looking at it holds it in place, but staring fills the screen with static until you have to blink, and it moves while you blink. Staring too long also provokes a hunt. Hide in a hall locker (H) if it did not see you get in, or reach the office.
  - **Caught = GAME OVER** (solo), with *Retry night* restarting the night from its beginning. In co-op a crewmate can pull you up; if everyone goes down, it is game over.
  - **4:00 AM headcount (siege):** bolt the office, watch it on the cameras (computer → cctv.exe; new OFFICE DOOR, ROOM 014, CAFETERIA, GYM cams) and **hold E at the door** each time it tries the handle (2/3/4 times by night).
- **Room 014** (the sealed wing): a door behind the lockers in the east hallway opens partway through the first night. A Backrooms maze of yellowed, stained wallpaper, damp carpet and humming fluorescent panels, with more mannequins and more loose change.
- **Mopping:** cleaned floor gleams (lamps and your flashlight reflect in it), dirty floor stays dull under a grime film, and the wet trail dries slowly.
- **Graphics:** real CC0 models and photo textures from Poly Haven and ambientCG, screen-space ambient occlusion (N8AO) and bloom on High, a film grade, adaptive resolution.
- **Calm mode** (solo, off by default, tick it on the title screen): no monster or scares.

## Controls
Desktop: WASD move · mouse look · Shift sprint · Ctrl/C crouch · E interact (hold to revive; hold at the office door during the 4:00 siege) · H hide in / leave a hall locker · F flashlight · Tab backpack · 1 vacuum / 2 mop / 3 hands · left mouse use · right mouse secondary (vacuum focus / mop scrub) · G ping · Esc pause.
If the browser refuses mouse capture you get **free-look mode**: move the mouse (no button) to look, hold the cursor at a screen edge to keep turning, arrow keys also look. It is usable, not identical to captured look.
Touch (phones/tablets): left thumb moves, right thumb looks, on-screen buttons. Playable but desktop is the target.

## Layout
`shared/` (config, level data, authoritative `Sim`) is imported by both `server.js` and the browser. `client/` renders and predicts. See `STORY.md`, `ASSET_CREDITS.md`, `TEST_REPORT.md`.

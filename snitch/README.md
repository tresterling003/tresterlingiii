# SNITCH

A social deduction game in the Mafia family, with its own spin. You're a crew of thieves on one last job, and some of you are **Snitches** wearing a wire. Play online with friends using a 4-letter room code, or solo against bots. Any mix of humans and bots works, 5–10 players.

## What's different from Mafia

- **Lockup.** Eliminated players keep playing. They get their own chat, and each night they smuggle a **kite** to one living player, who gets a double vote the next day.
- **The Fall Guy** (6 or 8+ players). A wildcard who wins alone by getting voted out, so every vote carries a risk.
- **Bots that talk and listen.** Bots accuse, defend, claim roles and bluff in chat. Name a player in an accusation and they react; claim to be the Lookout and they weigh it.

| Role | Side | Power |
|---|---|---|
| 🧤 Crew | Crew | A vote and a read on people. |
| 🔭 Lookout | Crew | Each night, learns whether one player is a Snitch. |
| 🧰 Fixer | Crew | Each night, gives one player an alibi that blocks a bust. Not the same player twice running. |
| 🎙️ Snitch | Snitches | Knows the other Snitches, shares a private channel, picks who gets busted each night. |
| 🃏 Fall Guy | Alone | Wins by being voted out during the day. |

Crew wins when every Snitch is out. Snitches win when they match everyone else in numbers.

## Run it

```bash
cd snitch
npm install
npm start        # http://localhost:3000
npm test         # engine tests, including 1,200 simulated bot games
```

## Put it online

It is one small Node server (HTTP + WebSockets, no database), so it needs a host that runs a long-lived Node process — Render, Railway, Fly.io and similar all work. Static hosts such as GitHub Pages will not. Point the host at this folder with build command `npm install` and start command `npm start`; it listens on `$PORT`. Rooms live in memory, so a restart ends games in progress.

## Layout

- `game.js` — rules, phases, bot behaviour, and the per-player view that keeps hidden roles hidden. No network code.
- `server.js` — static files, rooms, seats, reconnects.
- `public/` — the client (plain HTML/CSS/JS, no build step).
- `test/` — engine tests.

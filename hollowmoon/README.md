# HOLLOWMOON

A 3D game of Werewolf (the Mafia family of party games) that plays out as a live scene: a village around a campfire, animated characters, and cutscenes for the night kill, the vote verdict and the ending. Play solo against bots or with friends, 5–10 players in any mix.

| Role | Side | Power |
|---|---|---|
| 🧑‍🌾 Villager | Village | A vote and a read on people. |
| ⭐ Sheriff | Village | Each night, learns whether one player is a werewolf. |
| 💉 Doctor | Village | Each night, protects one player. Not the same player twice running. |
| 🐺 Werewolf | Wolves | Knows the pack, shares a private chat, picks the night's victim. |
| 🃏 Jester | Alone | Wins by being banished (6 or 8+ players). |

Dead players become ghosts with their own chat; each night they bless one living player, whose vote counts double the next day.

## Run it

```bash
cd hollowmoon
npm install
npm start        # http://localhost:3000
npm test         # engine tests, including 1,200 simulated bot games
```

Solo play runs entirely in the browser, so `public/` also works on any static host. Playing with friends needs either this Node server (WebSockets, rooms in memory) or a host page that provides a shared room, which `net.js` detects.

## Layout

- `public/game.js` — rules, phases, bots, and the per-player view that keeps roles hidden. Shared by browser and server.
- `public/stage.js` — the three.js village, characters, lighting and cutscenes.
- `public/app.js` — HUD, chat and game flow. `public/net.js` — the three ways to connect. `public/sfx.js` — synthesised sound.
- `server.js` — static files and WebSocket rooms. `tools/build-assets.mjs` — shrinks the character models.

## Credits

- Characters and animations: KayKit Adventurers by Kay Lousberg — CC0.
- 3D engine: three.js — MIT (licence in `public/vendor/three/LICENSE`).

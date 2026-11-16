# EMBERFALL

A co-op 3D fantasy quest in the tabletop role-playing tradition, crossed with a trail-survival game. You create a hero, gather a party of four (friends, or computer companions who fight on your side), and travel from the village of Emberfall to the Barrow to recover the Ash Crown. Nobody plays against anybody: the party wins or loses together.

- **Character creation** — five classes (Knight, Warden, Mage, Rogue, Barbarian), three ability points to spend, a background perk and an outfit colour.
- **Rules walkthrough** — a five-page explanation for people who have never played a tabletop RPG, with a practice dice roll.
- **Choices and d20 checks** — every scene offers choices; risky ones are a d20 roll plus your ability against a target. Fate points buy re-rolls.
- **The trail** — days, rations, a supply shop, a pace to choose, and a random event each day (a toll troll, goblins, a wyvern, a hedge witch, a unicorn, storms…). Arrive after the new moon and the final enemy is stronger.
- **Turn-based battles** — attack rolls against armor, damage dice, a special move per class, potions. A fallen party retries the battle.
- **Cutscenes** — location intros, battle openers, critical hits, the boss rising from his throne, four endings.

## Run it

```bash
cd emberfall
npm install
npm start        # http://localhost:3000
npm test         # rules tests, including 760 simulated quests
npm run pack     # builds dist/ for static hosts that cannot serve .glb files
```

Solo play runs entirely in the browser. Playing with friends needs either this Node server (WebSockets) or a host page that provides a shared room, which `net.js` detects; the host's tab then runs the game.

## Layout

- `public/quest.js` — the whole adventure as data: classes, monsters, battles, every scene and trail event. Add scenes here.
- `public/engine.js` — the rules. Shared by browser and server.
- `public/stage.js` — three.js locations, characters, battle animation and cutscenes.
- `public/app.js` — screens and controls. `public/net.js` — connections. `public/sfx.js` — synthesised sound.

## Credits

- Characters, monsters and animations: KayKit Adventurers and Skeletons by Kay Lousberg — CC0.
- 3D engine: three.js — MIT (licence in `public/vendor/three/LICENSE`).

# EMBERFALL

A co-op 3D fantasy quest in the tabletop role-playing tradition. You create a hero, gather a party of four (friends, or computer companions who fight on your side), and set out from the village of Emberfall to recover the Ash Crown from the Barrow. Nobody plays against anybody: the party wins or loses together.

- **Character creation** — five classes (Knight, Warden, Mage, Rogue, Barbarian), three ability points to spend, a background perk and an outfit colour.
- **Rules walkthrough** — a five-page explanation for people who have never played a tabletop RPG, with a practice dice roll.
- **A Game Master and d20 checks** — every scene is narrated and offers choices; risky ones are a d20 roll plus your ability against a target. A helpful companion gives advantage; Fate points buy re-rolls.
- **Turn-based battles** — initiative order, attack rolls against armor, damage dice, critical hits, saving throws, two special moves per class, potions.
- **Levels and loot** — the party levels up twice (more health, a new power, an ability to raise), and seven magic items can be found. A character sheet shows it all.
- **Encounters** — a toll troll, goblins, a wyvern, a hedge witch, a unicorn, a chest with teeth, a wandering bard; two routes; four endings.
- **Cutscenes** — location intros, battle openers, critical hits, level-ups, the boss rising from his throne.

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

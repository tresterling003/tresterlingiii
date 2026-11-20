# EMBERFALL: OPEN REALM

An open-world 3D action RPG built on tabletop (D&D-style) rules. Make a hero, then go anywhere in a 2.2 km world at life-size scale: four walled kingdoms the size of a city downtown (Emberfall, sun-baked Solmara in the desert, Frosthold in the snowy mountains, Tidewatch on the lake), three outskirts villages (Millbrook, Ashford, Redwater), and the wilds between them: forests, mountains, desert, snowfields, a river with a troll bridge, a swamp, a wyvern's peak, ruins, and a haunted Barrow dungeon. Real-time combat, but every swing rolls a d20 against armor.

- **Character creation** — five classes (Knight, Barbarian, Mage, Rogue, Warden), ability points, background, colour, with your hero shown live beside the editor. A rules guide explains everything for first-time players.
- **Swordplay** — light attacks that chain into three-hit combos, hold-and-release heavy attacks that break guards, blocking, timed **parries** that throw enemies off balance, guaranteed-critical **counters**, dodge-rolls with **perfect dodges** (time slows), lock-on, and a stamina bar so mashing gets you nowhere. Enemies flash and show a "!" just before they swing, some hold a swing a beat longer, and shielded foes raise their guard more the more you hammer at them. A drill sergeant in every barracks teaches it and spars with you.
- **Ranged and magic** — heroes shoot exactly where the crosshair points (hold right mouse to aim over the shoulder); two abilities per class, critical hits on a natural 20, telegraphed boss attacks with saving throws.
- **Go inside anything** — walk into the front door of any house, tavern, smithy, church, castle, barracks or tower (447 of them). Taverns have a barkeep (ale, potions, a bed for the night), patrons and a notice board; churches heal you; smiths sharpen your blade; castles have a throne room, a ruler and a treasury to rob; houses have residents and trunks to rifle through — if nobody is watching. Wanted? Duck inside to break line of sight, but the watch may follow you in.
- **Play anywhere** — keyboard and mouse, game controllers (sticks, D-pad, triggers; menus and dialogue too) and touch screens (a joystick or a digital D-pad, with buttons for attack, block/parry, dodge, lock-on and more).
- **Open world** — day and night, wolves after dark, fast-travel shrines, chests to pick, collectibles, horses to buy (or steal).
- **Crime and the watch** — assault, theft, pickpocketing and horse theft earn wanted stars; guards hunt you; lose them, pay a fine, or talk your way out.
- **Quests** — the main story (Varg the Red, the Bone King, four endings) and six side quests, with branching dialogue and d20 skill checks.
- **Bosses** — Varg the Red, Gorm the Toll Troll (regenerates unless burned), Grub the Pie King, a Mimic, Skarn the Wyvern, the Bone King.
- **Levels and loot** — six levels, ability choices, eleven magic items, a character sheet.

## Run it

```bash
cd realm
npm start          # http://localhost:3000
npm run pack       # builds dist/ (models packed into one script) for static hosts
```

## Layout

`public/data.js` content and dialogue · `world.js` terrain and layout · `scenery.js` builds the 3D world · `actors.js` characters and effects · `player.js` controls, camera, combat · `ai.js` monsters, bosses, townsfolk · `interiors.js` building interiors · `game.js` rules, quests, crime, saving · `ui.js` HUD and menus · `tools/build-assets.mjs` rebuilds `public/assets/` from the source packs.

## Credits

- Characters, buildings, nature and dungeon: KayKit Adventurers, Skeletons, Medieval Hexagon and Dungeon Remastered by Kay Lousberg — CC0.
- Wolves: glTF Fox sample — © 2014 tomkranis, glTF conversion © 2017 AsoboStudio and scurest, CC-BY 4.0.
- Horse: three.js examples. 3D engine: three.js (MIT).

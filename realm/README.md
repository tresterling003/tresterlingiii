# EMBERFALL: OPEN REALM

An open-world 3D action RPG built on tabletop (D&D-style) rules. Make a hero, then go anywhere in a 2.2 km world at life-size scale: four walled kingdoms the size of a city downtown (Emberfall, sun-baked Solmara in the desert, Frosthold in the snowy mountains, Tidewatch on the lake), three outskirts villages (Millbrook, Ashford, Redwater), and the wilds between them: forests, mountains, desert, snowfields, a river with a troll bridge, a swamp, a wyvern's peak, ruins, and a haunted Barrow dungeon. Real-time combat, but every swing rolls a d20 against armor.

- **Character creation** — five classes (Knight, Barbarian, Mage, Rogue, Warden), ability points, background, colour, with your hero shown live beside the editor. A rules guide explains everything for first-time players.
- **Real-time combat** — melee, spells and crossbows; ranged heroes shoot exactly where the crosshair points (hold right mouse to aim over the shoulder); dodge-rolls, blocking, two abilities per class, critical hits on a natural 20, telegraphed boss attacks with saving throws.
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

`public/data.js` content and dialogue · `world.js` terrain and layout · `scenery.js` builds the 3D world · `actors.js` characters and effects · `player.js` controls, camera, combat · `ai.js` monsters, bosses, townsfolk · `game.js` rules, quests, crime, saving · `ui.js` HUD and menus · `tools/build-assets.mjs` rebuilds `public/assets/` from the source packs.

## Credits

- Characters, buildings, nature and dungeon: KayKit Adventurers, Skeletons, Medieval Hexagon and Dungeon Remastered by Kay Lousberg — CC0.
- Wolves: glTF Fox sample — © 2014 tomkranis, glTF conversion © 2017 AsoboStudio and scurest, CC-BY 4.0.
- Horse: three.js examples. 3D engine: three.js (MIT).

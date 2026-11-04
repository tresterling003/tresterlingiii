# DODGE NATION — Pro Dodgeball (Phase 1)

A 3D, broadcast-style 6v6 pro dodgeball sim that runs in one self-contained HTML file
(`index.html`, ~5.6 MB) on desktop and mobile browsers. Open it in a browser and play.
It needs an internet connection for three.js and the web fonts. The athletes, mocap and
textures are embedded in the file.

## What's in Phase 1

- **Realistic athletes.** Players are scanned-style human avatars from the
  [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox) (MIT): four sports models (3 men, 1 woman), ~8–9.5k triangles each with 81-bone rigs (including facial bones),
  driven by Rocketbox **motion-capture** clips (idle, walk, jog, run, sprint, crouch, cheer, clap, sit).
  Each team's kit is recolored at runtime from a per-pixel uniform map, with real jersey numbers,
  nameplates and chest wordmarks painted onto the texture.
- **Gameplay.** You get movement, sprint with stamina, juke, duck and jump. You hold to charge throws on a ping-pong power meter and get a
  perfect-release zone bonus, and you can fake. Catches use a timed window, and a catch puts the thrower out and brings your next
  teammate back. Blocking with a held ball can fumble, and a fumble is an out. You can switch players manually or automatically. Duck and jump change your hitbox. A
  ball boy returns dead balls that leave the court. Best of 3 games.
- **Ratings (40–99).** Throw Power, Throw Accuracy, Catch, Dodge, Speed, Stamina, Awareness and Clutch all
  feed the simulation: ball speed, aim error, catch window size and success, juke burst and "ghost" evasion,
  AI reaction time, fake resistance, and clutch swings when a team is down to two. Archetypes are Cannon, Sniper,
  Brick Wall, Ghost, Captain (a lone Captain triggers a team-wide rally) and Two-Way. Each player card shows an OVR.
- **AI.** The AI reads threats with reaction delays based on Awareness and Dodge. It chooses between catch, block, juke, duck and jump,
  and it can bite on fakes. It assigns ball retrievers, spreads across lanes, targets weak or busy players, and gangs up with
  timed volleys when the other team is down to its last players.
- **Presentation.** The game opens with a matchup screen showing key players on 3D-rendered portrait cards. The broadcast camera follows the action,
  with an intro fly-in and a celebration cam. Instant replays use slow motion, an orbiting close-up and letterboxing.
  Hits bring hit-stop slow-mo, screen shake, hit flashes, sweat spray, shockwave rings, dust and ball trails. A GPU-animated crowd
  gets louder in close games and chants when it's one versus many. Synthesized audio covers the crowd, whistle, impacts and air horn. Two-voice
  text commentary and big callouts react to the play. The arena has a scorebug, jumbotron, LED ribbon boards, title ticker and championship
  banners. The post-match box score names an MVP.
- **Teams.** There are 8 original fictional teams with shape-built logos and generated 6-player rosters.

## v3 additions

- Camera modes: Broadcast, Courtside, Overhead and Player cam (V / CAM button). Movement is camera-relative.
- Dive (X / DIVE): the athlete lays out from the hips with trailing legs, slides on landing, and pushes up through a crouch.
  While in the air and on the floor the hitbox lies flat.
- Jump throws: charging carries through a jump, with hang time near the apex. A perfect release in the air is a SKY SHOT.
- Catch timing ring: it closes in on your player and turns green, and the CATCH button glows, inside the sweet spot.
- Impact feel: hit-stop, a camera kick on releases, ball squash, a heavier whoosh, ball shadows and stronger trails.
- Phones: automatic resolution scaling. Medium quality turns off shadow maps and keeps blob shadows, with a lighter crowd and 512px kit textures.
  Per-frame allocations are gone from the replay recorder and pose layer.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move / sprint | WASD or arrows / Shift | Left stick (push to edge to sprint) |
| Throw (hold, release) | J or left click | THROW |
| Catch / block (hold with ball) | K or right click | CATCH |
| Juke · Dive · Jump · Duck | L/E · X · Space · C/Ctrl | JUKE · DIVE · JUMP · DUCK |
| Camera angle | V | CAM |
| Fake · Switch · Cycle target | F · Q/Tab · R | FAKE · SWITCH |
| Pause | Esc / P | ❚❚ |

## Project layout

```
dodge/
  index.html          built, self-contained game (open this)
  build.py            inlines src/ + assets/ into index.html
  src/shell.html      page skeleton
  src/style.css       UI styling
  src/js/*.js         game modules (concatenated in filename order)
  assets/             packed avatars (*.bin), mocap (anims.bin), kit/head/normal textures, license
  tools/              asset pipeline used to produce assets/ from the Rocketbox FBX sources
```

Rebuild after editing anything in `src/` or `assets/`:

```
python3 dodge/build.py
```

### Asset pipeline (`tools/`)

1. `process_tex.py` downsizes the Rocketbox TGA textures. It also builds each avatar's grayscale *uniform map*:
   2 bits for the kit class (jersey, secondary or trim) and 6 bits of fabric shading. Sponsor logos and the fixed numbers are cleared from these maps.
2. `convert.html` + `runconv.js` load the FBX avatars and mocap in headless Chromium with three.js's FBXLoader.
   They write a compact quantized format: indexed geometry, 16-bit positions and UVs, 8-bit normals and skin weights,
   and int16 animation tracks with constant tracks stripped.

## Credits

Avatars and motion capture: Microsoft Rocketbox Avatar Library, MIT License (see `assets/LICENSE-Rocketbox.md`).
Rendering: three.js (MIT). All teams, players and the league are fictional.

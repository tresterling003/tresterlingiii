# Test report — vertical slice 1 (2026-11-12)

**Environment:** Linux sandbox, 4 CPU cores, **no GPU**. Browser: Playwright Chromium with SwiftShader (CPU rendering). Server: Node 22, `server.js` on localhost. All clients on one machine.
**What this can't prove:** real frame rate (SwiftShader renders at 2–15 fps, so 60 fps at 1080p on a midrange desktop is **unmeasured**), real internet co-op across devices, real phones, and mouse feel. Logic-timing tests use a fixed-step hook (`__bb.step`) that runs gameplay at 60 Hz without drawing.

## Evidence
- `npm test` — 10 rules tests pass (idempotent collection, exact order-independent masks + save/load, single purchase, 5th player rejected, bolt only from inside, Monitor cannot path through the bolted door, hears → investigates → chases → catches, 4:00 bolted crew → summary → Day 2 with identical masks, solo failure keeps cleaning).
- Browser solo loop (t2): take vacuum + mop from rack → vacuum hallway (300 pieces, bag full, money from pieces) → mop Room 112 (mud 505,310 → 467,702; holding still: 0–31 units) → computer → skills.exe → Suction Motor I ($40 charged once, suction 1) → log off recaptures mouse → close door, engage bolt from inside → 4:00 → summary → Sleep → Night 2 with identical debris/mud/upgrades/tools → full page reload restores the same.
- Pointer lock **denied** (t5): enters game; banner explains free-look; mouse move without a button turns (yaw −0.60 rad); edge hold turns (−0.76 rad / 1.5 s); arrow keys full 360°; move while looking; Esc → pause → Resume; Tab backpack open/close; focus loss clears held keys (drift 0.009 m).
- Pointer lock **granted** (t1/t2): `locked: true` after Start; Esc opens pause; leaving the computer re-locks.
- Co-op (t6, 5 browser contexts, real server): 2 workers see each other; same 20 pieces requested by both at once → paid once; mop sync exact (477,943 = 477,943); late joiner gets identical stain + debris; 4 workers OK; 5th rejected with message; slot reopens after a leave.
- Co-op with 120 ms artificial latency (t7): both clients agree on money and debris; dropped socket reconnects automatically and keeps inventory; two players buy the same $35 upgrade at once → charged $35 once, both upgraded.
- Visual captures at eye level (800×450): hallway, Room 112 through the glass, office, closet door, dark service corridor with flashlight, Monitor in the dark hall.

## Requirement matrix
| Requirement | Status | Evidence |
|---|---|---|
| Browser game, playable link | IMPLEMENTED AND TESTED (solo) | Artifact link; t1 |
| Public co-op link | NOT IMPLEMENTED (deploy blocked) | Needs a host account; Dockerfile + render.yaml ready |
| 4-player co-op (local server) | IMPLEMENTED AND TESTED | t6, t7 (same machine only) |
| Remote-device / internet co-op | IMPLEMENTED, NOT YET TESTED | — |
| Pointer lock + working fallback | IMPLEMENTED AND TESTED | t5, t2 |
| Hallway visual benchmark | PARTIAL | Captures; see gaps |
| Five connected rooms | IMPLEMENTED AND TESTED | t2, captures |
| Vacuum (visible attraction, intake, per-piece pay, capacity, bins) | IMPLEMENTED AND TESTED | t2, t4, t7 |
| First upgrade meaningful (2.2→3.2 m, +50 % pull) | IMPLEMENTED AND TESTED | t2 (purchase); effect values in config |
| Mop with exact persistent masks | IMPLEMENTED AND TESTED | t2, t6, sim tests |
| Doors, searchable lockers, clues | IMPLEMENTED, PARTLY TESTED | doors/bolt t2; lockers/vent/plate not browser-tested |
| Facilities OS (contracts, equipment, skills, maintenance, live CCTV) | IMPLEMENTED, PARTLY TESTED | skills.exe t2; CCTV not visually verified |
| Monitor AI (perceive, investigate, chase, search, blocked by bolt) | IMPLEMENTED AND TESTED (logic) | sim tests; browser capture |
| Monitor watch-through-glass, first sighting, director pacing | IMPLEMENTED, NOT YET TESTED in play | — |
| Creature art | PARTIAL — prototype | Mixamo body + scanned face; not final, licence caveat |
| Shift clock, PA, 3:30/3:50 warnings, 4:00 lockdown | IMPLEMENTED, PARTLY TESTED | 4:00 path t2 |
| Downed / revive (co-op) | IMPLEMENTED, NOT YET TESTED | — |
| Day 2 persistence, Room 014 work order | IMPLEMENTED AND TESTED | t2 |
| 60 fps @1080p midrange desktop | NOT YET TESTED | No GPU here |
| Touch controls | IMPLEMENTED, NOT YET TESTED on a phone | — |
| Native Windows build | NOT IMPLEMENTED | — |

## Known gaps / issues
- Art: lockers, tile and ceiling are procedural; no licensed PBR scan assets yet. Props are simple. Creature is prototype art.
- Performance unmeasured on real hardware; ~220k triangles visible in the hall; static geometry is merged per material (not culled per room).
- Speech for PA uses the browser's built-in voice where available.
- Solo pause does not stop the clock (by design, stated in the pause menu).

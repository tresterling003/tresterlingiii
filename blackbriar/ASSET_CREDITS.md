# Asset credits
| Asset | Source | Author / license | Use and changes |
|---|---|---|---|
| Body mesh "Michelle" (`assets/body.json`) | three.js examples, `examples/models/gltf/Michelle.glb` (r170) | Adobe Mixamo character. Mixamo terms allow use in projects; **not re-verified in this session** (no network access to Adobe). Do not redistribute as a standalone asset. | Re-packed as base64 JSON; skeleton stretched at runtime; texture desaturated/tinted (Monitor uniform, coworkers). |
| Idle/Walk/Run animation (`assets/anims.json`) | three.js examples, `Soldier.glb` (r170) | Adobe Mixamo animations; same note as above. | Quaternion tracks only, exported to JSON. |
| Mannequin body "X Bot" + idle/walk/run/sad_pose clips (`assets/mannequin.json`) | three.js examples, `examples/models/gltf/Xbot.glb` (r170) | Adobe Mixamo character; same Mixamo note as above, **not re-verified**. | Re-packed as base64 GLB (other clips dropped); own head hidden and replaced by the head scan below; lacquered-wood shader is our own; the cafeteria crowd is this body baked into three static poses. |
| Head scan (`assets/head.json`, `head_normal.jpg`) | three.js examples, `gltf/LeePerrySmith` (r170) | Lee Perry-Smith / Infinite Realities, CC BY 3.0 (as documented with the three.js examples; not re-verified this session). | Neck cropped; sunken eyes/cheeks and jaw morph added in code; normal map resized to 1024². |
| three.js r170 | cdn.jsdelivr.net/npm/three@0.170.0 | MIT | Unmodified. |
| ws 8.18.3 | npm | MIT | Unmodified. |
| Post-processing passes (EffectComposer, UnrealBloomPass, OutputPass) | three.js r170 `examples/jsm` | MIT | Unmodified; the film-grade shader is our own. |

## Poly Haven assets (CC0 — public domain, no attribution required; credited anyway)
Downloaded from polyhaven.com. Models were simplified with meshoptimizer and their textures resized to 256–1024 px with gltf-transform; they ship as base64 GLB in `assets/props/`. Textures were resized/recompressed into `assets/tex/`.

| Asset | Author(s) | Where it is used |
|---|---|---|
| School Desk 01, School Chair 01 | Ethan Place | Room 112 desks and chairs |
| Wet Floor Sign 01 | Fran Calvente | Hallway, gym, pool deck |
| Metal Office Desk | Ulan Cabanilla | Teacher's desk (Room 112) |
| Steel Frame Shelves 01 | James Ray Cock | Janitor closet, maintenance office, service storage |
| Drawer Cabinet | Ulan Cabanilla | Room 112 |
| Cardboard Box 01 | Rahul Chaudhary | Closet, office, service storage |
| Multi Cleaner Bottle, Bleach Bottle | James Ray Cock | Closet shelves and sink |
| Plastic Bottle Gallon | Rahul Chaudhary | Closet |
| Korean Fire Extinguisher 01 | UM JOORIN | Hallway, office, athletics corridor |
| Television 01 | Gabriel Radić | Room 112 |
| Trashbag | Benny Weimer | Service storage |
| Lifebuoy | Hank Kaamura | Pool |
| Life Jacket | PierreB3D | Pool |
| Security Camera 01 | Alexander Otterbeck, Yann Kervran | CCTV camera positions |
| Fire Alarm | Slinc | Hallway, gym corridor |
| Street Rat | Sean Buckley | Service storage |
| Binder Notebook | DaDrood | Teacher's desk, office desk |
| Office Notepads | Ulan Cabanilla | Teacher's desk |
| Power Box 01 | Rico Cilliers, Yann Kervran | Maintenance office |
| Ladder Sectioned 01 | MP | Service corridor |
| Dustpan | Balen | Janitor closet |
| Tool Cart | Savva Zakharov | Service corridor |
| Texture: Laminate Floor 02 | Dario Barresi, Charlotte Baglioni | Gym floor |
| Texture: Concrete Floor Worn 001 | Dimitrios Savva, Rico Cilliers | Closet, service, stairwell floors |
| Texture: Square Tiles | Charlotte Baglioni | Pool deck |
| Texture: Dirty Concrete (greyscale, as a grime detail map) | Rob Tuytel | Large-scale dirt on floors, walls and ceilings |

## ambientCG assets (CC0 — public domain)
Downloaded from ambientcg.com (1K JPG sets), resized/recompressed into `assets/tex/`.

| Asset | Where it is used |
|---|---|
| OfficeCeiling001 (colour, normal, roughness) | Acoustic ceiling tiles everywhere; tinted yellow in Room 014 |
| Carpet016 (colour, normal, roughness) | Room 014 (the sealed wing) floor |
| Wallpaper001B (colour, normal, roughness) | Room 014 walls, tinted yellow |
| PaintedMetal004 (roughness only) | Scratches and scuffs on the red hall lockers |

## Code
| Library | Licence | Use |
|---|---|---|
| Bebas Neue (Dharma Type), via @fontsource/bebas-neue 5.3.0 (`assets/fonts/bebas-neue.woff2`) | SIL OFL 1.1 | Titles, menus, HUD |
| Special Elite (Astigmatic), via @fontsource/special-elite 5.3.0 (`assets/fonts/special-elite.woff2`) | Apache 2.0 | Notes, tips, typewritten text |
| PeerJS 1.5.4 (`client/vendor/peerjs.min.js`) | MIT | Browser-to-browser co-op; uses the free public PeerJS server only to introduce players |
| N8AO 2.0.1 by N8python (`client/vendor/N8AO.js`) | ISC | Screen-space ambient occlusion on High quality. Vendored from npm; its import of the pmndrs `postprocessing` package (only used by the variant we don't use) is replaced by a stub class. |

Everything else (the VCT floors, painted walls, ceiling tiles, lockers, doors, tool models, audio) is generated in code in this repository.
**Known licensing gap:** the Monitor is built from a Mixamo body. Prototype art only; replace with a commissioned or properly licensed creature before any release.

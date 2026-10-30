# FIELDVIEW verification report

Run on 2026-10-30, against the production build served by `npm start` (`dist/`).

## Tested environment
- **Machine:** a headless cloud container with 4 vCPUs (Intel Xeon @ 2.80 GHz) and **no GPU**
- **Browser:** HeadlessChrome 153 (Playwright)
- **WebGL:** `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`. SwiftShader is a CPU software rasterizer.
- **Node:** 22.22

> Because there was no GPU, **this environment cannot say anything about laptop frame rates.** The frame rate measured here (~1.5 fps at 1200×777) reflects a software renderer on 4 shared CPU cores. Measure your own laptop with **Coach tab → Performance → Measure performance**.

Rendering cost that *was* measured (independent of GPU speed):
- **91 draw calls per frame** for 21 animated players, the field and the stadium. Players are instanced per body part, per team. Before instancing it was ~530.
- **~195k triangles** per frame.
- No GPU-resource or JS-heap growth across 30 consecutive reps.

## Unit tests: `npm test` (25 tests, all passing)

| Area | What is checked | Result |
|---|---|---|
| Demo content | 13 drills, schema-valid, 11 players each, NFHS legality warnings clean, motion in both directions, ≥2 no-motion comparisons | pass |
| Determinism | same drill + seed → bit-identical tracks; randomized timing stays within coach bounds | pass |
| Paths | motion ends at the authored waypoint; stationary players never move pre-snap; no speed > 10.5 yd/s (no teleporting) | pass |
| Jet motion | still moving at the snap and continues after it; the decision window opens before the snap | pass |
| Huddle break | every player ends exactly on their formation spot | pass |
| **Grounded feet** | 2,907 foot contacts across all drills (with and without the huddle): worst planted-foot slide **1.6 cm** | pass (limit 3 cm) |
| **Animation continuity** | worst joint motion per 1/120 s: **10.7 cm** relative to the body, 15.1 cm in world space during 8 yd/s sprints | pass (limits 12 / 25 cm) |
| Pure-function poses | sampling times in any order gives identical poses (safe scrubbing) | pass |
| Projection math | off-axis frustum maps the physical screen corners exactly to the image corners; in/cm conversions agree; calibration references follow similar triangles; the wide-view scale factor is correct | pass |
| Storage | save → reload; export → import into an empty store; malformed packages rejected with readable errors; corrupted entries dropped safely | pass |
| GLB retargeting | Mixamo bone names mapped; on a synthetic T-pose rig, limb bones follow the solved pose within **1°**; hips track pelvis height within 2 cm | pass |

## Browser end-to-end: `npm run verify:browser -- http://localhost:4173/` (28/28 passing)

| Check | Result |
|---|---|
| Every drill: 11 offensive players, ≥7 on the line; renderer shows 11 offense + 10 defensive teammates | pass |
| **Exact replay:** the same seed, revisited in reverse order after a different rep, gives a max pose difference of **0** | pass |
| A new rep (new seed) changes timing | pass |
| 2× speed: 2.004 s of sim in 1.002 s; 0.5× speed: 0.500 sim s per real s | pass |
| Pause holds time exactly; reset returns to 0 | pass |
| Freeze stops **exactly** at the decision point (7.839493… = 7.839493…) | pass |
| The pose at the snap is identical whether reached by 3× playback or by scrubbing | pass |
| Projector window connects (heartbeats) | pass |
| **Projector shows the identical frame** when paused at 2.345 s and 7.777 s (pose difference 0) | pass |
| During playback both windows derive the same sim time for the same instant (Δ < 1e-9 s) | pass |
| A remote key pressed in the projector window controls the coach timeline | pass |
| Evaluation mode propagates to the projector | pass |
| **Solo session:** countdown → watch → decide → feedback → rest → summary, driven only by key presses | pass |
| The session records 4 reps with the chosen answer, correctness and key response time | pass |
| "Repeat missed" queues exactly the missed reps (same drill + same seed) | pass |
| Call-aloud mode: reveal, then an athlete self-check is recorded as self-reported | pass |
| A saved drill and playlist survive a page reload | pass |
| Export → clear browser storage → import → reload restores everything | pass |
| An invalid package is rejected with validation errors | pass |
| 30 consecutive reps with no errors; geometries 74→74, textures 12→12, heap 18.2→18.2 MB | pass |

## Visual checks (screenshots in `docs/screenshots/`)
- Linebacker view of the 11-man offense; motion paths and labels in teaching mode.
- Calibrated View, letterboxed to the measured image aspect, with off-screen players listed and edge-arrowed.
- Calibration scene: grid, horizon line, 6-ft pole.
- Running gait frame by frame: heel recovery, knee drive, forward lean, arm swing.
- Three-point stance from the side: flat back, head up, down-hand at the turf.
- The projector window, the editor, the library, and the solo prompt and feedback overlays.

## Not verified here
- Frame rate on real laptop GPUs (no GPU available). Use the in-app measurement.
- Real presentation remotes and foot pedals. Key handling is verified with synthetic key events; remotes that send PageUp/PageDown/B are bound by default and anything else can be remapped.
- Loading a real third-party GLB athlete through the file picker. The retargeting math is verified with a synthetic rig.
- Physical projector calibration in a real room. The math is unit-tested; use the tape-measure checks in the Calibrate tab.

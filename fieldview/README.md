# FIELDVIEW

FIELDVIEW is a 3D football recognition trainer for a projector wall or a single screen. The athlete stands in a defender's spot and sees an animated 11-man offense. The offense breaks the huddle, aligns, shifts and goes in motion. The athlete identifies the look, then communicates the check (picking an answer or calling it aloud) before the snap. Every rep can be replayed exactly or re-randomized.

The app runs in the browser, needs no account, and works offline.

- **Coach mode:** pick a drill, playlist or quick-built formation; choose the viewpoint (LB, S, CB or EDGE) and the alignment, depth and eye height. You get play, pause, exact replay, next rep, scrubbing, speed and freeze points before, during or after the motion. Teaching overlays are optional. Evaluation mode hides answers on the projector.
- **Solo mode:** choose a drill set, then the session runs countdown → formation → motion → decision window → answer (or call it aloud and self-check) → feedback → rest → next rep. You set the reps, rest, randomized order and randomized timing. Missed reps can be repeated. Works with a keyboard, a presentation remote or a foot pedal.
- **Editor:** drag players on a field diagram, draw motion and shift paths, set timing, facing, speed and the snap, write the defensive call, cue, decision point, accepted answers and coaching explanation. A 3D preview shows the result immediately.
- **Projector:** a separate synchronized window for an extended desktop, or one-screen mode with collapsible controls. There is a calibration wizard for true-perspective viewing.

> **Demo answers are examples.** The 13 included drills come with example checks written for a generic over-front / cover-3 system ("Spin", "Bump", "Lock", "Trips", "Banjo", …). They are labeled as examples everywhere. Replace them with your own calls in the Editor (Settings → Coaching rules holds your terminology).

---

## 1. Install and run

You need **Node.js 18+** (20 or 22 recommended) and a current Chrome, Edge, Firefox or Safari with WebGL2.

```bash
cd fieldview
npm install
npm run build      # type-check + production build into dist/
npm start          # serves dist/ at http://localhost:4173 (http://<this-computer>:4173 on the LAN)
```

Open `http://localhost:4173` in Chrome or Edge.

- **Development:** `npm run dev` gives a hot-reloading server at http://localhost:5173.
- **Offline:** after the first visit, a service worker caches the app. `npm start` itself needs no internet. All 3D assets are generated in code, so there is nothing to download. You can also copy `dist/` to any computer and serve it with `npm start` or any static web server.
- Data is stored **in the browser** for that address (`localhost:4173`). Use **Library → Export everything** to back up drills, playlists, rules, calibration profiles and team colors, or to move them to another computer.

## 2. Projector setup (two screens)

1. Connect the projector and set the computer to **Extend** these displays (Windows: Win+P → Extend; Mac: System Settings → Displays → turn off mirroring).
2. In FIELDVIEW click **Open projector window**. If the browser blocks the pop-up, allow pop-ups for this site.
3. Drag the new window onto the projector. On Windows you can press Win+Shift+→ with the window focused.
4. In the projector window, **double-click** or press **F** for fullscreen. If fullscreen is blocked, use the browser's own fullscreen (F11 on Windows/Linux, Ctrl+Cmd+F on Mac).
5. Run everything from the coach window. Both windows follow **one authoritative timeline**:
   - The coach window owns the clock.
   - The projector window renders from the same shared state.
   - The top bar shows "1 projector window synced".
6. Key presses in the projector window are forwarded to the coach window, so a remote or pedal works whichever window has focus.

**One screen:** press **H** to hide the controls and **F** for fullscreen. Press H again to bring them back.

## 3. Projector calibration

Open **Calibrate**. The projector shows a calibration scene with a 1-yard ground grid, an orange horizon line and a 6-ft striped reference pole.

1. Use the projector's native resolution. Turn off digital zoom and square up the image (as little keystone as possible).
2. Tape the athlete's standing spot on the floor. Take every measurement from that spot:
   - Projected image width and height (the lit area).
   - Height of the image's bottom edge above the floor.
   - Distance from the athlete's spot straight to the wall.
   - The athlete's eye height in the stance they'll use.
   - Horizontal offset from the image center (+ = athlete stands to the right).
   - Display resolution (**Use this screen** reads it).
3. Check with a tape measure. The panel lists where things must land on the wall: the horizon line exactly at eye height, plus the base and top of the pole. If they're off, re-measure.
4. **Save profile.** Save one profile per room and switch between them any time.

**What the math does:** physical room measurements stay separate from the virtual football alignment. The image edges, relative to the athlete's eye, define an **off-axis viewing frustum** (`src/render/camera.ts`). Projected through it, the field lines up with the real floor and players appear life-size from the marked spot. All units are converted to meters internally; football data stays in yards.

### Calibrated View vs. Wide Training View

- **Calibrated View:** true perspective for the marked standing spot. From a linebacker's depth, wide receivers often fall outside the image. When that happens, FIELDVIEW **shows yellow edge arrows** and the coach panel lists who is off-screen. The formation is never stretched and its spacing never changes to make it fit.
- **Wide Training View:** a wider field of view that shows more of the formation (**Fit all 11** picks a FOV that includes everyone). Everything is smaller. The panel shows the scale, e.g. "players appear at about 50% of life size". Spacing and depth relationships are unchanged.

The perspective is exact for one fixed eye position. Head tracking is not implemented, and FIELDVIEW does not assume it can see the athlete. The extension point is `Stage.updateCamera()`: a tracker would update the eye position each frame, and `physicalScreen()` already takes an arbitrary eye offset.

## 4. Coaching workflow

- **Coach tab:**
  - Pick a drill or playlist, or use **Quick build** (formation, personnel, strength, hash, and a motion or shift template).
  - Choose LB/S/CB/EDGE and adjust alignment, depth and eye height.
  - **Play** runs to the freeze point (the drill's decision point by default). Freeze before, during or after the motion, or just before the snap.
  - **Replay** repeats the exact rep with identical timing. **Next rep** re-randomizes the timing within your bounds, or advances the playlist.
  - **Reveal on projector** shows your answer and explanation. ✓ and ✗ log a coach-scored verbal call.
- **Evaluation mode:** hides play names, labels, motion paths, the line of scrimmage overlay and answers on the projector.
- **Solo tab:**
  - Choose drills (or load a playlist), the response mode, reps, rest, answer window and randomization, then **Start session**.
  - Default keys: **1–6** answer; **Space/PgDn/→** start/reveal/next; **PgUp/←/R** replay or repeat missed; **B/.** pause.
  - In call-aloud mode, after the reveal, **Y** (or advance) = "I called it" and **N** (or back) = "missed". This works with two-button remotes.
  - Remap any key in **Settings**: click "Add key", then press the remote or pedal button.
- **What is measured:**
  - Which answer key was pressed, and how long after the decision window opened (key-press timing in the browser).
  - Completed reps.
  - Athlete self-checks in call-aloud mode, labeled as self-reported.
  - It does **not** measure verbal calls or physical movement. Those need separate sensing hardware.
- **Results:** Settings → Results lists sessions and exports a CSV.

## 5. Building drills (Editor)

- **Start a formation:** **Formation template → Apply** builds 11 players with plausible high-school spacing. Receiver splits are hash-aware.
- **Move players:** drag them. Values snap to ¼ yd. Select a player to edit label, **number**, role, stance, on/off-line and facing.
- **Add movement:** select a player, then **+ Motion / + Shift / + Post-snap**. Click to drop path points and double-click to finish. Each movement has:
  - A start time, measured from the start of the rep **or from the snap** (jet and orbit motions are timed to the snap).
  - Speed, a curved or straight path, and end facing or hold facing.
  - Randomized start bounds.
  - "Still moving at the snap".
- **Snap timing:** set the snap time and its random bounds (cadence variation).
- **Defense:** drag defenders, set the athlete position and the starting defensive call.
- **Recognition:** set the cue, the decision point (motion start, mid-motion, motion end, set, snap or custom) and whether to freeze.
- **Answers:** up to 6 choices. Tick every accepted answer and write the coaching explanation. Link your coaching rules.
- **Validation:** the editor warns about missing players, fewer than 7 on the line, fewer than five linemen numbered 50–79, overlapping players, more than one player in motion, forward motion at the snap, a shift that isn't set for 1 second, and answer or athlete references that don't exist.
- **Save, export, import:** **Save** / **Save as new** / **Export drill**. Library → **Import package** validates the file and reports errors.

## 6. Architecture

```
src/
  core/      units, shared state, authoritative Controller (clock, playlists, sessions)
  data/      zod schemas, NFHS field, formation builders, motion templates, demo drills, storage
  sim/       deterministic timeline compiler (paths, speed profiles, gait phase), validation
  anim/      skeleton, stance library, procedural pose solver (foot planting + two-bone IK)
  render/    Three.js stage, field, procedural player model, GLB retargeting, camera/off-axis math
  assess/    solo session state machine and results
  sync/      coach ↔ projector channel (postMessage + BroadcastChannel)
  input/     remappable keymap
  ui/        React interface (coach, solo, editor, library, calibration, settings, projector)
```

**Determinism:**
- A drill plus a rep seed compiles (`compileTimeline`) into fixed per-player tracks sampled at 120 Hz: position, facing, speed, acceleration, cumulative gait phase, and locomotion and stance blend weights.
- Everything rendered is a **pure function of (timeline, t)**. Poses are solved from the tracks, with no per-frame state.
- So pause, scrubbing (forward or backward), playback speed, replay and a second window can never drift.
- The clock is an anchor: sim time plus a wall-clock timestamp, plus speed and a stop point. Both windows compute identical times from it.

**Animation:**
- Skeletal pose per player: stance library (3-point, center, WR, QB gun / under center, RB, LB, DB, pass-pro, run-block).
- Idle breathing, weight shifts and head scanning.
- Locomotion with **footstep planting from the timeline**: each foot's contact point is where the body is at that foot's mid-stance. Stride length always matches speed, and planted feet stay put.
- Walk, jog and sprint mechanics: duty factor, heel recovery, arm swing, lean from acceleration, bank into turns.
- Continuous stance ↔ motion transitions: players rise slightly before the first step and settle back into their stance afterwards.
- Analytic two-bone IK for legs and arms, with soft-IK near full extension.
- A coordinated snap (ball flight to the QB, handoff on runs) and the first 2–3 seconds after the snap.

## 7. Verification

```bash
npm test                            # unit tests (timeline, animation quality, storage, projection math)
npm run dev &                       # or: npm run build && npm start
npm run verify:browser -- http://localhost:5173/   # end-to-end checks in Chromium (Playwright)
```

The unit tests cover:
- Every demo drill: 11 players, legality checks, motion in both directions, no-motion comparisons.
- Identical tracks for an identical seed.
- Paths ending at the authored waypoints.
- No teleporting.
- Planted-foot slide < 3 cm and no joint "pops" across all drills, with and without the huddle break.
- Off-axis frustum corners mapping exactly to the image corners.
- Unit conversion.
- Storage reload and export/import.

The browser suite covers:
- Replay identity.
- Pause, scrub and speed accuracy.
- Freezing exactly at the decision point.
- Coach/projector frame identity and key forwarding.
- Save → reload, and export → clear → import.
- A full solo session, "repeat missed", and call-aloud.
- 30 consecutive reps with no GPU-resource or heap growth.
- A frame-time measurement.

See `VERIFICATION.md` for the latest run and its environment.

## 8. Known limitations

See `LIMITATIONS.md`.

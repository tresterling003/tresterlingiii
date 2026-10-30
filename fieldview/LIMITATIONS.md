# FIELDVIEW: known limitations

These are the current gaps, stated plainly so coaches and developers know where they are.

## Visual fidelity
- **Athletes are procedural and stylized.** They are built from shaped primitives that are posed rigidly per body segment. Helmet, facemask, shoulder pads, jersey numbers, pants, knee pads, socks and cleats are all modeled. There is no skin deformation, no cloth simulation, no logos or decals, and the hands are mitts. They read well as football players at projector distance but are not photoreal. The upgrade path is to load a licensed rigged GLB; see `ASSETS.md`.
- **GLB retargeting is direction-based.** The limbs follow the solved joint directions, with no twist solving. Models with very different proportions can show small foot slide. Jersey numbers are not drawn on GLB athletes.
- **The animation is procedural, not motion capture.** Stances, idle, walk, jog, sprint, acceleration and deceleration, turning, and the first 2–3 seconds after the snap are covered. Blocking contact, catches and tackles are not; the scope is pre-snap recognition and first-step reads.
- **Defensive teammates hold their alignment.** They don't react to motion; that is the athlete's job. After the snap the front gets off the ball and the secondary bails slightly.
- The stadium surround is deliberately simple.

## Perspective and calibration
- **Perspective is exact for one fixed eye position**, the taped standing spot. If the athlete moves their head or steps off the spot, the perspective is no longer exact. Head or body tracking is **not implemented**, and FIELDVIEW never assumes it can see the athlete. The extension point is `Stage.updateCamera()`: feed it a tracked eye position each frame.
- **Calibrated View assumes the projector window fills the projected image**, i.e. it is fullscreen at the measured resolution. In a smaller window the image is letterboxed to the measured aspect but is no longer life-size.
- **Wide Training View makes players smaller than life.** The scale is shown in the panel.
- If the virtual eye height is set differently from the measured eye height, the virtual ground no longer lines up with the real floor. The panel warns about this.

## Assessment
- **Only key presses are measured:** which answer key, how long after the decision window opened (browser keyboard-event timing, typically accurate to a few ms plus device latency), and completed reps.
- **Verbal calls and physical movement are not sensed.** Call-aloud mode records athlete self-checks, labeled as self-reported. Coach ✓/✗ buttons record coach-scored calls.
- Wireless remotes and pedals add their own latency, typically 5–30 ms, which is included in the response time.

## Data and platform
- **Drills, results and settings are stored in the browser** (localStorage and IndexedDB) for the address you open. Clearing site data erases them. Back up with **Library → Export everything**. Opening the app from a different address (e.g. a different port or computer) starts with a separate store; move data with export and import.
- Two-window sync needs both windows in the **same browser** on the same computer. The projector window must be opened from the coach window, or be a tab of the same site.
- Fullscreen needs a user gesture (a click or the F key). Some kiosk or managed browsers block it; use the browser's F11 fullscreen instead.
- **Offline** use works after the first visit through a service worker (http/https), or by serving `dist/` locally with `npm start`. Opening `dist/index.html` straight from disk (`file://`) is not supported because browsers block module scripts there.

## Performance
- Performance was measured only in this build environment: a headless cloud container **without a GPU**, using Chromium's software renderer (SwiftShader). Frame rates measured there are far below what any real GPU delivers and say nothing about laptop performance. See `VERIFICATION.md`.
- On real hardware, use **Settings → Rendering quality → Measure performance** to measure your own laptop, and lower the resolution scale or turn off shadows if needed. No frame rate is guaranteed.

## Football logic
- **Demo answers are examples**, not a defensive system. Every correct answer is coach-authored.
- The legality checks are NFHS-oriented warnings: 7 on the line, five linemen numbered 50–79, one player in motion, no forward motion at the snap, 1 second set after a shift. They don't cover every rule, such as eligible-number exceptions or the kicking game.
- Quick-build motion templates pick a plausible player and path. Fine-tune them in the editor.

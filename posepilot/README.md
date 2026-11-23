# PosePilot — AI-assisted 2D animation studio for beginners

> **Draw once. Describe the motion. Discover your next poses.**

A student uploads or draws **one** character, types what it should do ("make him crouch and jump forward"), and PosePilot plans the motion and creates the **next 2–3 key poses** of that same character. The student then reviews, traces, fixes, times and plays the sequence, and exports numbered PNGs for Toon Boom Harmony.

PosePilot assists the animator; it doesn't replace them. Every generated pose is labelled as a suggestion, sits on its own layer for tracing, and can be fixed, regenerated on its own, or restored.

---

## Run it

```bash
cd posepilot
npm install
npm run dev            # http://localhost:5173  (the AI API runs inside the dev server too)
```

Production (one Node process serves the app **and** the AI API):

```bash
npm run build
npm start              # http://localhost:8787   (PORT=… to change; reads .env)
```

**Static hosting** (GitHub Pages, Netlify, a school web server): `npm run build` and upload `dist/`. Everything except AI drawing works with no server. The app notices that `/api` is missing and says so in plain words.

Requirements: Node 18.17+ on the server. Students only need current Chrome (Chromebooks are fine). No GPU, no account, no install.

---

## The two ways poses are made (and why they're kept separate)

| | **Mode A — AI drawing** | **Mode B — Rig poses** |
|---|---|---|
| What happens | An image model **redraws** the student's character in a new pose, using the original drawing as reference plus a colour-coded stick-figure **pose guide** for structure. | A 2D skeleton (head, neck, torso, shoulders, elbows, wrists, hips, knees, ankles, feet) is **posed with exact joint angles** and the character is re-rendered from it. |
| Works for | Any drawing: line art, cartoons, detailed illustrations. | Stick figures, the demo characters, and **cut-out** characters (pieces of the student's drawing pinned to bones). |
| Can it invent new detail (a hand from a new angle, a turned head)? | Yes, which is also why it can drift from the design. | No. It only moves what exists. |
| Needs | A configured provider key on the server, plus per-project student consent. | Nothing. Offline and instant. |
| Consistency | Not guaranteed; a heuristic check flags colour/size drift or an "unchanged" result. | Exact: proportions, colours and line weight never change. |
| In-betweens | AI can draw one in-between (labelled). | True interpolation of every joint, with easing. |

Both modes share one **motion planner**, so the motion is always interpreted the same way (anticipation → action → follow-through) and the AI is told *which* pose to draw rather than left to guess. The UI badges every frame as `ORIG`, `AI`, `RIG`, `IB` (in-between), `DRAW` or `COIN`.

PosePilot never fakes in-betweens by cross-fading two images, and it never fabricates AI output. With no provider configured, AI mode is disabled and the reason is shown.

---

## What's built

**Core workflow (Studio and Quick Animate)**
- Upload PNG/JPG/WebP (validated, size-limited, large images scaled down). Transparent backgrounds are detected. A plain paper background can optionally be removed with a **border flood fill**, so white areas *inside* the character (eyes, shirt) are kept. You see a live preview, and the untouched original stays restorable.
- Draw a new character in-app, open a saved project, open a `.posepilot` file, or load demo characters **Sticks** (stick figure) and **Pip** (cartoon).
- Natural-language **motion prompt** with 12 presets (Walk, Run, Jump, Punch, Kick, Wave, Turn, Crouch, Fall, Throw, Look Around, Idle Motion). It also understands land, point, raise arm, surprise and coin flips, plus compound prompts like *"crouch down, jump into the air, and throw a punch"* (the punch is layered onto the mid-air pose).
- **Motion plan**: action type, direction, side (left/right with a one-tap correction), body parts, timing/holds, roles (anticipation / action / follow-through / contact / passing…) and an **Explain this motion** panel in beginner language. Unknown prompts get quick-pick chips instead of a long conversation.
- Controls: 2 or 3 poses, intensity (subtle / normal / big), speed (slow / normal / fast, which changes holds and in-between counts), camera view, and for AI a consistency ("pose freedom ↔ match character") and quality setting.
- **Review & edit**: large canvas with zoom/pan, onion skin (previous = red, next = green, original = blue, adjustable opacity), a separate **"My lines"** layer for tracing with a pose-fade slider, brush (pen pressure supported), eraser, rectangular select, move/rotate/scale transform, undo/redo (bitmap edits store only the changed rectangle), per-frame hold, rename, reorder by drag, duplicate, delete (undoable), **Restore generated**, and **regenerate only one pose** with a correction ("raise the arm higher"). In AI mode the previous attempt is sent along with the correction. In Rig mode, corrections are parsed and applied to the joints.
- **Pose Rig tool**: drag joints (forward kinematics), drag hands/feet (two-bone inverse kinematics), drag the pelvis to move or lift the body, lean slider, flip facing, swap left/right, side/front view, pose presets. **Fit to drawing** stretches the bones onto the student's own drawing. **Cut-out** lets students lasso parts of their drawing and pin them to bones; uncut areas follow the torso.
- **Timeline & playback**: thumbnails, holds/exposures, 6/8/12/24/custom fps, loop, frame stepping. In-betweens can be added between any two frames: rig interpolation (real), AI, or a blank frame for hand-drawing with onion skin.
- **Export**: numbered PNG sequence ZIP (`frames/frame_0001.png …`, every image the same size, alpha preserved, holds optionally baked in, plus a Harmony how-to and a frames.csv), the current frame, one PNG per pose, a **printable pose reference sheet**, and a portable `.posepilot` project file. Exports never contain UI.
- **Autosave** to IndexedDB (debounced, plus save on tab hide), restore on reload, and a warning if the browser can't save.

**Classroom**
- **Quick Animate**: four big steps (Start → Describe → Generate & refine → Preview & export) for a 45-minute class.
- **Lessons**: Assignment A (Anticipation: jump), B (Action: 3-pose punch), C (Follow-through: throw) with student steps, a starter prompt, a "show worked example" button (built live with the rig), and the reflection question *"What changed between your original pose and your final pose?"*. The reflection is saved in the project and printed on the pose sheet.
- No accounts or student database. Work stays in the student's browser and is handed in as a ZIP, pose sheet or project file.

**Special tools**
- **Coin Flip Assistant**: front/back drawings (or the built-in demo coin) rotated with 2D/3D transforms. You pick the number of drawings, turns, axis, toward/away direction, easing, toss arc, rim thickness and colour. No AI needed.

### Not built yet (honest list)
- **Real AI provider calls have not been run.** This environment had no API key. The OpenAI and Gemini adapters follow the providers' documented request/response formats, and the whole client/server pipeline is tested end-to-end against a mock provider (see Tests). Run one real generation after adding a key before relying on it in class.
- **Walk Cycle Assistant** (an 8-pose looping cycle builder) and **Expression Assistant**: not built and not shown in the UI. Walk/Run poses (contact, passing…) and rig in-betweens are available today.
- AI **masks / ControlNet-style structural control**: not used. Pose control comes from the pose-guide image and the prompt, which is what the supported "edit with reference images" APIs accept.
- Rig mode can't redraw a detailed illustration in a new pose. Cut-out pieces are rigid (no mesh bending), so bends at the elbows and knees show seams unless parts overlap.
- Lasso select, layers beyond "Drawing" and "My lines", audio and camera moves are out of scope.

---

## Turning on AI drawing generation

1. Copy `.env.example` to `.env` (or set real environment variables on your host).
2. Set **one** key:
   - `OPENAI_API_KEY=…` uses `gpt-image-1` image **edits** with up to 4 reference images, `input_fidelity=high` (keeps faces and details closer to the original) and a transparent background. Override the model with `OPENAI_IMAGE_MODEL` and quality with `OPENAI_IMAGE_QUALITY`.
   - or `GEMINI_API_KEY=…` uses `gemini-2.5-flash-image` (image + text → image). Override the model with `GEMINI_IMAGE_MODEL`. It returns opaque images, so PosePilot removes a plain background automatically and labels the frame when it does.
3. Restart `npm start` (or `npm run dev`). The start screen pill should read **"AI drawing on"**.

**What gets sent:** a 1024×1024 crop of the original drawing, a colour-coded stick-figure pose guide, and a text instruction. When regenerating with a correction, the previous attempt is sent as well. Students see a consent dialog (once per project) before anything leaves the browser. Keys live only on the server. `/api/status` reports the provider and model but never the key. The server keeps student images in memory only for the length of the request.

**Expected costs** (approximate list prices from late 2025; check the provider's pricing page):

| Provider | Per pose | A 3-pose generation | A class of 30, ~5 generations each |
|---|---|---|---|
| OpenAI `gpt-image-1`, medium quality | ~$0.05–0.10 (high fidelity input adds image tokens) | ~$0.15–0.30 | ~$25–45 |
| OpenAI `gpt-image-1`, low quality | ~$0.02–0.04 | ~$0.06–0.12 | ~$10–18 |
| Google `gemini-2.5-flash-image` | ~$0.04 | ~$0.12 | ~$18 |

**Limits & safety:** `POSEPILOT_MAX_PER_HOUR` (default 60 per computer/IP; 0 = unlimited) protects the teacher's quota. Each request times out after `POSEPILOT_TIMEOUT_MS` (120 s). Jobs can be cancelled (the upstream request is aborted). Provider errors are translated: rejected key, quota or rate limit, content-policy refusal, outage, timeout, offline. On any failure nothing in the project changes.

---

## Tests

```bash
npm test               # 33 unit tests: planner, rig FK/IK/interpolation, corrections, export naming, server/providers
npm run build && npm run e2e    # browser acceptance tests at 1366×768 (SHOTS_DIR=./shots saves screenshots)
```

| Brief's test | How it's checked (`scripts/e2e.mjs`) |
|---|---|
| 1 Drawing upload | Uploads a PNG on white paper. Checks it's on a 1280×720 canvas, the border background is now transparent, and the white face pixels are kept. |
| 2 Save & restore | Draws, waits for "Saved", reloads. Frames, holds and the drawn pixels come back identical. |
| 3 Motion prompt | "make the character wave" → plan with anticipation / action / follow-through and an explanation. |
| 4 Procedural generation | Sticks demo + "jump forward" → 3 rig poses whose *shapes* (cropped to their own bounds) differ, so they aren't shifted copies. |
| 5 AI generation | Runs against a **mock provider inside the test script only**, which echoes back the pose guide. Proves consent → one request per pose with drawing + pose guide (+ previous attempt on regeneration) → new frames placed, original untouched. Does **not** prove a real model draws good poses. |
| 6 Pose editing | Draw on a generated pose, erase part, undo ×2, redo; pixel counts verified. |
| 7 Onion skin | Red ghost of the previous pose appears, grows stronger with opacity, disappears when off. |
| 8 Playback | Records the playhead at 24 fps: every frame in order, each drawing held exactly its hold count. |
| 9 Export | Unzips the download: `frame_0001.png…` in order, count = total exposures, every PNG 1280×720 RGBA. |
| 10 Chromebook | 1366×768: no page overflow in Studio or any Quick Animate step; canvas, Generate, Play and prompt on screen. |
| 11 Failure handling | No provider → AI mode explains and disables. Provider 500 / 429 → clear message, frames unchanged. Cancel adds nothing. |
| 12 No fake features | Manual audit, below. |

**Test 12 audit.** Every button, chip, slider and menu item in the UI is wired to working code. There are no placeholder buttons. Features that aren't built (Walk Cycle Assistant, Expression Assistant) have no controls. AI controls are disabled with an explanation when no provider is configured. In-between options that can't apply (rig interpolation between two drawings, AI without a key) are shown disabled with the reason.

---

## Architecture

```
posepilot/
  server/
    providers.mjs   provider adapters (OpenAI edits, Gemini generateContent), error mapping — no SDKs
    api.mjs         /api/status, /api/generate-pose; rate limit, timeout, cancel; framework-free
    index.mjs       production server: static dist/ + API (also mounted into Vite dev/preview)
  src/lib/
    motion/         library.ts (key poses authored in world angles), planner.ts (NL → MotionPlan), corrections.ts
    rig/            skeleton.ts (FK, two-bone IK, fitting, easing, interpolation), render.ts (stick / cartoon / cut-out / pose guide)
    ai/             client.ts (fetch /api), prompt.ts, compose.ts (crop & place), consistency.ts (heuristic check)
    raster/         image.ts (upload validation, background analysis & border flood fill, bbox, ink colour)
    export/         sequence.ts (compositing, hold expansion, ZIP, Harmony readme)
    storage/        db.ts (IndexedDB), projectFile.ts (.posepilot ZIP)
    coin.ts, demo.ts
  src/state/        store.ts (Zustand: project, frames, generation jobs, autosave), history.ts (undo), layers.ts (bitmaps)
  src/components/   CanvasView (drawing/transform/rig overlay), Timeline, MotionPanel, FramePanel, RigPanel,
                    QuickAnimate, StartScreen, Dialogs (import/export/consent/in-betweens/coin/lessons/help)
```

**Library choices**
- **React 18 + TypeScript + Vite**: fast builds and a static bundle that runs anywhere.
- **Zustand**: one small store, readable from non-React code (generation jobs, autosave).
- **Tailwind CSS**: the dark studio theme lives as design tokens in `tailwind.config.js`.
- **Custom canvas engine instead of Konva/Fabric.** Frames are raster layers that students paint on. That needs direct `CanvasRenderingContext2D` access for brush, eraser (`destination-out`), dirty-rect undo and pixel-exact export. A scene-graph library would add weight and an extra abstraction between strokes and pixels. Vector overlays (rig joints, transform handles, lasso) are SVG.
- **JSZip** for sequences and project files. **IndexedDB** used directly (one ~80-line helper). **lucide-react** icons. **Inter** font, bundled so it works offline.
- No AI SDKs: two `fetch` calls are easier to audit and keep the server dependency-free.

**Memory on Chromebooks:** each frame holds two canvases (drawing and "My lines") plus a pristine copy for "Restore". Undo stores changed rectangles and is capped at 80 steps or ~160 MB. Uploads are capped at 2400 px and fitted into a 1280×720 project by default. Onion skins are tinted at half resolution and cached.

---

## Using it in class (cheat sheet)

1. Open PosePilot → **Quick Animate** → Upload (or a demo).
2. Type the motion or tap a preset → **Generate 3 poses**.
3. Click each pose, trace it with the pen (on your own layer), and fix or regenerate any pose that's off.
4. **Preview**, add in-betweens if it's jumpy, then **Download frames for Harmony**.

Import into Harmony: unzip → *Scene › Scene Settings* (match the fps) → *File › Import › Images…* → select all `frame_####.png`, one layer, Vectorize off.

**Keyboard:** `B` draw · `E` erase · `M` select · `V` move · `H` pan · `P` pose rig · `O` onion · `[ ]` brush size · `Space` play · `, .` prev/next frame · `Ctrl+Z / Ctrl+Shift+Z` undo/redo · `Ctrl+scroll` zoom · `0` fit · `Ctrl+S` save now.

**Privacy:** projects live in each student's browser (IndexedDB). Clearing browser data deletes them, so have students download a project file for anything important. Nothing goes to a server unless AI mode is used **and** the student agrees.

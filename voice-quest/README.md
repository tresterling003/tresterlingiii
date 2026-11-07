# Voice Quest: Christmas Kingdom

A 3D adventure game you play in the browser. It gives young children (about ages 4–8) playful reasons to talk. The first player is a 5-year-old who understands speech well but is hard to understand when he talks. In the game, speaking helps characters, wakes up magic and opens the way forward. **Every speaking moment can also be finished by tapping a picture or choosing "keep going".** The rewards are the same either way.

> This is a recreational, educational game. It is **not** a medical device or a speech assessment, and it does not replace a speech-language pathologist.

## Play it

**Live:** https://tresterling003.github.io/tresterlingiii/voice-quest/play/ (served by GitHub Pages from `main` once merged).
Open it in Chrome or Edge on a computer. The browser asks for microphone permission at the first speaking moment.

To update the live copy after code changes: `npm run build:live`, then commit the `play/` folder.

## Quick start

```bash
cd voice-quest
npm install
npm run dev          # http://localhost:5173  (microphone needs localhost or https)
npm run build        # type-check + production build in dist/
npm run preview      # serve the production build
```

Use a desktop browser with WebGL. Chrome or Edge gives you every voice mode. Safari works. Firefox works in voice-detection mode and pictures mode, but it has no word recognition.

On first launch the **grown-up setup** screen explains the three microphone modes and offers a microphone test. Settings can be changed later in **⚙️ Grown-ups**. To get in, you hold a button, then answer a multiplication question.

### Controls
| Action | Keyboard / mouse | Gamepad |
|---|---|---|
| Move | Arrow keys / WASD, or **click the ground** to walk there | Left stick |
| Jump (double jump) | Space | A |
| Talk / interact | E / Enter, or the big yellow 👋 button, or click a character | X / B |
| Look around | Drag the mouse, Q/R, mouse wheel to zoom | Right stick |
| Hear the goal again | 🔊 button | — |
| Reindeer Dash steering | ←/→ or A/D (W/S speed up / slow down); clicking left or right of the screen also steers | Left stick |

## What's in the game

**Christmas Kingdom village (open 3D world).** Central plaza with a giant decorated tree, snowman village across a wooden bridge over a frozen stream, toy workshop, reindeer stable, frozen pond (slippery ice), your own cabin, Letter Lane and a Bell Tower. Snowfall, twinkling string lights, glowing windows, soft shadows, sparkle effects. There are also 9 hidden magic stars, one of them up a moving-platform climb, plus coin trails and wandering animals. Twinkle, a star fairy, follows you, tells the story, and a golden arrow points to the current goal.

**Mini-game 1 – Save the Snowmen.** Four snowmen lost a hat, a scarf, a carrot nose and their buttons. Talk to a snowman, follow the arrow to the glowing item, and bring it back. The snowman asks *"What did you find?"* and the voice moment runs (see below). The snowman gets the item back, cheers up and dances, and you earn a star. When all four are saved there's a dance party plus rewards. The **wind horn** sign restarts the quest with items in new places.

**Mini-game 2 – Toy Factory.** A moving conveyor belt, a toy machine that pumps out parts, and Gizmo the robot host.
1. *Color sorting.* Tap a toy, then tap the matching color bin. At voice moments, naming the color makes the toy fly into its bin by magic.
2. *Shape matching.* Drop shapes into the matching holes on a shape board. Naming the last shape makes the machine send it.
3. *Build a robot.* Ask the machine for parts ("blue wheel") and it produces them. Then pick the right part off the belt. For the body and head your child *chooses* the color, and any answer counts. The robot comes alive and dances, and its design is saved to your cabin.

**Mini-game 3 – Reindeer Dash.** Ride Juniper the reindeer down a long course. Jump, double jump, dodge rolling snowballs (a hit just slows you down for a moment), ride a moving platform over a gap, and collect coins, bells and presents. There's also a secret high path. The run **stops at four checkpoints**, and the timer pauses while you're stopped, so nobody is ever rushed to speak:
- Ask the drawbridge to **open**.
- Choose the **red or green** path. Either answer is fine.
- Say a **color** to wake up that color's floating platforms.
- Ask Twinkle for **help** to melt a snow pile.

At the finish everyone gets a medal (gold, silver or bronze, based on time).

**Also playable:**
- **Alphabet friends** (Bibo **B**, Mimi **M**, Pip **P**, Sunny **S**) with original letter-character models. Each friend models its sound ("buh, buh, ball") and asks you to collect three things that start with it.
- **Bell Tower music.** Sing along, and the bells ring in time with your child's voice (uses local loudness only). Then finish an original rhyme.
- **Animal friends.** Puppy, kitty, penguin, owl and bunny each react to their sound or word.
- **Wish Tree.** Where parents' custom words and target-sound words show up.
- **My Cabin.** Your unlocked decorations and toys appear here. Tap the sparkles to rearrange them.
- **Dress-up (👕).** Coat, hat, scarf, skin and hair colors. Hat styles and reindeer gear unlock through play.

Rewards: magic stars, coins, bells, decorations, toys, outfits and reindeer accessories. There are no purchases, loot boxes or streaks. Rewards never depend on how clearly the child speaks.

## The voice system: what really works

Each part of the system is a separate layer (`src/speech/`):

| Layer | What it does | Status |
|---|---|---|
| Microphone detection (`mic.ts`) | `getUserMedia`, opened **only** while the glowing mic + chime show listening, released right after every answer | ✅ Working, tested with Chromium's fake audio device and with permission denied |
| Speech activity detection (`mic.ts`) | On-device loudness detector with automatic noise-floor calibration. Tells silence from a voice attempt | ✅ Working, unit tested. Runs fully offline. No audio stored |
| Transcript recognition (`recognizers.ts`) | Adapter interface with a Web Speech API adapter, a **simulated** adapter for developers, and room for a future child-speech model | ✅ Working where the browser supports it (Chrome, Edge, Safari). ⚠️ Chrome and Edge send audio to the vendor's online service, so it doesn't work offline there. Accuracy for young children is **not validated** and is usually lower than for adults |
| Target matching (`matcher.ts`) | Normalizes transcripts and accepts equivalents, phrases, key words inside sentences, and (optionally) near misses such as "had" → "hat" | ✅ Working, unit tested |
| Articulation assessment | — | ❌ **Not implemented on purpose.** The game makes no claims about pronunciation, phonemes or clarity, and shows no clarity scores |

**Microphone modes** (chosen by the parent):
1. **Voice detection on this device** (the default). Any voice attempt counts as practice. Nothing leaves the device.
2. **Word recognition.** Needs explicit parental consent after a disclosure that audio may go to an online service. Without consent, the game falls back to mode 1.
3. **Pictures only.** The microphone is never used.

**The four feedback states**, matching the brief:
- **A – recognized:** "Awesome! You found my hat!" plus a celebration.
- **B – heard but not recognized:** "I heard you! Let's try it together!" The word is modeled again, and the child gets four buttons: 🔊 hear it, 🎤 try again, 🖼️ pictures, ➡️ keep going.
- **C – silence:** "Ready when you are!" with the same choices.
- **D – unavailable** (mic denied or missing, recognizer down): switches straight to big picture choices. The game also switches to a working mode for the rest of the session and tells the parent in the dashboard.

The game never says "wrong" or anything like it. Tapping a wrong picture gets a gentle hint and the right picture wiggles.

**Practice levels A–E** (sounds and syllables → words → phrases → sentences → open answers) are set separately from **game challenge** (Gentle, Normal or Zippy). For sounds and syllables (level A), any voice attempt counts, because a speech recognizer can't fairly judge single sounds.

## Parent dashboard (⚙️ Grown-ups)
- **Voice & privacy:** mode, consent, microphone test, recognition test, language, and the live active mode with the reason for any fallback.
- **Practice:** level, prompting style (model first / try first / picture cue only), listening time, number of tries before "keep going" is highlighted, generous matching, target sounds (e.g. from your SLP), custom words with picture emoji, and **extra accepted answers** for each game word (e.g. "dod" for "dog").
- **Play & comfort:** game challenge, break reminder (off/10/15/20/30 minutes), four volume sliders, reduced motion, reduced effects, captions.
- **Progress:** practice opportunities per word labelled *Recognized / Practiced / Tried again / Completed with help / Picture choice*, moments per day, recent voice moments (with recognizer text only in word-recognition mode), sessions, and completed activities. There's a clear note that these numbers are **not** clinical measures.
- **Notes:** your own dated observations.
- **Data:** export JSON, clear the practice log, reset progress, delete everything, and turn on the developer voice panel.

## Privacy
There are no accounts, ads, chat, social features, analytics or third-party trackers. Everything (settings, rewards, practice log, notes) is kept in this browser's `localStorage`. Raw audio is never stored or uploaded by the game. The only possible outside data flow is the browser's own speech-recognition service, and only in the opt-in recognition mode after consent. **If you ever publish this for other families, review children's privacy rules (such as COPPA) first.**

## Developer voice panel
Open **⚙️ Grown-ups → Data**, enable the panel, then press <kbd>`</kbd> in the game, or add `?dev=1` to the URL. The panel shows:
- microphone permission, the active mode, whether the recognition API is present, and consent
- the listening state
- whether speech was detected (voiced ms, peak, noise floor)
- transcripts and confidence
- the expected answer and accepted answers
- how the match was made
- the final state and duration

Technical failures are highlighted in red, separately from the child's responses. **Simulate** mode (or `?sim=1`) replaces the mic and recognizer, so you can queue *expected / custom text / voice-no-words / silence / permission denied / network error* without a microphone. `?quiet=1` turns off speech synthesis, for automated tests.

## Tests

```bash
npm test             # 35 unit tests: matcher, VAD, state classification, listen loop, storage, content
npm run build && npm run smoke       # headless Chromium plays through every scene (uses ?sim)
npm run build && npm run mic-check   # real mic paths: permission denied → pictures; fake audio device → detected
```

`smoke` saves screenshots to `test-results/`. Both browser scripts need Playwright with Chromium available.

### Manual testing checklist
- [ ] First launch shows grown-up setup. Recognition mode can't start until the consent box is ticked.
- [ ] Microphone test shows a level meter and says "Microphone released". The browser's mic indicator turns off afterwards.
- [ ] Decline mic permission → the next voice moment goes straight to pictures, and the dashboard shows the fallback reason.
- [ ] Unsupported browser (Firefox) → word-recognition option is disabled, and detection mode works.
- [ ] Voice moment: character finishes talking → chime → red mic glows "Listening" → mic closes. No listening happens while the game is speaking.
- [ ] Stay silent → "Ready when you are!" with 🔊 🎤 🖼️ ➡️ buttons.
- [ ] Mumble (recognition mode) → "I heard you! Let's try it together!"
- [ ] Say the word → celebration and reward. Say a phrase that contains the word → also accepted.
- [ ] Wrong picture tapped → gentle hint, the right picture wiggles, no negative words.
- [ ] Save all 4 snowmen → dance party and unlocks. Wind horn restarts the quest.
- [ ] Toy Factory: sort → shapes → build robot. Robot appears on the cabin shelf.
- [ ] Reindeer Dash: all 4 checkpoints, falling into a gap respawns gently, finish shows a medal, the secret path unlocks antler lights.
- [ ] Break reminder appears after the set minutes. "Keep playing" needs the adult gate.
- [ ] Reduced motion and reduced effects visibly calm the game. Volume sliders work separately.
- [ ] Export, reset and delete-all data work.

## Honest limitations
- **Speech recognition accuracy for children has not been evaluated.** General-purpose browser recognizers are built mostly for adult speech. In this version's testing, the recognition path was checked only with simulated input and Chromium's fake audio device, **not with real adult or child voices**. Real-voice testing is still to do.
- Word recognition in Chrome and Edge depends on an online service and may be unavailable, rate-limited or slow. The game detects errors and falls back to on-device detection.
- On-device voice detection measures loudness only. Loud background noise or a TV may count as an "attempt", and very quiet speech may be missed. Calibration helps but isn't perfect.
- There is no articulation, phoneme or clarity assessment. Practice counts are counts of opportunities, not proof of improvement.
- "Target sounds" are matched by simple spelling (e.g. "s" in "snow"), not phonetics. They only steer word choice at the Wish Tree.
- Character voices come from the browser's speech synthesis, so they vary by device. There are no pre-recorded voice files.
- All 3D models are built in code (stylized, rounded shapes with simple procedural animation). There is no skeletal animation or motion capture.
- Collision is a small custom solver (boxes and cylinders). It's enough for walking, jumping and platforms, but it isn't a full physics engine.
- Desktop browsers are the target. Touch screens work for tapping, but there's no on-screen joystick yet, so movement uses tap-to-walk.
- Content is English only.
- The 3D text font for the letter characters is three.js's bundled *helvetiker* typeface. All music, characters and artwork are original to this project.

## Project layout
```
src/
  main.ts, game.ts            boot, scene manager, rewards, session timer
  core/                       audio engine (synth SFX + original music), TTS, input, local storage
  speech/                     mic + VAD, recognizer adapters, matcher, listen/classify turn
  data/                       practice content (levels A–E), rewards catalogue, SVG picture library
  three/                      materials, sky, snowfall, particles, string lights; models/ (hero, snowman,
                              reindeer, robot, animals, letter friends, Twinkle, houses, props)
  world/                      collision world, hero controller, follow camera
  scenes/                     village (+ snowmen, letters, bells, animals, wish tree), factory, dash, cabin
  ui/                         voice director (child-facing flow), HUD, menus, parent dashboard, dev panel
tests/                        vitest unit tests
scripts/                      smoke.mjs, mic-check.mjs (Playwright)
```

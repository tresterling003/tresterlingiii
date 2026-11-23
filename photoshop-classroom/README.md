# Photoshop Classroom — Lesson Recorder

A Photoshop panel for teachers and students.

- **🎬 Teach tab:** press **Record** and build your project normally. Every action (adjustment layers, filters, blend modes, opacity, masks, placing images, text, tool picks…) becomes a step with a plain-English title and a snapshot of your canvas. The images you place and the fonts you use are collected automatically. Save, and you get a **lesson folder** to hand out.
- **🎓 Learn tab:** students open the lesson folder and follow along one step at a time. The panel **detects when they've done each step** and moves on automatically. Each step shows your snapshot, your tip, and one-click buttons for the files it needs. Stuck students can press **👀 Show me** and Photoshop does that step for them.

Coming next, built on the same engine: a **live teacher dashboard** showing every student's screen and lesson progress, and a **Photoshop escape room**.

## Install (teacher computer)

Needs **Photoshop 2023 (v24) or newer**.

1. Open the **Creative Cloud desktop app** → *Apps* → search for **UXP Developer Tool** → install it.
2. Open Photoshop, then open the UXP Developer Tool.
3. Click **Add Plugin** and choose `photoshop-classroom/plugin/manifest.json`.
4. Click **••• → Load**. In Photoshop, open **Plugins → Lesson Recorder**.

## Install (student computers)

1. On your computer, in the UXP Developer Tool, click **••• → Package**. This creates a `.ccx` file.
2. Copy the `.ccx` file to each student computer and **double-click it**. The Creative Cloud app installs it. It will warn that the plugin isn't from the Adobe marketplace; that's expected.
3. The panel shows up under **Plugins → Lesson Recorder**.

**School-managed computers:** if double-clicking is blocked, send IT the `.ccx` file and this note: *"Third-party Photoshop UXP plugin, installed with Adobe's UPIA tool (`UnifiedPluginInstallerAgent --install file.ccx`). No network access. Reads and writes only files the user picks."*

## Recording a lesson

1. Open your starting photo (or create a new document), type a **lesson title**, and press **● Start recording**.
2. Work normally. Steps appear as you go. Dragging a slider creates one step, not fifty.
3. For things Photoshop can't record (**brush strokes, painting on a mask, erasing**), click **✋ Add manual step** after doing them and type what you did.
4. Press **■ Stop**, then clean up: rename steps, add tips for students, uncheck **Must do** for optional steps, reorder with ▲▼, retake a snapshot with 📷.
5. **💾 Save lesson…** → pick an empty folder. You get:
   ```
   My Lesson/
     lesson.json        ← the steps, tips and snapshots
     assets/            ← your starting photo, textures and images, copied automatically
   ```
6. **Fonts:** fonts are listed in the lesson automatically, but font *files* can't be copied that way. Use **📎 Add asset file** to add the `.ttf` or `.otf`. Students see a warning if a font isn't installed.
7. Share the **whole folder** with students (Google Drive, USB drive, shared drive…).

To change a lesson later, use **📂 Edit a lesson…**, then save again.

## Following a lesson (students)

**🎓 Learn → 📂 Open lesson…** → pick the lesson folder. Then just do each step in Photoshop.

| Button | What it does |
|---|---|
| **📄 Place / 🖼 Open** | Brings in the exact file the teacher used |
| **👀 Show me** | Photoshop does the step for them (marked "shown", not "done") |
| **✓ I did it** | For manual steps, or if the auto-check missed it |
| **Skip ▶ / ◀ Back** | Move around; click any step in the list to jump |

Progress is saved, so students can close Photoshop and pick up where they left off.

## How the step checking works

The plugin listens to the same events Photoshop records in the **Actions panel**. A student's action counts when it's the **same kind of action** as yours. Examples: a Curves adjustment layer (not Levels), a change to the same layer property (opacity, blend mode…), placing the same file. **Exact values don't have to match**: if you used 60% opacity and a student uses 55%, it still counts. Your numbers are shown in the step title as a guide.

Known limits:
- Brush strokes and painting aren't Photoshop events. Use manual steps for them.
- **Show me** replays your exact action. It can fail if the student's layers are very different from yours, for example if the wrong layer is selected. The panel then asks them to do it by hand.

## Try it now

A sample lesson is included: `sample-lessons/soft-glow/` (the dreamy "Orton effect" glow). Open any photo, then **Learn → Open lesson…** → choose that folder.

## For developers

```
plugin/
  manifest.json     UXP manifest (Photoshop 24+, file-system access only)
  index.html        panel UI
  main.js           Photoshop + UI glue (recording, saving, the student flow)
  lib/steps.js      pure logic: event filtering, plain-English titles, matching, replay cleanup
tests/steps.test.js
```

Run the logic tests: `node --test photoshop-classroom/tests/steps.test.js`

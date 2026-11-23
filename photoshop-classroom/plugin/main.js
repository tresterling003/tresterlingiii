// Lesson Recorder — a Photoshop UXP panel.
//  Teach tab: records what the teacher does in Photoshop as lesson steps
//             (with a snapshot of the canvas after each one) and bundles the
//             images, textures and fonts used into a lesson folder.
//  Learn tab: walks a student through that lesson one step at a time and
//             detects automatically when they've done each step.

const { app, core, action, imaging } = require("photoshop");
const uxp = require("uxp");
const { localFileSystem: lfs, formats } = uxp.storage;
const S = require("./lib/steps.js");

const FORMAT = "ps-classroom-lesson";
const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o == null ? {} : o));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// While > 0, Photoshop events come from this plugin itself and are ignored.
let suppress = 0;
const quietly = async (fn) => {
  suppress++;
  try { return await fn(); } finally { setTimeout(() => { suppress--; }, 400); }
};

// ---------------------------------------------------------------------------
// Shared Photoshop helpers
// ---------------------------------------------------------------------------

function activeDoc() {
  try { return app.activeDocument || null; } catch (e) { return null; }
}

function currentLayerName() {
  try {
    const doc = activeDoc();
    const layer = doc && doc.activeLayers && doc.activeLayers[0];
    return layer ? layer.name : "";
  } catch (e) { return ""; }
}

// A small JPEG of the whole canvas, as a data URL.
async function captureSnapshot(maxSize) {
  const doc = activeDoc();
  if (!doc || !imaging) return null;
  maxSize = maxSize || 480;
  try {
    // Not wrapped in quietly(): reading pixels creates no Photoshop events, and
    // muting events here would drop any action the teacher takes meanwhile.
    return await core.executeAsModal(async () => {
      const scale = Math.min(1, maxSize / Math.max(doc.width, doc.height));
      const pix = await imaging.getPixels({
        documentID: doc.id,
        targetSize: { width: Math.max(1, Math.round(doc.width * scale)), height: Math.max(1, Math.round(doc.height * scale)) },
        componentSize: 8,
        applyAlpha: true,
        colorSpace: "RGB",
      });
      const b64 = await imaging.encodeImageData({ imageData: pix.imageData, base64: true });
      pix.imageData.dispose();
      return "data:image/jpeg;base64," + b64;
    }, { commandName: "Lesson snapshot" });
  } catch (e) {
    console.warn("snapshot failed", e);
    return null;
  }
}

async function getOrCreateFolder(parent, name) {
  try {
    const e = await parent.getEntry(name);
    if (e && e.isFolder) return e;
  } catch (e) { /* not there yet */ }
  return parent.createFolder(name);
}

async function tryGetEntry(folder, name) {
  if (!folder || !name) return null;
  try { return await folder.getEntry(name); } catch (e) { return null; }
}

// Turn a native path (as Photoshop reports it) into a file entry.
async function entryFromPath(p) {
  if (!p) return null;
  const fwd = p.replace(/\\/g, "/");
  const candidates = ["file:" + p, "file:" + fwd, "file:/" + fwd.replace(/^\/+/, ""), "file://" + fwd];
  for (const url of candidates) {
    try {
      const e = await lfs.getEntryWithUrl(url);
      if (e) return e;
    } catch (e) { /* try the next form */ }
  }
  return null;
}

async function readLessonFolder(folder) {
  const file = await folder.getEntry("lesson.json");
  const lesson = JSON.parse(await file.read());
  if (lesson.format !== FORMAT) throw new Error("That folder's lesson.json isn't a Lesson Recorder lesson.");
  return lesson;
}

function fontInstalled(font) {
  try {
    if (!app.fonts || !font) return null;
    if (font.postScriptName && app.fonts.getByName(font.postScriptName)) return true;
    for (const f of app.fonts) {
      if (f.postScriptName === font.postScriptName || f.name === font.name) return true;
    }
    return false;
  } catch (e) { return null; }
}

function checkResult(result) {
  const r = Array.isArray(result) ? result[0] : result;
  if (r && r._obj === "error") throw new Error(r.message || "Photoshop couldn't do that here.");
}

async function placeFile(entry) {
  const token = lfs.createSessionToken(entry);
  await core.executeAsModal(async () => {
    checkResult(await action.batchPlay([{
      _obj: "placeEvent",
      null: { _path: token, _kind: "local" },
      freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" },
      offset: { _obj: "offset", horizontal: { _unit: "pixelsUnit", _value: 0 }, vertical: { _unit: "pixelsUnit", _value: 0 } },
    }], {}));
  }, { commandName: "Place " + entry.name });
}

async function openFile(entry) {
  await core.executeAsModal(() => app.open(entry), { commandName: "Open " + entry.name });
}

// ---------------------------------------------------------------------------
// TEACH: recording
// ---------------------------------------------------------------------------

const teach = {
  lesson: newLesson(),
  recording: false,
  entries: new Map(),     // asset id → file entry picked in this session
  editFolder: null,       // lesson folder being edited, if any
  snapTimer: null,
  clearArmed: false,
};

function newLesson() {
  return { format: FORMAT, version: 1, id: uid(), title: "", createdAt: new Date().toISOString(), document: null, assets: [], steps: [] };
}

function uniqueAssetFile(name) {
  const taken = new Set(teach.lesson.assets.map((a) => (a.file || "").toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i++) if (!taken.has((stem + "-" + i + ext).toLowerCase())) return stem + "-" + i + ext;
}

function addFileAsset(path, entry, role) {
  const existing = teach.lesson.assets.find((a) => a.kind === "file" && path && a.sourcePath === path);
  if (existing) return existing;
  const name = entry ? entry.name : S.basename(path);
  const asset = { id: uid(), kind: "file", role: role || "", name, file: uniqueAssetFile(name), sourcePath: path || "" };
  teach.lesson.assets.push(asset);
  if (entry) teach.entries.set(asset.id, entry);
  return asset;
}

function addFontAsset(font) {
  const found = teach.lesson.assets.find((a) => a.kind === "font" && a.postScriptName === font.postScriptName);
  if (found) return found;
  const asset = { id: uid(), kind: "font", name: font.name, postScriptName: font.postScriptName };
  teach.lesson.assets.push(asset);
  return asset;
}

function scheduleSnapshot(step) {
  clearTimeout(teach.snapTimer);
  teach.snapTimer = setTimeout(async () => {
    const snap = await captureSnapshot();
    if (snap) { step.snapshot = snap; renderTeach(); autosave(); }
  }, 700);
}

async function startRecording() {
  const doc = activeDoc();
  if (!doc) { setRecStatus("Open or create a document first.", false); return; }
  teach.recording = true;
  const L = teach.lesson;
  if (!L.document) {
    L.document = { name: doc.title || doc.name || "", width: doc.width, height: doc.height, resolution: doc.resolution };
  }
  if (L.steps.length === 0) {
    // Step 1 is always "get the starting document ready".
    let path = "";
    try { path = doc.path || ""; } catch (e) { /* unsaved */ }
    const step = { id: uid(), recordedAt: Date.now(), required: true, note: "", layerName: "" };
    if (path) {
      const asset = addFileAsset(path, null, "starter");
      Object.assign(step, { event: "open", descriptor: { null: { _path: path, _kind: "local" } }, title: "Open “" + asset.name + "”", assetId: asset.id, assetFile: asset.file });
    } else {
      Object.assign(step, {
        event: "make", special: "newDocument",
        descriptor: { new: { _class: "document", width: doc.width, height: doc.height, resolution: doc.resolution } },
        title: "Create a new document " + doc.width + " × " + doc.height + " px at " + doc.resolution + " ppi",
      });
    }
    step.snapshot = await captureSnapshot();
    L.steps.push(step);
  }
  renderTeach();
  autosave();
}

function stopRecording() {
  teach.recording = false;
  renderTeach();
  autosave();
}

function recordEvent(event, d) {
  if (!S.shouldRecord(event, d)) return;
  const steps = teach.lesson.steps;
  const now = Date.now();
  const prev = steps[steps.length - 1];
  if (S.canMerge(prev, event, d, now)) {
    prev.descriptor = clone(d);
    prev.recordedAt = now;
    if (!prev.titleEdited) prev.title = S.describe(event, d);
    scheduleSnapshot(prev);
    renderTeach();
    return;
  }
  const step = {
    id: uid(), event, descriptor: clone(d), title: S.describe(event, d), note: "",
    required: true, layerName: currentLayerName(), recordedAt: now,
  };
  const path = S.filePathIn(event, d);
  if (path) {
    const asset = addFileAsset(path, null, "");
    step.assetId = asset.id;
    step.assetFile = asset.file;
  }
  const fonts = S.fontsIn(d);
  if (fonts.length) step.fontIds = fonts.map((f) => addFontAsset(f).id);
  steps.push(step);
  scheduleSnapshot(step);
  renderTeach();
  autosave();
}

async function addManualStep() {
  const step = {
    id: uid(), manual: true, title: "Do this by hand (describe it here)", titleEdited: false,
    note: "", required: true, layerName: currentLayerName(), recordedAt: Date.now(),
    snapshot: await captureSnapshot(),
  };
  teach.lesson.steps.push(step);
  renderTeach();
  autosave();
}

async function addAssetFiles() {
  const picked = await lfs.getFileForOpening({ allowMultiple: true });
  const list = Array.isArray(picked) ? picked : picked ? [picked] : [];
  for (const entry of list) addFileAsset(entry.nativePath || "", entry, "extra");
  renderTeach();
  autosave();
}

async function saveLesson() {
  const L = teach.lesson;
  L.title = $("lessonTitle").value.trim() || L.title || "Untitled lesson";
  if (!L.steps.length) { setSaveStatus("Record some steps first."); return; }
  const folder = await lfs.getFolder();
  if (!folder) return;
  setSaveStatus("Saving…");
  const assetsFolder = await getOrCreateFolder(folder, "assets");
  const editAssets = teach.editFolder ? await tryGetEntry(teach.editFolder, "assets") : null;
  const missing = [];
  for (const a of L.assets) {
    if (a.kind !== "file") continue;
    const src = teach.entries.get(a.id) || (await tryGetEntry(editAssets, a.file)) || (await entryFromPath(a.sourcePath));
    if (!src) { missing.push(a.name); continue; }
    try {
      const data = await src.read({ format: formats.binary });
      const dest = await assetsFolder.createFile(a.file, { overwrite: true });
      await dest.write(data, { format: formats.binary });
    } catch (e) {
      missing.push(a.name);
    }
  }
  const out = clone(L);
  out.savedAt = new Date().toISOString();
  out.assets.forEach((a) => { delete a.sourcePath; });   // don't leak teacher's folder paths
  out.steps.forEach((s) => { delete s.titleEdited; });
  const file = await folder.createFile("lesson.json", { overwrite: true });
  await file.write(JSON.stringify(out, null, 1));
  teach.editFolder = folder;
  let msg = "✅ Saved to “" + folder.name + "”. Give students this whole folder.";
  if (missing.length) msg += " ⚠ Couldn't copy: " + missing.join(", ") + " — use “Add asset file” to add them, then save again.";
  setSaveStatus(msg);
}

async function openLessonForEdit() {
  const folder = await lfs.getFolder();
  if (!folder) return;
  try {
    teach.lesson = await readLessonFolder(folder);
    teach.editFolder = folder;
    teach.entries.clear();
    $("lessonTitle").value = teach.lesson.title || "";
    setSaveStatus("Editing “" + folder.name + "”. Press Start to add more steps.");
    renderTeach();
    autosave();
  } catch (e) {
    setSaveStatus("⚠ " + e.message);
  }
}

function clearLesson() {
  if (!teach.clearArmed) {
    teach.clearArmed = true;
    $("btnClear").textContent = "Click again to clear";
    setTimeout(() => { teach.clearArmed = false; $("btnClear").textContent = "Clear"; }, 3000);
    return;
  }
  teach.clearArmed = false;
  $("btnClear").textContent = "Clear";
  teach.recording = false;
  teach.lesson = newLesson();
  teach.entries.clear();
  teach.editFolder = null;
  $("lessonTitle").value = "";
  setSaveStatus("");
  renderTeach();
  autosave();
}

function autosave() {
  try { localStorage.setItem("lr-draft", JSON.stringify(teach.lesson)); } catch (e) { /* too big — fine, it's only a draft */ }
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem("lr-draft");
    if (raw) {
      const L = JSON.parse(raw);
      if (L && L.format === FORMAT) teach.lesson = L;
    }
  } catch (e) { /* ignore */ }
  $("lessonTitle").value = teach.lesson.title || "";
}

function setRecStatus(text, recording) {
  const el = $("recStatus");
  el.textContent = text;
  el.className = "status" + (recording ? " recording" : "");
}

function setSaveStatus(text) { $("saveStatus").textContent = text; }

function renderTeach() {
  const L = teach.lesson;
  $("btnRecord").textContent = teach.recording ? "■ Stop recording" : (L.steps.length ? "● Resume recording" : "● Start recording");
  $("btnRecord").setAttribute("variant", teach.recording ? "warning" : "cta");
  if (teach.recording) setRecStatus("● RECORDING — work normally. Each action becomes a step.", true);
  else if (L.steps.length) setRecStatus("Paused. Edit titles and notes below, then Save.", false);

  // assets
  $("assetCount").textContent = L.assets.length ? "(" + L.assets.length + ")" : "";
  const al = $("assetList");
  al.innerHTML = L.assets.length ? "" : '<div class="muted small">Images you place or open, and fonts you type with, show up here automatically.</div>';
  L.assets.forEach((a) => {
    const row = document.createElement("div");
    row.className = "asset";
    const icon = a.kind === "font" ? "🔤" : a.role === "starter" ? "🖼" : "📄";
    row.innerHTML = '<span class="asset-name">' + icon + " " + esc(a.name) + (a.kind === "font" ? ' <span class="muted small">(students need this font installed)</span>' : "") + '</span><span class="x" title="Remove">✕</span>';
    row.querySelector(".x").addEventListener("click", () => {
      L.assets = L.assets.filter((x) => x.id !== a.id);
      renderTeach();
      autosave();
    });
    al.appendChild(row);
  });

  // steps
  $("stepCount").textContent = L.steps.length ? "(" + L.steps.length + ")" : "";
  const list = $("stepList");
  list.innerHTML = "";
  L.steps.forEach((s, i) => {
    const card = document.createElement("div");
    card.className = "step";
    card.innerHTML =
      '<div class="step-head"><span class="num">' + (i + 1) + "</span>" +
      '<span class="ev">' + esc(s.manual ? "manual step" : s.event) + (s.layerName ? " · " + esc(s.layerName) : "") + "</span>" +
      '<span class="ctl up" title="Move up">▲</span><span class="ctl down" title="Move down">▼</span>' +
      '<span class="ctl snap" title="Retake snapshot from the current canvas">📷</span><span class="ctl del" title="Delete step">✕</span></div>' +
      '<div class="step-body">' + (s.snapshot ? '<img src="' + s.snapshot + '" />' : "") +
      '<div class="step-fields"><input class="t" type="text" /><textarea class="n" placeholder="Tip for students (optional)"></textarea>' +
      '<div class="step-flags"><label><input class="r" type="checkbox" /> Must do</label></div></div></div>';
    const t = card.querySelector(".t"), n = card.querySelector(".n"), r = card.querySelector(".r");
    t.value = s.title || "";
    n.value = s.note || "";
    r.checked = s.required !== false;
    t.addEventListener("input", () => { s.title = t.value; s.titleEdited = true; autosave(); });
    n.addEventListener("input", () => { s.note = n.value; autosave(); });
    r.addEventListener("change", () => { s.required = r.checked; autosave(); });
    const move = (delta) => {
      const j = i + delta;
      if (j < 0 || j >= L.steps.length) return;
      [L.steps[i], L.steps[j]] = [L.steps[j], L.steps[i]];
      renderTeach();
      autosave();
    };
    card.querySelector(".up").addEventListener("click", () => move(-1));
    card.querySelector(".down").addEventListener("click", () => move(1));
    card.querySelector(".del").addEventListener("click", () => { L.steps.splice(i, 1); renderTeach(); autosave(); });
    card.querySelector(".snap").addEventListener("click", async () => {
      const snap = await captureSnapshot();
      if (snap) { s.snapshot = snap; renderTeach(); autosave(); }
    });
    list.appendChild(card);
  });
  if (!L.steps.length) list.innerHTML = '<div class="muted small">No steps yet.</div>';
}

// ---------------------------------------------------------------------------
// LEARN: following a lesson
// ---------------------------------------------------------------------------

const learn = {
  lesson: null,
  folder: null,
  assetsFolder: null,
  index: 0,
  status: {},           // step id → "done" | "shown" | "skipped"
  advanceTimer: null,
};

const progressKey = () => "lr-progress:" + learn.lesson.id;

function saveProgress() {
  try { localStorage.setItem(progressKey(), JSON.stringify({ index: learn.index, status: learn.status })); } catch (e) { /* ignore */ }
  reportProgress();
}

// Hook for the teacher dashboard (coming next): everything it needs is here.
function reportProgress() {
  // { lessonId, lessonTitle, index, total, status } will be sent to the dashboard server.
}

async function openLesson() {
  const folder = await lfs.getFolder();
  if (!folder) return;
  try {
    learn.lesson = await readLessonFolder(folder);
    learn.folder = folder;
    learn.assetsFolder = await tryGetEntry(folder, "assets");
    learn.index = 0;
    learn.status = {};
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey()) || "null");
      if (saved) { learn.index = saved.index || 0; learn.status = saved.status || {}; }
    } catch (e) { /* fresh start */ }
    renderLearn();
  } catch (e) {
    $("learnEmpty").textContent = "⚠ " + e.message;
  }
}

const curStep = () => (learn.lesson ? learn.lesson.steps[learn.index] : null);
const assetById = (id) => learn.lesson.assets.find((a) => a.id === id);

async function assetEntry(asset) {
  return asset && asset.file ? tryGetEntry(learn.assetsFolder, asset.file) : null;
}

function setFeedback(text, good) {
  const el = $("feedback");
  el.textContent = text || "";
  el.className = "feedback" + (good ? " good" : "");
}

function markStep(status, message) {
  const step = curStep();
  if (!step) return;
  learn.status[step.id] = status;
  saveProgress();
  renderLearn();
  setFeedback(message, true);
  clearTimeout(learn.advanceTimer);
  learn.advanceTimer = setTimeout(() => goTo(learn.index + 1), 1300);
}

function goTo(i) {
  clearTimeout(learn.advanceTimer);
  learn.index = Math.max(0, Math.min(i, learn.lesson.steps.length));
  saveProgress();
  renderLearn();
}

function checkStudentEvent(event, d) {
  const step = curStep();
  if (!step || learn.status[step.id] === "done" || learn.status[step.id] === "shown") return;
  if (S.matches(step, event, d)) markStep("done", "✅ Nice! That's it.");
}

async function showMe() {
  const step = curStep();
  if (!step || step.manual) return;
  setFeedback("Doing it for you…");
  try {
    await quietly(async () => {
      if (step.special === "newDocument") {
        const n = step.descriptor.new;
        await core.executeAsModal(() => app.documents.add({ width: n.width, height: n.height, resolution: n.resolution, mode: "RGBColorMode", fill: "white" }), { commandName: "New document" });
      } else if (step.event === "open" || step.event === "placeEvent") {
        const entry = await assetEntry(assetById(step.assetId));
        if (!entry) throw new Error("The file for this step is missing from the lesson's assets folder.");
        if (step.event === "open") await openFile(entry); else await placeFile(entry);
      } else {
        const desc = S.sanitizeForReplay(step.descriptor);
        desc._obj = step.event;
        await core.executeAsModal(async () => checkResult(await action.batchPlay([desc], {})), { commandName: "Show me: " + step.title });
      }
    });
    markStep("shown", "👀 Done for you — look at what changed, then keep going.");
  } catch (e) {
    setFeedback("Couldn't do this one automatically (" + (e.message || e) + "). Try it yourself, then press “I did it”.");
  }
}

function renderLearn() {
  const L = learn.lesson;
  $("learnEmpty").classList.toggle("hidden", !!L);
  $("learnBody").classList.toggle("hidden", !L);
  if (!L) return;

  const total = L.steps.length;
  const finished = L.steps.filter((s) => learn.status[s.id]).length;
  $("lessonHeading").textContent = L.title || "Lesson";
  $("progressFill").style.width = Math.round((finished / Math.max(1, total)) * 100) + "%";
  $("progressText").textContent = finished + " of " + total + " steps";

  const step = curStep();
  $("stepCard").classList.toggle("hidden", !step);
  $("doneCard").classList.toggle("hidden", !!step);

  if (step) {
    $("curNumber").textContent = "STEP " + (learn.index + 1) + " OF " + total + (step.required === false ? " · OPTIONAL" : "");
    $("curTitle").textContent = step.title;
    $("curLayer").textContent = step.layerName ? "On layer: " + step.layerName : "";
    $("curNote").textContent = step.note || "";
    $("curImageWrap").classList.toggle("hidden", !step.snapshot);
    if (step.snapshot) $("curImage").src = step.snapshot;

    const st = learn.status[step.id];
    if (st === "done") setFeedback("✅ Done!", true);
    else if (st === "shown") setFeedback("👀 Shown for you.", true);
    else if (step.manual) setFeedback("Do this by hand, then press “I did it”.");
    else setFeedback("Waiting for you to do this in Photoshop…");

    if (step.manual) $("btnShowMe").setAttribute("disabled", "true"); else $("btnShowMe").removeAttribute("disabled");
    if (learn.index === 0) $("btnBack").setAttribute("disabled", "true"); else $("btnBack").removeAttribute("disabled");
    renderStepAssets(step);
  } else {
    const count = (k) => L.steps.filter((s) => learn.status[s.id] === k).length;
    $("doneStats").textContent = "You did " + count("done") + " steps yourself" +
      (count("shown") ? ", " + count("shown") + " shown for you" : "") +
      (count("skipped") ? ", " + count("skipped") + " skipped" : "") + ".";
  }

  const ov = $("overview");
  ov.innerHTML = "";
  L.steps.forEach((s, i) => {
    const st = learn.status[s.id];
    const row = document.createElement("div");
    row.className = "ov" + (i === learn.index ? " here" : "") + (st === "done" || st === "shown" ? " complete" : "") + (st === "skipped" ? " skipped" : "");
    const mark = st === "done" ? "✓" : st === "shown" ? "👀" : st === "skipped" ? "–" : i === learn.index ? "▶" : "";
    row.innerHTML = '<span class="mark">' + mark + "</span><span>" + (i + 1) + ". " + esc(s.title) + "</span>";
    row.addEventListener("click", () => goTo(i));
    ov.appendChild(row);
  });
}

function renderStepAssets(step) {
  const box = $("curAssets");
  box.innerHTML = "";
  const asset = step.assetId && assetById(step.assetId);
  if (asset && asset.kind === "file") {
    const row = document.createElement("div");
    row.className = "asset-btn";
    const label = step.event === "open" ? "🖼 Open " : "📄 Place ";
    row.innerHTML = '<sp-button variant="secondary">' + esc(label + asset.name) + "</sp-button>";
    row.querySelector("sp-button").addEventListener("click", async () => {
      const entry = await assetEntry(asset);
      if (!entry) { setFeedback("⚠ " + asset.name + " is missing from the lesson's assets folder."); return; }
      try {
        // Not "quiet": the resulting Photoshop event completes the step on its own.
        if (step.event === "open") await openFile(entry); else await placeFile(entry);
      } catch (e) { setFeedback("⚠ " + (e.message || e)); }
    });
    box.appendChild(row);
  }
  (step.fontIds || []).map(assetById).filter(Boolean).forEach((font) => {
    const ok = fontInstalled(font);
    const row = document.createElement("div");
    row.className = "small " + (ok === false ? "font-missing" : "font-ok");
    row.textContent = "🔤 Font: " + font.name + (ok === false ? " — not installed! Install it from the lesson folder first." : ok ? " ✓ installed" : "");
    box.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function onPsEvent(event, descriptor) {
  if (suppress > 0) return;
  try {
    if (teach.recording) recordEvent(event, descriptor);
    else if (learn.lesson && !$("learnView").classList.contains("hidden")) checkStudentEvent(event, descriptor);
  } catch (e) {
    console.error("event handling failed", event, e);
  }
}

function showTab(which) {
  $("tabTeach").classList.toggle("active", which === "teach");
  $("tabLearn").classList.toggle("active", which === "learn");
  $("teachView").classList.toggle("hidden", which !== "teach");
  $("learnView").classList.toggle("hidden", which !== "learn");
}

function init() {
  $("tabTeach").addEventListener("click", () => showTab("teach"));
  $("tabLearn").addEventListener("click", () => {
    if (teach.recording) stopRecording();   // don't record a student test-run
    showTab("learn");
  });

  $("lessonTitle").addEventListener("input", () => { teach.lesson.title = $("lessonTitle").value; autosave(); });
  $("btnRecord").addEventListener("click", () => (teach.recording ? stopRecording() : startRecording()));
  $("btnManual").addEventListener("click", addManualStep);
  $("btnAddAsset").addEventListener("click", addAssetFiles);
  $("btnSave").addEventListener("click", () => saveLesson().catch((e) => setSaveStatus("⚠ Save failed: " + e.message)));
  $("btnOpenEdit").addEventListener("click", openLessonForEdit);
  $("btnClear").addEventListener("click", clearLesson);

  $("btnOpenLesson").addEventListener("click", openLesson);
  $("btnShowMe").addEventListener("click", showMe);
  $("btnDidIt").addEventListener("click", () => markStep("done", "✅ Great — next step!"));
  $("btnSkip").addEventListener("click", () => {
    const s = curStep();
    if (s && !learn.status[s.id]) { learn.status[s.id] = "skipped"; }
    goTo(learn.index + 1);
  });
  $("btnBack").addEventListener("click", () => goTo(learn.index - 1));
  $("btnRestart").addEventListener("click", () => { learn.status = {}; goTo(0); });

  restoreDraft();
  renderTeach();

  action.addNotificationListener(["all"], onPsEvent).catch((e) => {
    setRecStatus("⚠ Couldn't listen to Photoshop events: " + e.message, false);
  });
}

uxp.entrypoints.setup({
  panels: {
    lessonPanel: {
      show() { /* panel shown */ },
    },
  },
});

init();

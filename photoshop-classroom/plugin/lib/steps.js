// Pure step logic: turning Photoshop action events into lesson steps,
// describing them in plain English, and checking whether a student's
// action matches a teacher's step. No Photoshop APIs in here, so it can
// be unit-tested with plain Node.

// Events Photoshop fires constantly that are never meaningful lesson steps.
const IGNORED_EVENTS = new Set([
  "historyStateChanged", "toolModalStateChanged", "modalStateChanged",
  "invokeCommand", "hostFocusChanged", "layersFiltered", "convertJSONdescriptor",
  "get", "newDocumentViewCreated", "closeViewlessDocument", "featureTracking",
  "generatorDocActivated", "generatorTrack", "jsonAction", "sendJSONToNetworkClient",
  "nglProfileChanged", "backgroundSaveCompleted", "save", "close", "selectNoLayers",
  "sendDocumentThumbnailToNetworkClient", "sendLayerThumbnailToNetworkClient",
  "historyStateChange", "toggleSearch", "autoCutout", "contentAwareFillInvoke",
  "layerSelectionChanged", "documentChanged", "smartBrushWorkspace",
  "copyToClipboard",
]);

const ADJUSTMENT_NAMES = {
  brightnessEvent: "Brightness/Contrast", levels: "Levels", curves: "Curves",
  exposure: "Exposure", vibrance: "Vibrance", hueSaturation: "Hue/Saturation",
  colorBalance: "Color Balance", blackAndWhite: "Black & White",
  photoFilter: "Photo Filter", channelMixer: "Channel Mixer",
  colorLookup: "Color Lookup", invert: "Invert", posterization: "Posterize",
  thresholdClassEvent: "Threshold", gradientMapClass: "Gradient Map",
  selectiveColor: "Selective Color", solidColorLayer: "Solid Color fill",
  gradientLayer: "Gradient fill", patternLayer: "Pattern fill",
};

const LAYER_EFFECT_NAMES = {
  dropShadow: "Drop Shadow", innerShadow: "Inner Shadow", outerGlow: "Outer Glow",
  innerGlow: "Inner Glow", bevelEmboss: "Bevel & Emboss", chromeFX: "Satin",
  solidFill: "Color Overlay", gradientFill: "Gradient Overlay",
  patternFill: "Pattern Overlay", frameFX: "Stroke",
};

const EVENT_NAMES = {
  duplicate: "Duplicate the layer",
  copyToLayer: "Duplicate the layer (Ctrl/Cmd + J)",
  delete: "Delete the layer",
  hide: "Hide the layer",
  show: "Show the layer",
  rasterizeLayer: "Rasterize the layer",
  newPlacedLayer: "Convert to a Smart Object",
  placedLayerEditContents: "Edit the Smart Object contents",
  mergeLayersNew: "Merge the layers",
  mergeVisible: "Merge visible layers",
  flattenImage: "Flatten the image",
  groupEvent: "Create a clipping mask",
  ungroup: "Release the clipping mask",
  inverse: "Invert the selection",
  fill: "Fill",
  crop: "Crop the image",
  canvasSize: "Change the canvas size",
  imageSize: "Change the image size",
  transform: "Transform (scale / rotate) the layer",
  flip: "Flip the layer",
  copyEvent: "Copy",
  paste: "Paste",
  cut: "Cut",
  copyMerged: "Copy merged",
  autoCutout: "Select the subject",
  removeBackground: "Remove the background",
  feather: "Feather the selection",
  expand: "Expand the selection",
  contract: "Contract the selection",
  "smoothness": "Smooth the selection",
  stampVisible: "Stamp visible layers into a new layer",
};

// Tool ids (from `select` events) → friendly names.
const TOOL_NAMES = {
  moveTool: "Move", marqueeRectTool: "Rectangular Marquee", marqueeEllipTool: "Elliptical Marquee",
  lassoTool: "Lasso", polySelTool: "Polygonal Lasso", magneticLassoTool: "Magnetic Lasso",
  quickSelectTool: "Quick Selection", magicWandTool: "Magic Wand", magicLassoTool: "Object Selection",
  cropTool: "Crop", eyedropperTool: "Eyedropper", spotHealingBrushTool: "Spot Healing Brush",
  magicStampTool: "Healing Brush", patchSelection: "Patch", paintbrushTool: "Brush",
  pencilTool: "Pencil", cloneStampTool: "Clone Stamp", historyBrushTool: "History Brush",
  eraserTool: "Eraser", gradientTool: "Gradient", bucketTool: "Paint Bucket",
  blurTool: "Blur", sharpenTool: "Sharpen", smudgeTool: "Smudge", dodgeTool: "Dodge",
  burnTool: "Burn", saturationTool: "Sponge", penTool: "Pen", freeformPenTool: "Freeform Pen",
  typeCreateOrEditTool: "Horizontal Type", typeVerticalCreateOrEditTool: "Vertical Type",
  pathComponentSelectTool: "Path Selection", directSelectTool: "Direct Selection",
  rectangleTool: "Rectangle", ellipseTool: "Ellipse", polygonTool: "Polygon",
  lineTool: "Line", customShapeTool: "Custom Shape", handTool: "Hand", zoomTool: "Zoom",
  colorReplacementBrushTool: "Color Replacement", mixerBrushTool: "Mixer Brush",
};

// Different ways of doing the same thing count as the same step.
const EVENT_ALIASES = { copyToLayer: "duplicate", nudge: "move" };
const canon = (event) => EVENT_ALIASES[event] || event;

const MERGEABLE_EVENTS = new Set(["set", "move", "transform", "nudge"]);

// "gaussianBlur" → "Gaussian Blur"
function humanize(name) {
  if (!name) return "";
  const spaced = String(name)
    .replace(/Event$|Class$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function basename(p) {
  if (!p || typeof p !== "string") return "";
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1];
}

function firstTarget(d) {
  const t = d && d._target;
  if (!t) return null;
  return Array.isArray(t) ? t[0] || null : t;
}

function targetRef(d) {
  const r = firstTarget(d);
  if (!r) return "";
  return (r._ref || "") + (r._property ? "." + r._property : "");
}

function val(v) {
  if (v == null) return v;
  if (typeof v === "object" && "_value" in v) return v._value;
  return v;
}

function propKeys(obj) {
  if (!obj || typeof obj !== "object") return [];
  return Object.keys(obj).filter((k) => !k.startsWith("_")).sort();
}

function rgbToHex(c) {
  if (!c) return "";
  const r = val(c.red), g = val(c.grain != null ? c.grain : c.green), b = val(c.blue);
  if ([r, g, b].some((x) => typeof x !== "number")) return "";
  return "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function isToolSelect(event, d) {
  const r = firstTarget(d);
  return event === "select" && !!r && typeof r._ref === "string" && /Tool$|Selection$/.test(r._ref) && r._ref !== "layer";
}

// Should this event become a recorded step?
function shouldRecord(event, d) {
  if (!event || IGNORED_EVENTS.has(event)) return false;
  if (event === "select") {
    // Tool picks are useful steps; picking layers/documents/channels is navigation noise.
    return isToolSelect(event, d);
  }
  return true;
}

function describeSet(d) {
  const ref = targetRef(d);
  const to = d.to || {};
  if (ref === "channel.selection") {
    if (val(to) === "allEnum") return "Select all";
    if (val(to) === "none") return "Deselect";
    if (to._obj === "rectangle") return "Make a rectangular selection";
    if (to._obj === "ellipse") return "Make an elliptical selection";
    if (to._obj === "polygon") return "Make a lasso selection";
    return "Make a selection";
  }
  if (ref === "color.foregroundColor") {
    const hex = rgbToHex(to);
    return "Set the foreground color" + (hex ? " to " + hex : "");
  }
  if (ref === "color.backgroundColor") {
    const hex = rgbToHex(to);
    return "Set the background color" + (hex ? " to " + hex : "");
  }
  if (ref === "property.layerEffects" || to._obj === "layerEffects") {
    const fx = propKeys(to).filter((k) => LAYER_EFFECT_NAMES[k]).map((k) => LAYER_EFFECT_NAMES[k]);
    return fx.length ? "Add a layer style: " + fx.join(", ") : "Edit the layer style";
  }
  if (ref === "adjustmentLayer" || (to._obj && ADJUSTMENT_NAMES[to._obj])) {
    const name = ADJUSTMENT_NAMES[to._obj];
    return name ? "Adjust the " + name + " settings" : "Adjust the adjustment layer settings";
  }
  if (ref === "textLayer" || to._obj === "textLayer") {
    if (to.textKey != null) return "Edit the text to “" + String(val(to.textKey)).slice(0, 40) + "”";
    return "Edit the text settings";
  }
  if (ref === "layer" || to._obj === "layer") {
    const bits = [];
    if (to.opacity != null) bits.push("opacity to " + Math.round(val(to.opacity)) + "%");
    if (to.fillOpacity != null) bits.push("fill to " + Math.round(val(to.fillOpacity)) + "%");
    if (to.mode != null) bits.push("blend mode to " + humanize(val(to.mode)));
    if (to.name != null) return "Rename the layer to “" + val(to.name) + "”";
    if (to.color != null) return "Color-code the layer " + humanize(val(to.color));
    if (bits.length) return "Set the layer " + bits.join(" and ");
    return "Change the layer settings";
  }
  return "Change a setting" + (ref ? " (" + humanize(ref.split(".").pop()) + ")" : "");
}

function describeMake(d) {
  const ref = targetRef(d);
  const using = d.using || {};
  const newClass = d.new && (d.new._class || d.new._obj);
  if (newClass === "channel") return "Add a layer mask";
  if (newClass === "document") {
    const w = val(d.new.width), h = val(d.new.height);
    return "Create a new document" + (w && h ? " (" + w + " × " + h + ")" : "");
  }
  if (ref === "adjustmentLayer") {
    const t = using.type && using.type._obj;
    return "Add a " + (ADJUSTMENT_NAMES[t] || humanize(t) || "new") + " adjustment layer";
  }
  if (ref === "contentLayer") {
    const t = using.type && using.type._obj;
    if (ADJUSTMENT_NAMES[t]) return "Add a " + ADJUSTMENT_NAMES[t] + " layer";
    return "Draw a shape";
  }
  if (ref === "textLayer") {
    const text = val(using.textKey);
    return text ? "Add text: “" + String(text).slice(0, 40) + "”" : "Add a text layer";
  }
  if (ref === "layerSection") return "Group the layers";
  if (ref === "layer") return "Create a new layer";
  if (ref === "channel") return "Create a new channel";
  return "Create a " + (humanize(ref) || "new item");
}

// Plain-English title for an event.
function describe(event, d) {
  d = d || {};
  if (event === "make") return describeMake(d);
  if (event === "set") return describeSet(d);
  if (event === "select" && isToolSelect(event, d)) {
    const ref = firstTarget(d)._ref;
    return "Pick the " + (TOOL_NAMES[ref] || humanize(ref.replace(/Tool$/, ""))) + " tool";
  }
  if (event === "placeEvent") return "Place “" + (basename(d.null && d.null._path) || "an image") + "”";
  if (event === "open") return "Open “" + (basename(d.null && d.null._path) || "the file") + "”";
  if (event === "move") {
    if (d.to && d.to._obj === "offset") return "Move the layer";
    return "Reorder the layer in the Layers panel";
  }
  if (EVENT_NAMES[event]) return EVENT_NAMES[event];
  if (ADJUSTMENT_NAMES[event]) return "Apply " + ADJUSTMENT_NAMES[event] + " (directly on the pixels)";
  // Filters and everything else: e.g. gaussianBlur → "Apply Gaussian Blur (12 px)"
  const radius = d.radius != null ? val(d.radius) : null;
  return "Apply " + humanize(event) + (typeof radius === "number" ? " (" + radius + " px)" : "");
}

// A short fingerprint used to compare teacher and student actions.
function signature(event, d) {
  d = d || {};
  const parts = [canon(event), targetRef(d)];
  if (event === "make") {
    parts.push((d.new && (d.new._class || d.new._obj)) || "");
    parts.push((d.using && ((d.using.type && d.using.type._obj) || d.using._obj)) || "");
  } else if (event === "set") {
    const to = d.to || {};
    parts.push(to._obj || (typeof to._value === "string" ? "enum" : ""));
  } else if (event === "move") {
    parts.push(d.to && d.to._obj === "offset" ? "offset" : "order");
  }
  return parts.join("|");
}

// Does a student's action complete this step?
function matches(step, event, d) {
  if (!step || !step.event || step.manual) return false;
  d = d || {};
  if (signature(step.event, step.descriptor) !== signature(event, d)) return false;
  event = canon(event);
  if (event === "placeEvent" || event === "open") {
    const want = (step.assetFile || basename(step.descriptor && step.descriptor.null && step.descriptor.null._path)).toLowerCase();
    const got = basename(d.null && d.null._path).toLowerCase();
    return !want || want === got;
  }
  if (event === "set") {
    // The student must change at least the same properties the teacher did
    // (values can differ — the panel shows the teacher's numbers as a guide).
    const want = propKeys(step.descriptor && step.descriptor.to);
    const got = new Set(propKeys(d.to));
    return want.every((k) => got.has(k));
  }
  if (event === "select") {
    return targetRef(step.descriptor) === targetRef(d);
  }
  return true;
}

// Should a new event replace the previous step instead of adding a new one?
// (Dragging an opacity slider or nudging with arrow keys fires many events.)
function canMerge(prevStep, event, d, now, windowMs) {
  if (!prevStep || prevStep.manual || !MERGEABLE_EVENTS.has(event)) return false;
  if (prevStep.event !== event) return false;
  if ((now || 0) - (prevStep.recordedAt || 0) > (windowMs || 4000)) return false;
  if (signature(event, d) !== signature(prevStep.event, prevStep.descriptor)) return false;
  if (event === "set") {
    return propKeys(prevStep.descriptor && prevStep.descriptor.to).join(",") === propKeys(d && d.to).join(",");
  }
  return true;
}

const STRIP_KEYS = new Set(["_isCommand", "documentID", "layerID", "ID", "_options", "historyStateInfo"]);

// Make a teacher's recorded descriptor safe to replay in a student's document:
// layer/document ids differ between files, so point references at "the current one".
function sanitizeForReplay(desc) {
  const walk = (node, key) => {
    if (Array.isArray(node)) return node.map((n) => walk(n, key));
    if (!node || typeof node !== "object") return node;
    const out = {};
    for (const k of Object.keys(node)) {
      if (STRIP_KEYS.has(k)) continue;
      out[k] = walk(node[k], k);
    }
    if ((key === "_target" || key === "null") && out._ref && out._id != null) {
      delete out._id;
      out._enum = "ordinal";
      out._value = "targetEnum";
    }
    return out;
  };
  return walk(desc, "");
}

// Fonts used by a text-layer event, if any.
function fontsIn(d) {
  const fonts = new Set();
  const visit = (n) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    if (n._obj === "textStyle" && (n.fontPostScriptName || n.fontName)) {
      fonts.add(JSON.stringify({ postScriptName: n.fontPostScriptName || "", name: n.fontName || n.fontPostScriptName }));
    }
    Object.values(n).forEach(visit);
  };
  visit(d);
  return [...fonts].map((s) => JSON.parse(s));
}

// The file path an event brought into the document (place/open), if any.
function filePathIn(event, d) {
  if ((event === "placeEvent" || event === "open") && d && d.null && typeof d.null._path === "string") {
    return d.null._path;
  }
  return null;
}

module.exports = {
  IGNORED_EVENTS, humanize, basename, shouldRecord, describe, signature, matches,
  canMerge, sanitizeForReplay, fontsIn, filePathIn, rgbToHex,
};

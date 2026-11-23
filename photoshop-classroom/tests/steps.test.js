// Run with: node --test photoshop-classroom/tests
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../plugin/lib/steps.js");

const cur = [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }];

test("ignores noise and layer selection, keeps tool picks", () => {
  assert.equal(S.shouldRecord("historyStateChanged", {}), false);
  assert.equal(S.shouldRecord("select", { _target: [{ _ref: "layer", _name: "Background" }] }), false);
  assert.equal(S.shouldRecord("select", { _target: [{ _ref: "paintbrushTool" }] }), true);
  assert.equal(S.shouldRecord("gaussianBlur", { radius: { _unit: "pixelsUnit", _value: 12 } }), true);
});

test("describes common actions in plain English", () => {
  assert.equal(S.describe("make", { _target: [{ _ref: "adjustmentLayer" }], using: { _obj: "adjustmentLayer", type: { _obj: "hueSaturation" } } }), "Add a Hue/Saturation adjustment layer");
  assert.equal(S.describe("set", { _target: cur, to: { _obj: "layer", opacity: { _unit: "percentUnit", _value: 60 } } }), "Set the layer opacity to 60%");
  assert.equal(S.describe("set", { _target: cur, to: { _obj: "layer", mode: { _enum: "blendMode", _value: "softLight" } } }), "Set the layer blend mode to Soft Light");
  assert.equal(S.describe("gaussianBlur", { radius: { _unit: "pixelsUnit", _value: 12 } }), "Apply Gaussian Blur (12 px)");
  assert.equal(S.describe("select", { _target: [{ _ref: "paintbrushTool" }] }), "Pick the Brush tool");
  assert.equal(S.describe("placeEvent", { null: { _path: "C:\\Users\\T\\grunge.jpg", _kind: "local" } }), "Place “grunge.jpg”");
  assert.equal(S.describe("make", { new: { _class: "channel" }, at: { _ref: "channel", _enum: "channel", _value: "mask" } }), "Add a layer mask");
  assert.equal(S.describe("make", { _target: [{ _ref: "textLayer" }], using: { _obj: "textLayer", textKey: "HELLO" } }), "Add text: “HELLO”");
  assert.equal(S.describe("set", { _target: [{ _ref: "color", _property: "foregroundColor" }], to: { _obj: "RGBColor", red: 255, grain: 0, blue: 128 } }), "Set the foreground color to #FF0080");
});

test("matches a student action to the teacher's step", () => {
  const step = { event: "set", descriptor: { _target: cur, to: { _obj: "layer", opacity: { _value: 60 } } } };
  assert.ok(S.matches(step, "set", { _target: cur, to: { _obj: "layer", opacity: { _value: 45 } } }));
  assert.ok(!S.matches(step, "set", { _target: cur, to: { _obj: "layer", mode: { _value: "multiply" } } }));
  const adj = { event: "make", descriptor: { _target: [{ _ref: "adjustmentLayer" }], using: { type: { _obj: "curves" } } } };
  assert.ok(S.matches(adj, "make", { _target: [{ _ref: "adjustmentLayer" }], using: { type: { _obj: "curves" } } }));
  assert.ok(!S.matches(adj, "make", { _target: [{ _ref: "adjustmentLayer" }], using: { type: { _obj: "levels" } } }));
  const place = { event: "placeEvent", assetFile: "grunge.jpg", descriptor: { null: { _path: "/Users/t/Desktop/grunge.jpg" } } };
  assert.ok(S.matches(place, "placeEvent", { null: { _path: "/Users/kid/Lesson/assets/GRUNGE.jpg" } }));
  assert.ok(!S.matches(place, "placeEvent", { null: { _path: "/Users/kid/cat.png" } }));
  assert.ok(!S.matches({ manual: true, event: "set" }, "set", {}));
});

test("merges slider drags into one step", () => {
  const prev = { event: "set", recordedAt: 1000, descriptor: { _target: cur, to: { _obj: "layer", opacity: { _value: 80 } } } };
  assert.ok(S.canMerge(prev, "set", { _target: cur, to: { _obj: "layer", opacity: { _value: 60 } } }, 2000));
  assert.ok(!S.canMerge(prev, "set", { _target: cur, to: { _obj: "layer", opacity: { _value: 60 } } }, 9000));
  assert.ok(!S.canMerge(prev, "set", { _target: cur, to: { _obj: "layer", mode: { _value: "multiply" } } }, 2000));
});

test("sanitizes ids for replay", () => {
  const out = S.sanitizeForReplay({ _isCommand: true, documentID: 5, _target: [{ _ref: "layer", _id: 42 }], layerID: [42], to: { _obj: "layer" } });
  assert.deepEqual(out, { _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], to: { _obj: "layer" } });
});

test("finds fonts and file paths", () => {
  const d = { using: { textStyleRange: [{ textStyle: { _obj: "textStyle", fontPostScriptName: "BebasNeue-Regular", fontName: "Bebas Neue" } }] } };
  assert.deepEqual(S.fontsIn(d), [{ postScriptName: "BebasNeue-Regular", name: "Bebas Neue" }]);
  assert.equal(S.filePathIn("placeEvent", { null: { _path: "/a/b.png" } }), "/a/b.png");
  assert.equal(S.filePathIn("make", {}), null);
});

test("Ctrl+J counts as duplicating the layer", () => {
  const step = { event: "duplicate", descriptor: { _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] } };
  assert.ok(S.matches(step, "copyToLayer", { _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] }));
});

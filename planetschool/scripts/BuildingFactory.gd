class_name BuildingFactory
extends RefCounted
## Builds the 3D look of a room or object: its floor, modern furniture and
## equipment. Rooms have no walls of their own - players build walls (or use
## the optional auto-walls). Returned nodes carry metadata for PeopleView:
##   "seats"   Array of [Vector3 local pos, float facing deg]  (sit animation)
##   "spots"   Array of [Vector3, float]                       (stand / idle)
##   "staff"   [Vector3, float]                                (where staff stand)
##   "sport"   Rect2 local area for running laps, or null

const T := Models.TILE
const LH := Models.LEVEL_H

const ROOM_FLOORS := {
	"gymnasium": ["wood_floor", 0.3], "theater": ["wood_floor", 0.3], "music_room": ["wood_floor", 0.3],
	"library": ["white_oak_veneer", 0.3], "principal_office": ["white_oak_veneer", 0.3], "counselor_office": ["white_oak_veneer", 0.3],
	"staff_room": ["white_oak_veneer", 0.3], "math_room": ["white_oak_veneer", 0.3], "english_room": ["white_oak_veneer", 0.3],
	"history_room": ["white_oak_veneer", 0.3], "language_room": ["white_oak_veneer", 0.3],
	"restroom": ["long_white_tiles", 0.6], "pool": ["long_white_tiles", 0.5], "nurse_office": ["long_white_tiles", 0.6],
	"cafeteria": ["terrazzo_tiles", 0.35], "commons": ["smooth_concrete_floor", 0.25], "science_lab": ["smooth_concrete_floor", 0.25],
	"computer_lab": ["smooth_concrete_floor", 0.25], "robotics_lab": ["smooth_concrete_floor", 0.25], "art_studio": ["smooth_concrete_floor", 0.25],
	"student_lounge": ["white_oak_veneer", 0.3], "esports_arena": ["smooth_concrete_floor", 0.25], "weight_room": ["", 0],
}
const CONCRETE_TINT := Color(1.0, 1.08, 1.2)
const CHAIR_COLORS := [Color(0.95, 0.55, 0.15), Color(0.2, 0.55, 0.85), Color(0.35, 0.7, 0.4), Color(0.85, 0.25, 0.3), Color(0.98, 0.8, 0.2)]

static var _tex_cache := {}


## Where a room's node goes. Rooms are furnished in their unrotated frame
## ([0, w] x [0, h] from Data size) and turned in quarter steps onto their footprint.
static func root_transform(id: String, rot: int, pos: Vector2i, level: int) -> Transform3D:
	var s: Vector2i = Data.BUILDINGS[id]["size"]
	var basis := Basis(Vector3.UP, -PI * 0.5 * rot)
	var lo := Vector3.ZERO
	for c in [Vector3(s.x * T, 0, 0), Vector3(0, 0, s.y * T), Vector3(s.x * T, 0, s.y * T)]:
		var r: Vector3 = basis * c
		lo = Vector3(minf(lo.x, r.x), 0, minf(lo.z, r.z))
	return Transform3D(basis, Vector3(pos.x * T, level * LH, pos.y * T) - lo)


static func build(b: Building) -> Node3D:
	var root := Node3D.new()
	root.name = "B%d" % b.uid
	root.transform = root_transform(b.id, b.rot, b.pos, b.level)
	var s: Vector2i = Data.BUILDINGS[b.id]["size"]
	var w := s.x * T
	var h := s.y * T
	root.set_meta("seats", [])
	root.set_meta("spots", [])
	root.set_meta("staff", [Vector3(w * 0.5, 0, h * 0.5), 0.0])
	root.set_meta("sport", null)
	if b.level > 0 and not b.is_connector() and not b.is_decor():
		Models.box(root, Vector3(w, 0.3, h), Vector3(w * 0.5, -0.16, h * 0.5), StructureView.slab_material())
	if ROOM_FLOORS.has(b.id):
		var f: Array = ROOM_FLOORS[b.id]
		if f[0] != "":
			var fl := Models.plane(root, Vector2(w, h), Vector3(w * 0.5, 0.075, h * 0.5), Models.pbr(f[0], f[1], CONCRETE_TINT if f[0] == "smooth_concrete_floor" else Color.WHITE))
			fl.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_furnish(root, b, w, h)
	if OS.has_feature("web"):
		Models.flatten(root)
		return root
	if b.size.x * b.size.y > 3 and not b.is_decor() and not b.is_connector():
		var sign := Label3D.new()
		sign.text = b.display_name()
		sign.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		sign.font_size = 40
		sign.outline_size = 10
		sign.pixel_size = 0.011
		sign.modulate = Color(1, 1, 1, 0.9)
		sign.position = Vector3(w * 0.5, 3.0, h * 0.5)
		sign.visibility_range_end = 60.0
		sign.name = "Sign"
		root.add_child(sign)
	return root


# ---------------------------------------------------------------------
#  Furniture meshes (procedural, cached). Front of every piece is -Z.
# ---------------------------------------------------------------------

static func _metal() -> Material:
	return Models.color_mat(Color(0.55, 0.57, 0.6), 0.35, 0.85)


static func _dark() -> Material:
	return Models.color_mat(Color(0.08, 0.08, 0.09), 0.3, 0.2)


static func _white() -> Material:
	return Models.color_mat(Color(0.93, 0.93, 0.92), 0.45)


static func _screen(c := Color(0.2, 0.45, 0.85)) -> Material:
	return Models.color_mat(c.darkened(0.6), 0.15, 0.0, c)


static func desk_mesh() -> ArrayMesh:
	return Models.kit_mesh("desk", func(k):
		k.box(_white(), Vector3(0, 0.73, 0), Vector3(0.95, 0.035, 0.55))
		for p in [Vector3(-0.42, 0, -0.22), Vector3(0.42, 0, -0.22), Vector3(-0.42, 0, 0.22), Vector3(0.42, 0, 0.22)]:
			k.cylinder(_metal(), p, 0.018, 0.72, 8)
		k.box(_metal(), Vector3(0, 0.6, -0.2), Vector3(0.85, 0.02, 0.02)))


static func chair_mesh(ci: int) -> ArrayMesh:
	var col: Color = CHAIR_COLORS[ci % CHAIR_COLORS.size()]
	return Models.kit_mesh("chair%d" % (ci % CHAIR_COLORS.size()), func(k):
		var plastic := Models.color_mat(col, 0.45)
		k.box(plastic, Vector3(0, 0.45, 0), Vector3(0.44, 0.04, 0.42))
		k.box(plastic, Vector3(0, 0.7, 0.2), Vector3(0.42, 0.34, 0.03))
		for p in [Vector3(-0.19, 0, -0.17), Vector3(0.19, 0, -0.17), Vector3(-0.19, 0, 0.17), Vector3(0.19, 0, 0.17)]:
			k.cylinder(_metal(), p, 0.014, 0.44, 6))


static func laptop_mesh() -> ArrayMesh:
	return Models.kit_mesh("laptop", func(k):
		var case_ := Models.color_mat(Color(0.25, 0.26, 0.28), 0.4, 0.5)
		k.box(case_, Vector3(0, 0.01, 0), Vector3(0.32, 0.02, 0.22))
		var xf := Transform3D(Basis(Vector3.RIGHT, deg_to_rad(-15)), Vector3(0, 0.12, -0.11))
		k.box(case_, Vector3(0, 0, 0), Vector3(0.32, 0.21, 0.012), xf)
		k.box(_screen(Color(0.5, 0.7, 1.0)), Vector3(0, 0, 0.008), Vector3(0.29, 0.18, 0.004), xf))


static func monitor_mesh() -> ArrayMesh:
	return Models.kit_mesh("monitor", func(k):
		k.box(_dark(), Vector3(0, 0.01, 0.05), Vector3(0.22, 0.02, 0.16))
		k.box(_dark(), Vector3(0, 0.15, 0.06), Vector3(0.04, 0.28, 0.03))
		k.box(_dark(), Vector3(0, 0.36, 0.02), Vector3(0.6, 0.36, 0.03))
		k.box(_screen(), Vector3(0, 0.36, 0.0), Vector3(0.56, 0.32, 0.01)))


static func smartboard_mesh() -> ArrayMesh:
	return Models.kit_mesh("smartboard", func(k):
		k.box(_dark(), Vector3(0, 0, 0), Vector3(2.3, 1.35, 0.07))
		k.box(_screen(Color(0.25, 0.55, 0.9)), Vector3(0, 0, 0.036), Vector3(2.15, 1.2, 0.01))
		k.box(_metal(), Vector3(0, -0.72, 0.05), Vector3(1.0, 0.04, 0.1)))


static func teacher_desk_mesh() -> ArrayMesh:
	return Models.kit_mesh("tdesk", func(k):
		var oak := Models.pbr("white_oak_veneer", 1.0)
		k.box(oak, Vector3(0, 0.74, 0), Vector3(1.6, 0.04, 0.75))
		k.box(_white(), Vector3(0, 0.4, -0.33), Vector3(1.5, 0.6, 0.03))
		for x in [-0.75, 0.75]:
			k.box(_metal(), Vector3(x, 0.37, 0), Vector3(0.04, 0.74, 0.7)))


static func lab_bench_mesh() -> ArrayMesh:
	return Models.kit_mesh("labbench", func(k):
		k.box(_white(), Vector3(0, 0.44, 0), Vector3(1.0, 0.86, 0.62))
		k.box(_dark(), Vector3(0, 0.9, 0), Vector3(1.08, 0.05, 0.7))
		k.cylinder(_metal(), Vector3(0.35, 0.92, -0.2), 0.015, 0.35, 8))


static func stool_mesh() -> ArrayMesh:
	return Models.kit_mesh("stool", func(k):
		k.cylinder(_dark(), Vector3(0, 0.62, 0), 0.18, 0.05, 12)
		k.cylinder(_metal(), Vector3(0, 0, 0), 0.025, 0.62, 8)
		k.cylinder(_metal(), Vector3(0, 0, 0), 0.2, 0.02, 12))


static func round_table_mesh() -> ArrayMesh:
	return Models.kit_mesh("rtable", func(k):
		k.cylinder(_white(), Vector3(0, 0.72, 0), 0.75, 0.04, 20)
		k.cylinder(_metal(), Vector3(0, 0, 0), 0.05, 0.72, 10)
		k.cylinder(_metal(), Vector3(0, 0, 0), 0.35, 0.03, 16))


static func bookshelf_mesh() -> ArrayMesh:
	return Models.kit_mesh("shelf", func(k):
		k.box(_white(), Vector3(0, 0.95, 0.17), Vector3(1.8, 1.9, 0.04))
		for x in [-0.9, 0.9]:
			k.box(_white(), Vector3(x, 0.95, 0), Vector3(0.04, 1.9, 0.38))
		var rng := RandomNumberGenerator.new()
		rng.seed = 31
		for i in 5:
			var y := 0.05 + i * 0.45
			k.box(_white(), Vector3(0, y, 0), Vector3(1.8, 0.03, 0.38))
			if i < 4:
				var x := -0.85
				while x < 0.82:
					var bw := rng.randf_range(0.04, 0.09)
					var bh := rng.randf_range(0.22, 0.36)
					k.box(Models.color_mat(Color.from_hsv(float(rng.randi() % 8) / 8.0, 0.55, 0.65), 0.8),
						Vector3(x + bw * 0.5, y + bh * 0.5 + 0.015, 0), Vector3(bw - 0.005, bh, 0.26))
					x += bw)


static func sofa_mesh(col: Color) -> ArrayMesh:
	return Models.kit_mesh("sofa%s" % col.to_html(), func(k):
		var fab := Models.color_mat(col, 0.95)
		k.box(fab, Vector3(0, 0.22, 0), Vector3(1.9, 0.28, 0.85))
		k.box(fab, Vector3(0, 0.6, 0.33), Vector3(1.9, 0.5, 0.2))
		for x in [-0.88, 0.88]:
			k.box(fab, Vector3(x, 0.4, 0), Vector3(0.16, 0.36, 0.85))
		k.box(fab, Vector3(-0.42, 0.4, -0.05), Vector3(0.8, 0.12, 0.7))
		k.box(fab, Vector3(0.42, 0.4, -0.05), Vector3(0.8, 0.12, 0.7)))


static func locker_mesh() -> ArrayMesh:
	return Models.kit_mesh("locker", func(k):
		var body := Models.color_mat(Color(0.18, 0.32, 0.62), 0.35, 0.6)
		k.box(body, Vector3(0, 0.95, 0), Vector3(0.48, 1.9, 0.5))
		k.box(_dark(), Vector3(0, 1.75, -0.252), Vector3(0.3, 0.02, 0.01))
		k.box(_dark(), Vector3(0, 1.6, -0.252), Vector3(0.3, 0.02, 0.01))
		k.box(_metal(), Vector3(0.17, 1.1, -0.26), Vector3(0.03, 0.12, 0.02)))


## Stepped stands; rows climb toward +Z, spectators face -Z.
static func bleacher_mesh(length: float, rows: int, seat_col: Color) -> ArrayMesh:
	return Models.kit_mesh("bleach%.1f_%d_%s" % [length, rows, seat_col.to_html()], func(k):
		var conc := Models.pbr("smooth_concrete_floor", 0.3, Color(0.8, 0.8, 0.8))
		var seat := Models.color_mat(seat_col, 0.5, 0.2)
		for r in rows:
			k.box(conc, Vector3(0, 0.25 * (r + 1), r * 0.8), Vector3(length, 0.5 * (r + 1), 0.8))
			k.box(seat, Vector3(0, 0.5 * (r + 1) + 0.03, r * 0.8 + 0.15), Vector3(length, 0.06, 0.35))
		k.box(_metal(), Vector3(0, 0.5 * rows + 1.0, rows * 0.8 - 0.35), Vector3(length, 0.05, 0.05)))


# ---------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------

static func _seat(root: Node3D, p: Vector3, facing: float) -> void:
	root.get_meta("seats").append([p, facing])


static func _spot(root: Node3D, p: Vector3, facing: float) -> void:
	root.get_meta("spots").append([p, facing])


## Look direction for a facing angle (0 = +Z, 180 = -Z).
static func _dir(facing: float) -> Vector3:
	return Vector3(sin(deg_to_rad(facing)), 0, cos(deg_to_rad(facing)))


## A chair (and optionally a desk in front of it) for one sitter.
static func _place_seat(root: Node3D, batch: Dictionary, p: Vector3, facing: float, ci: int, desk := "", extra := "") -> void:
	var rot := Basis(Vector3.UP, deg_to_rad(facing + 180.0))
	_batch(batch, chair_mesh(ci), Transform3D(rot, p))
	if desk != "":
		var dp := p + _dir(facing) * 0.5
		var dm: ArrayMesh = desk_mesh() if desk == "desk" else lab_bench_mesh()
		_batch(batch, dm, Transform3D(rot, dp))
		if extra == "laptop":
			_batch(batch, laptop_mesh(), Transform3D(rot, dp + Vector3(0, 0.75, 0)))
		elif extra == "monitor":
			_batch(batch, monitor_mesh(), Transform3D(rot, dp + Vector3(0, 0.75, 0) + _dir(facing) * 0.1))
	_seat(root, p, facing)


static func _batch(batch: Dictionary, mesh: Mesh, xf: Transform3D) -> void:
	if not batch.has(mesh):
		batch[mesh] = []
	batch[mesh].append(xf)


static func _flush(root: Node3D, batch: Dictionary) -> void:
	if batch.is_empty():
		return
	if OS.has_feature("web"):
		Models.merged(root, batch)
		return
	for mesh in batch:
		Models.multi(root, mesh, batch[mesh])


static func _front_wall(root: Node3D, batch: Dictionary, w: float) -> void:
	_batch(batch, smartboard_mesh(), Transform3D(Basis.IDENTITY, Vector3(w * 0.5, 1.55, 0.2)))
	_batch(batch, teacher_desk_mesh(), Transform3D(Basis(Vector3.UP, PI), Vector3(w * 0.5 + 1.6, 0, 1.2)))
	_batch(batch, monitor_mesh(), Transform3D(Basis(Vector3.UP, PI), Vector3(w * 0.5 + 1.6, 0.76, 1.3)))
	root.set_meta("staff", [Vector3(w * 0.5 - 0.5, 0, 1.0), 0.0])


## Rows of student seats facing the front wall (z = 0).
static func _rows(root: Node3D, batch: Dictionary, w: float, h: float, desk := "desk", extra := "laptop", spacing := 1.25) -> void:
	var i := 0
	var x := 0.9
	while x <= w - 0.8:
		var z := 2.5
		while z <= h - 0.6:
			_place_seat(root, batch, Vector3(x, 0, z), 180, i, desk, extra)
			i += 1
			z += spacing
		x += spacing


# ---------------------------------------------------------------------
#  Rooms
# ---------------------------------------------------------------------

static func _furnish(root: Node3D, b: Building, w: float, h: float) -> void:
	var batch := {}
	match b.id:
		"math_room", "english_room", "history_room", "language_room":
			_front_wall(root, batch, w)
			_rows(root, batch, w, h)
			_batch(batch, bookshelf_mesh(), Transform3D(Basis.IDENTITY, Vector3(w - 1.1, 0, h - 0.3)))
			Models.place_prop(root, "potted_plant_04", Vector3(0.45, 0, h - 0.45), 3.2)
			Models.place_prop(root, "wall_clock", Vector3(w * 0.5 - 2.0, 2.4, 0.15), 1.0, 0)
		"science_lab":
			_front_wall(root, batch, w)
			_rows(root, batch, w, h, "lab", "", 1.5)
			Models.place_prop(root, "industrial_microscope", Vector3(1.0, 0.93, 2.9), 1.0, 180)
			Models.place_prop(root, "chemistry_set", Vector3(w - 1.4, 0.93, 0.6), 1.0, 0)
			Models.box(root, Vector3(1.2, 2.2, 0.8), Vector3(w - 0.7, 1.1, h - 0.5), Models.color_mat(Color(0.85, 0.86, 0.88), 0.3, 0.5))
			Models.box(root, Vector3(1.0, 1.0, 0.05), Vector3(w - 0.7, 1.35, h - 0.92), Models.glass_mat())
		"computer_lab":
			_front_wall(root, batch, w)
			_rows(root, batch, w, h, "desk", "monitor", 1.3)
		"esports_arena":
			Models.box(root, Vector3(w * 0.7, 2.0, 0.1), Vector3(w * 0.5, 1.9, 0.2), _screen(Color(0.6, 0.3, 1.0)))
			Models.box(root, Vector3(w, 0.06, 0.06), Vector3(w * 0.5, 0.1, 0.2), Models.color_mat(Color.MAGENTA, 0.2, 0, Color(1, 0.2, 0.9)))
			root.set_meta("staff", [Vector3(w * 0.5, 0, 1.0), 0.0])
			_rows(root, batch, w, h, "desk", "monitor", 1.3)
		"robotics_lab":
			_front_wall(root, batch, w)
			_rows(root, batch, w, h, "lab", "laptop", 1.7)
			for i in 3:
				Models.box(root, Vector3(0.6, 0.7, 0.6), Vector3(0.8 + i * 1.2, 0.35, h - 0.5), Models.color_mat(Color(0.9, 0.9, 0.92), 0.4))
				Models.box(root, Vector3(0.5, 0.45, 0.5), Vector3(0.8 + i * 1.2, 0.95, h - 0.5), Models.glass_mat())
			Models.box(root, Vector3(1.0, 0.3, 0.8), Vector3(w * 0.5, 0.15, h * 0.6), Models.color_mat(Color(0.9, 0.4, 0.1), 0.4, 0.5))
		"art_studio":
			_front_wall(root, batch, w)
			var i := 0
			var z := 2.6
			while z < h - 0.8:
				var x := 1.4
				while x < w - 1.0:
					_batch(batch, round_table_mesh(), Transform3D(Basis.IDENTITY, Vector3(x, 0, z)))
					for a in [0.0, 120.0, 240.0]:
						_place_seat(root, batch, Vector3(x, 0, z) - _dir(a) * 0.95, a, i)
						i += 1
					x += 2.4
				z += 2.4
			for k in 3:
				Models.box(root, Vector3(0.7, 0.5, 0.03), Vector3(0.8 + k * 1.4, 1.5, h - 0.3), Models.color_mat(Color.from_hsv(k * 0.3, 0.6, 0.9), 0.9))
		"music_room":
			root.set_meta("staff", [Vector3(w * 0.5, 0, 1.0), 0.0])
			Models.box(root, Vector3(1.6, 1.0, 0.6), Vector3(1.2, 0.5, 0.6), Models.color_mat(Color(0.04, 0.04, 0.05), 0.15, 0.3))
			for dx in [-0.3, 0.0, 0.3]:
				Models.cylinder(root, 0.22, 0.35, Vector3(w - 1.2 + dx * 2, 0.4, 0.8), Models.color_mat(Color(0.8, 0.1, 0.1), 0.3, 0.4))
			var i := 0
			for ring in 4:
				var r := 2.0 + ring * 1.1
				for k in 9:
					var a := deg_to_rad(-64 + k * 16)
					var p := Vector3(w * 0.5 + sin(a) * r, 0, 0.9 + cos(a) * r)
					if p.x > 0.5 and p.x < w - 0.5 and p.z < h - 0.4:
						_place_seat(root, batch, p, rad_to_deg(atan2(-sin(a), -cos(a))), i)
						i += 1
		"gymnasium":
			Models.plane(root, Vector2(w - 2.0, h - 4.2), Vector3(w * 0.5, 0.06, h * 0.5 + 1.0), _court_mat("gym"))
			_hoop(root, Vector3(1.0, 0, h * 0.5 + 1.0), 90)
			_hoop(root, Vector3(w - 1.0, 0, h * 0.5 + 1.0), -90)
			_bleachers(root, batch, Vector3(w * 0.5, 0, 0.3), w - 2.0, 4, Color(0.15, 0.3, 0.65), true)
			Models.box(root, Vector3(4.0, 1.2, 0.05), Vector3(w * 0.5, 3.2, h - 0.12), Models.color_mat(Color(0.12, 0.2, 0.45), 0.8))
			root.set_meta("sport", Rect2(2, 4.0, w - 4, h - 5))
			root.set_meta("staff", [Vector3(w * 0.5, 0, h - 1.0), 180.0])
		"weight_room":
			Models.plane(root, Vector2(w, h), Vector3(w * 0.5, 0.06, h * 0.5), Models.color_mat(Color(0.12, 0.12, 0.13), 0.95))
			for i in 4:
				var x := 1.2 + i * 2.2
				if x > w - 1:
					break
				Models.box(root, Vector3(0.08, 2.2, 0.08), Vector3(x - 0.6, 1.1, 1.0), _metal())
				Models.box(root, Vector3(0.08, 2.2, 0.08), Vector3(x + 0.6, 1.1, 1.0), _metal())
				Models.box(root, Vector3(1.6, 0.04, 0.04), Vector3(x, 1.4, 1.0), _metal())
				for s in [-0.75, 0.75]:
					var plate := Models.cylinder(root, 0.22, 0.05, Vector3(x + s, 1.375, 1.0), _dark())
					plate.rotation.z = PI * 0.5
				Models.box(root, Vector3(0.35, 0.45, 1.2), Vector3(x, 0.22, 2.2), _dark())
				_spot(root, Vector3(x, 0, 2.2), 180)
			root.set_meta("sport", Rect2(1, h - 2.5, w - 2, 1.6))
		"pool":
			Models.box(root, Vector3(w - 3.0, 0.3, h - 3.4), Vector3(w * 0.5, 0.15, h * 0.5 + 0.6), Models.pbr("long_white_tiles", 0.8, Color(0.75, 0.9, 1.0)))
			var water := Models.plane(root, Vector2(w - 3.4, h - 3.8), Vector3(w * 0.5, 0.33, h * 0.5 + 0.6), _water_mat())
			water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			for i in range(1, 6):
				var z := 2.3 + (h - 3.8) * i / 6.0
				Models.box(root, Vector3(w - 3.4, 0.06, 0.06), Vector3(w * 0.5, 0.36, z), Models.color_mat(Color(0.9, 0.2, 0.2) if i % 2 else Color(0.2, 0.4, 0.9), 0.5))
			_bleachers(root, batch, Vector3(w * 0.5, 0, 0.2), w - 2.0, 2, Color(0.15, 0.3, 0.65), true)
			root.set_meta("sport", Rect2(2.0, 2.4, w - 4.0, h - 4.4))
			root.set_meta("staff", [Vector3(0.8, 0, h * 0.5), 90.0])
		"theater":
			Models.box(root, Vector3(w - 1.0, 0.9, 3.0), Vector3(w * 0.5, 0.45, 1.7), Models.pbr("wood_floor", 0.3, Color(0.55, 0.4, 0.3)))
			Models.box(root, Vector3(w - 1.0, 3.0, 0.15), Vector3(w * 0.5, 2.4, 0.3), Models.color_mat(Color(0.5, 0.04, 0.07), 0.95))
			Models.box(root, Vector3(w - 0.5, 0.1, 0.1), Vector3(w * 0.5, 3.6, 3.4), _dark())
			for i in 6:
				Models.box(root, Vector3(0.2, 0.25, 0.25), Vector3(1.0 + i * (w - 2.0) / 5.0, 3.45, 3.4), Models.color_mat(Color(0.9, 0.85, 0.6), 0.3, 0, Color(1, 0.9, 0.6)))
			root.set_meta("staff", [Vector3(w * 0.5, 0.9, 1.8), 0.0])
			var z := 4.0
			while z < h - 0.5:
				var x := 1.0
				while x < w - 0.8:
					_place_seat(root, batch, Vector3(x, 0, z), 180, 3)
					x += 0.8
				z += 1.0
		"cafeteria":
			var steel := Models.color_mat(Color(0.75, 0.77, 0.8), 0.25, 0.9)
			Models.box(root, Vector3(w - 2.0, 0.9, 0.7), Vector3(w * 0.5, 0.45, 1.3), steel)
			Models.box(root, Vector3(w - 2.0, 0.4, 0.03), Vector3(w * 0.5, 1.15, 1.1), Models.glass_mat())
			Models.box(root, Vector3(w - 1.0, 2.0, 0.5), Vector3(w * 0.5, 1.0, 0.3), steel)
			for i in 3:
				Models.box(root, Vector3(1.2, 0.7, 0.05), Vector3(2.0 + i * (w - 4.0) / 2.0, 2.6, 0.12), _screen(Color(0.95, 0.6, 0.2)))
			root.set_meta("staff", [Vector3(w * 0.5, 0, 0.7), 0.0])
			var i := 0
			var tz := 3.3
			while tz < h - 0.9:
				var tx := 1.6
				while tx < w - 1.2:
					_batch(batch, round_table_mesh(), Transform3D(Basis.IDENTITY, Vector3(tx, 0, tz)))
					for a in [0.0, 90.0, 180.0, 270.0]:
						_place_seat(root, batch, Vector3(tx, 0, tz) - _dir(a) * 0.95, a, i)
						i += 1
					tx += 2.6
				tz += 2.6
		"commons", "student_lounge":
			var z := 1.6
			while z < h - 1.2:
				var x := 1.6
				while x < w - 1.2:
					Models.place_prop(root, "modern_coffee_table_01", Vector3(x, 0, z), 1.2, 90)
					Models.place_prop(root, "mid_century_lounge_chair", Vector3(x - 1.1, 0, z), 1.0, 90)
					Models.place_prop(root, "modern_arm_chair_01", Vector3(x + 1.1, 0, z), 1.0, -90)
					_seat(root, Vector3(x - 1.1, 0, z), 90)
					_seat(root, Vector3(x + 1.1, 0, z), -90)
					x += 3.6
				z += 3.0
			if b.id == "commons":
				Models.box(root, Vector3(w - 2.0, 1.05, 0.6), Vector3(w * 0.5, 0.52, h - 0.5), Models.pbr("white_oak_veneer", 0.8))
				var sx := 1.4
				while sx < w - 1.2:
					_batch(batch, stool_mesh(), Transform3D(Basis.IDENTITY, Vector3(sx, 0, h - 1.1)))
					_spot(root, Vector3(sx, 0, h - 1.15), 0)
					sx += 0.9
				Models.box(root, Vector3(3.0, 1.7, 0.08), Vector3(w * 0.5, 2.0, 0.15), _screen(Color(0.2, 0.6, 0.9)))
			for p in [Vector3(0.5, 0, 0.5), Vector3(w - 0.5, 0, 0.5)]:
				Models.place_prop(root, "potted_plant_02", p, 1.2)
			for k in 8:
				_spot(root, Vector3(randf_range(1.0, w - 1.0), 0, randf_range(1.0, h - 1.0)), randf_range(0, 360))
		"library":
			var x := 1.1
			while x < w - 0.8:
				_batch(batch, bookshelf_mesh(), Transform3D(Basis.IDENTITY, Vector3(x, 0, 0.3)))
				x += 1.85
			for row in [1.6, 2.9]:
				var bx := 1.1
				while bx < w * 0.45:
					_batch(batch, bookshelf_mesh(), Transform3D(Basis.IDENTITY, Vector3(bx, 0, row)))
					bx += 1.85
			var i := 0
			var tz := 1.8
			while tz < h - 0.9:
				_batch(batch, round_table_mesh(), Transform3D(Basis.IDENTITY, Vector3(w * 0.75, 0, tz)))
				for a in [0.0, 90.0, 180.0, 270.0]:
					_place_seat(root, batch, Vector3(w * 0.75, 0, tz) - _dir(a) * 0.95, a, i)
					i += 1
				tz += 2.6
			Models.box(root, Vector3(1.8, 2.3, 1.8), Vector3(1.2, 1.15, h - 1.0), Models.glass_mat())
			Models.box(root, Vector3(1.8, 0.08, 1.8), Vector3(1.2, 2.32, h - 1.0), _dark())
			Models.place_prop(root, "potted_plant_02", Vector3(w - 0.5, 0, h - 0.5), 1.2)
			root.set_meta("staff", [Vector3(w * 0.5, 0, h - 0.8), 180.0])
		"restroom":
			var stall := Models.color_mat(Color(0.3, 0.45, 0.6), 0.35, 0.3)
			var x := 0.55
			while x < w - 0.3:
				Models.place(root, "furniture/toilet", Vector3(x, 0, 0.45), 2.0, 0)
				Models.box(root, Vector3(0.04, 1.8, 1.3), Vector3(x + 0.48, 0.95, 0.65), stall)
				Models.box(root, Vector3(0.9, 1.8, 0.04), Vector3(x, 0.95, 1.32), stall)
				_spot(root, Vector3(x, 0, 0.6), 0)
				x += 0.96
			Models.box(root, Vector3(w - 0.6, 0.12, 0.55), Vector3(w * 0.5, 0.85, h - 0.35), Models.color_mat(Color(0.95, 0.95, 0.95), 0.2))
			Models.box(root, Vector3(w - 0.6, 0.8, 0.03), Vector3(w * 0.5, 1.6, h - 0.1), Models.color_mat(Color(0.8, 0.85, 0.9), 0.02, 1.0))
			x = 0.8
			while x < w - 0.5:
				_spot(root, Vector3(x, 0, h - 1.0), 0)
				x += 1.0
		"nurse_office":
			for bx in [0.9, w - 0.9]:
				Models.box(root, Vector3(0.9, 0.5, 1.9), Vector3(bx, 0.25, h * 0.5), _metal())
				Models.box(root, Vector3(0.85, 0.15, 1.85), Vector3(bx, 0.57, h * 0.5), _white())
				_seat(root, Vector3(bx, 0.45, h * 0.5), 90 if bx < w * 0.5 else -90)
			Models.box(root, Vector3(1.2, 2.0, 0.5), Vector3(w * 0.5, 1.0, 0.3), _white())
			root.set_meta("staff", [Vector3(w * 0.5, 0, h * 0.5), 0.0])
		"counselor_office":
			_batch(batch, teacher_desk_mesh(), Transform3D(Basis.IDENTITY, Vector3(w * 0.5, 0, 1.0)))
			root.set_meta("staff", [Vector3(w * 0.5, 0, 0.5), 0.0])
			Models.place_prop(root, "modern_arm_chair_01", Vector3(w * 0.35, 0, h - 1.3), 1.0, 180)
			Models.place_prop(root, "modern_arm_chair_01", Vector3(w * 0.7, 0, h - 1.3), 1.0, 180)
			_seat(root, Vector3(w * 0.35, 0, h - 1.3), 180)
			_seat(root, Vector3(w * 0.7, 0, h - 1.3), 180)
			Models.place_prop(root, "potted_plant_02", Vector3(0.45, 0, 0.45), 1.1)
		"principal_office":
			var oak := Models.pbr("white_oak_veneer", 0.8)
			Models.box(root, Vector3(3.0, 1.1, 0.7), Vector3(w * 0.35, 0.55, h - 1.2), oak)
			Models.box(root, Vector3(2.4, 0.9, 0.06), Vector3(w * 0.35, 2.2, 0.12), _screen(Color(0.95, 0.75, 0.25)))
			_batch(batch, teacher_desk_mesh(), Transform3D(Basis.IDENTITY, Vector3(w * 0.75, 0, 1.2)))
			_batch(batch, monitor_mesh(), Transform3D(Basis.IDENTITY, Vector3(w * 0.75, 0.76, 1.3)))
			root.set_meta("staff", [Vector3(w * 0.75, 0, 0.6), 0.0])
			for k in [-0.6, 0.6]:
				_place_seat(root, batch, Vector3(w * 0.75 + k, 0, 2.4), 180, 1)
			Models.place_prop(root, "potted_plant_02", Vector3(0.5, 0, 0.5), 1.2)
			_spot(root, Vector3(w * 0.35, 0, h - 0.5), 0)
		"staff_room":
			_batch(batch, round_table_mesh(), Transform3D(Basis.IDENTITY, Vector3(w * 0.4, 0, h * 0.55)))
			for a in [0.0, 90.0, 180.0, 270.0]:
				_place_seat(root, batch, Vector3(w * 0.4, 0, h * 0.55) - _dir(a) * 0.95, a, 4)
			Models.place(root, "furniture/kitchenCabinet", Vector3(w - 1.4, 0, 0.5), 2.0, 0)
			Models.place(root, "furniture/kitchenCoffeeMachine", Vector3(w - 1.4, 0.9, 0.5), 2.0, 0)
			Models.place(root, "furniture/kitchenFridge", Vector3(w - 0.5, 0, 0.5), 2.0, 0)
			_batch(batch, sofa_mesh(Color(0.35, 0.42, 0.5)), Transform3D(Basis(Vector3.UP, PI), Vector3(w - 1.3, 0, h - 0.6)))
			_seat(root, Vector3(w - 1.6, 0.05, h - 0.65), 180)
			_seat(root, Vector3(w - 1.0, 0.05, h - 0.65), 180)
		"lockers":
			for i in int(w / 0.5):
				_batch(batch, locker_mesh(), Transform3D(Basis(Vector3.UP, PI), Vector3(0.25 + i * 0.5, 0.06, 0.3)))
				_spot(root, Vector3(0.25 + i * 0.5, 0, 1.2), 180)
		"vending":
			Models.box(root, Vector3(1.0, 1.9, 0.8), Vector3(1.0, 1.0, 0.6), Models.color_mat(Color(0.12, 0.12, 0.14), 0.3, 0.4))
			Models.box(root, Vector3(0.7, 1.4, 0.02), Vector3(0.9, 1.15, 1.01), _screen(Color(0.6, 0.85, 1.0)))
			_spot(root, Vector3(1.0, 0, 1.6), 180)
		"basketball_court":
			Models.plane(root, Vector2(w, h), Vector3(w * 0.5, 0.04, h * 0.5), _court_mat("basket"))
			_hoop(root, Vector3(0.6, 0, h * 0.5), 90)
			_hoop(root, Vector3(w - 0.6, 0, h * 0.5), -90)
			root.set_meta("sport", Rect2(1, 1, w - 2, h - 2))
		"football_field":
			_stadium(root, batch, w, h)
		"parking_lot":
			_parking(root, b, w, h)
		"stairs":
			_stairs(root, b, w, h)
		"elevator":
			_elevator(root, w, h)
		_:
			_decor(root, b, w, h)
	_flush(root, batch)


static func _hoop(root: Node3D, p: Vector3, rot: float) -> void:
	var n := Node3D.new()
	n.position = p
	n.rotation.y = deg_to_rad(rot)
	root.add_child(n)
	Models.cylinder(n, 0.07, 3.0, Vector3.ZERO, _metal())
	Models.box(n, Vector3(1.8, 1.05, 0.05), Vector3(0, 3.1, 0.15), Models.glass_mat())
	Models.box(n, Vector3(0.6, 0.45, 0.06), Vector3(0, 2.95, 0.16), Models.color_mat(Color.WHITE, 0.3))
	var rim := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.2
	tm.outer_radius = 0.24
	rim.mesh = tm
	rim.material_override = Models.color_mat(Color(0.95, 0.4, 0.1), 0.4, 0.6)
	rim.position = Vector3(0, 2.75, 0.45)
	n.add_child(rim)


## Stands at `p`; when `face_pos_z` the spectators look toward +Z (rows climb toward -Z).
static func _bleachers(root: Node3D, batch: Dictionary, p: Vector3, length: float, rows: int, col: Color, face_pos_z: bool) -> void:
	var rot := 180.0 if face_pos_z else 0.0
	var xf := Transform3D(Basis(Vector3.UP, deg_to_rad(rot)), p + (Vector3(0, 0, (rows - 1) * 0.8 + 0.4) if face_pos_z else Vector3.ZERO))
	_batch(batch, bleacher_mesh(length, rows, col), xf)
	for r in rows:
		var x := -length * 0.5 + 0.6
		while x < length * 0.5 - 0.4:
			_seat(root, xf * Vector3(x, 0.5 * (r + 1) - 0.02, r * 0.8 + 0.2), 0.0 if face_pos_z else 180.0)
			x += 0.85


static func _water_mat() -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/water.gdshader")
	return m


static func _stadium(root: Node3D, batch: Dictionary, w: float, h: float) -> void:
	Models.plane(root, Vector2(w, h - 4.0), Vector3(w * 0.5, 0.04, h * 0.5 - 1.0), Models.pbr("rubberized_track", 0.4))
	Models.plane(root, Vector2(w - 3.0, h - 7.0), Vector3(w * 0.5, 0.06, h * 0.5 - 1.0), _court_mat("football"))
	var post := Models.color_mat(Color(0.95, 0.85, 0.15), 0.4, 0.5)
	for gx in [1.6, w - 1.6]:
		Models.cylinder(root, 0.08, 3.0, Vector3(gx, 0, h * 0.5 - 1.0), post)
		Models.box(root, Vector3(0.1, 0.1, 2.8), Vector3(gx, 3.0, h * 0.5 - 1.0), post)
		Models.cylinder(root, 0.05, 2.4, Vector3(gx, 3.0, h * 0.5 - 2.4), post)
		Models.cylinder(root, 0.05, 2.4, Vector3(gx, 3.0, h * 0.5 + 0.4), post)
	# home stands on the south side, rising away from the field
	_bleachers(root, batch, Vector3(w * 0.5, 0, h - 4.2), w - 4.0, 5, Color(0.12, 0.25, 0.6), false)
	_bleachers(root, batch, Vector3(w * 0.5, 0, -0.1), w - 10.0, 2, Color(0.55, 0.12, 0.12), true)
	var pb := Vector3(w * 0.5, 2.6, h - 0.4)
	Models.box(root, Vector3(8.0, 2.4, 1.6), pb + Vector3(0, 1.2, 0), Models.pbr("rectangular_facade_tiles", 0.3))
	Models.box(root, Vector3(7.6, 1.0, 0.05), pb + Vector3(0, 1.5, -0.82), Models.glass_mat())
	Models.box(root, Vector3(0.4, 3.2, 6.0), Vector3(0.3, 4.6, h * 0.5 - 1.0), _dark())
	Models.box(root, Vector3(0.05, 2.8, 5.6), Vector3(0.52, 4.6, h * 0.5 - 1.0), _screen(Color(0.25, 0.5, 0.95)))
	Models.cylinder(root, 0.2, 3.0, Vector3(0.3, 0, h * 0.5 - 2.5), _metal())
	Models.cylinder(root, 0.2, 3.0, Vector3(0.3, 0, h * 0.5 + 0.5), _metal())
	var lbl := Label3D.new()
	lbl.text = "%s\nHOME %d  AWAY %d" % [Game.team_name.to_upper(), Game.wins, Game.losses]
	lbl.font_size = 64
	lbl.pixel_size = 0.012
	lbl.modulate = Color(1, 0.85, 0.3)
	lbl.position = Vector3(0.56, 4.6, h * 0.5 - 1.0)
	lbl.rotation.y = PI * 0.5
	root.add_child(lbl)
	for c in [Vector3(0.6, 0, 1.0), Vector3(w - 0.6, 0, 1.0), Vector3(0.6, 0, h - 5.0), Vector3(w - 0.6, 0, h - 5.0)]:
		Models.cylinder(root, 0.18, 14.0, c, _metal(), 0.12)
		var bank := Models.box(root, Vector3(2.2, 1.2, 0.3), c + Vector3(0, 14.2, 0), Models.color_mat(Color(0.95, 0.95, 0.9), 0.3, 0, Color(1, 0.98, 0.9)))
		bank.look_at_from_position(bank.position, Vector3(w * 0.5, 0, h * 0.5), Vector3.UP)
	root.set_meta("sport", Rect2(3, 3.5, w - 6, h - 9))
	root.set_meta("staff", [Vector3(w * 0.5, 0, h - 5.0), 180.0])


static func _parking(root: Node3D, b: Building, w: float, h: float) -> void:
	Models.plane(root, Vector2(w, h), Vector3(w * 0.5, 0.03, h * 0.5), Models.pbr("clean_asphalt", 0.2))
	var line := Models.color_mat(Color(0.95, 0.95, 0.92), 0.6)
	var cars := ["cars/sedan", "cars/suv", "cars/suv-luxury", "cars/hatchback-sports", "cars/van", "cars/sedan-sports", "cars/truck"]
	var rng := RandomNumberGenerator.new()
	rng.seed = b.uid
	for row in 2:
		var z := 0.2 if row == 0 else h - 2.6
		var x := 0.0
		while x <= w + 0.01:
			Models.box(root, Vector3(0.1, 0.01, 2.4), Vector3(x, 0.045, z + 1.2), line)
			if x + 2.5 <= w and rng.randf() < 0.75:
				var model: String = cars[rng.randi() % cars.size()]
				var bb := Models.aabb_of(model)
				var len_ := maxf(bb.size.z, bb.size.x)
				var sc := 4.3 / maxf(len_, 0.01)
				var car := Models.place(root, model, Vector3(x + 1.25, 0.03, z + 1.2), sc, 0.0 if bb.size.z >= bb.size.x else 90.0)
				if car:
					car.rotation.y += deg_to_rad(rng.randf_range(-3, 3) + (180.0 if row == 1 else 0.0))
			x += 2.5


static func _stairs(root: Node3D, b: Building, w: float, h: float) -> void:
	var pivot := Node3D.new()
	pivot.position = Vector3(w * 0.5, 0, h * 0.5)
	root.add_child(pivot)
	# unrotated: 4 m wide (x), 8 m long (z); the top is at z = -4
	var steps := 20
	var run := 8.0
	var tread := Models.pbr("smooth_concrete_floor", 0.3)
	var k := Models.Kit.new()
	for i in steps:
		var y := (i + 1) * LH / steps
		var z := run * 0.5 - (i + 0.5) * run / steps
		k.box(tread, Vector3(0, y - 0.1, z), Vector3(3.6, 0.2, run / steps + 0.02))
	var slope := atan2(LH, run)
	var span := sqrt(run * run + LH * LH)
	for sx in [-1.85, 1.85]:
		var xf := Transform3D(Basis(Vector3.RIGHT, slope), Vector3(sx, LH * 0.5 - 0.15, 0))
		k.box(_metal(), Vector3.ZERO, Vector3(0.1, 0.3, span), xf)
		var rail := Transform3D(Basis(Vector3.RIGHT, slope), Vector3(sx, LH * 0.5 + 0.55, 0))
		k.box(Models.glass_mat(), Vector3.ZERO, Vector3(0.03, 1.0, span), rail)
		k.box(_metal(), Vector3(0, 0.52, 0), Vector3(0.06, 0.05, span), rail)
	Models.mesh_node(pivot, k.commit(), Vector3.ZERO)


static func _elevator(root: Node3D, w: float, h: float) -> void:
	var k := Models.Kit.new()
	var tall := LH * 2.0 - 0.3
	for c in [Vector3(0.2, 0, 0.2), Vector3(w - 0.2, 0, 0.2), Vector3(0.2, 0, h - 0.2), Vector3(w - 0.2, 0, h - 0.2)]:
		k.box(_metal(), c + Vector3(0, tall * 0.5, 0), Vector3(0.12, tall, 0.12))
	k.box(Models.glass_mat(), Vector3(w * 0.5, tall * 0.5, 0.2), Vector3(w - 0.4, tall, 0.03))
	k.box(Models.glass_mat(), Vector3(0.2, tall * 0.5, h * 0.5), Vector3(0.03, tall, h - 0.4))
	k.box(Models.glass_mat(), Vector3(w - 0.2, tall * 0.5, h * 0.5), Vector3(0.03, tall, h - 0.4))
	k.box(_metal(), Vector3(w * 0.5, tall, h * 0.5), Vector3(w, 0.25, h))
	k.box(Models.color_mat(Color(0.75, 0.77, 0.8), 0.3, 0.8), Vector3(w * 0.5, 1.2, h * 0.5), Vector3(w - 0.8, 2.4, h - 0.8))
	Models.mesh_node(root, k.commit(), Vector3.ZERO)


static func _court_mat(kind: String) -> StandardMaterial3D:
	if not _tex_cache.has(kind):
		var img := Image.create(1024, 512, false, Image.FORMAT_RGB8)
		var white := Color(0.95, 0.95, 0.95)
		match kind:
			"football":
				for i in 20:
					img.fill_rect(Rect2i(i * 52, 0, 52, 512), Color(0.16, 0.42, 0.16) if i % 2 == 0 else Color(0.18, 0.47, 0.18))
				img.fill_rect(Rect2i(0, 0, 88, 512), Color(0.08, 0.18, 0.5))
				img.fill_rect(Rect2i(936, 0, 88, 512), Color(0.08, 0.18, 0.5))
				for i in 11:
					img.fill_rect(Rect2i(88 + i * 84, 0, 4, 512), white)
				img.fill_rect(Rect2i(0, 0, 1024, 5), white)
				img.fill_rect(Rect2i(0, 507, 1024, 5), white)
				for i in 21:
					img.fill_rect(Rect2i(88 + i * 42, 180, 2, 14), white)
					img.fill_rect(Rect2i(88 + i * 42, 318, 2, 14), white)
				for a in 200:
					var ang := a * TAU / 200.0
					img.fill_rect(Rect2i(512 + int(cos(ang) * 70) - 4, 256 + int(sin(ang) * 70) - 4, 8, 8), Color(0.95, 0.75, 0.15))
			"basket", "gym":
				img.fill(Color(0.78, 0.56, 0.34) if kind == "gym" else Color(0.32, 0.36, 0.4))
				if kind == "basket":
					img.fill_rect(Rect2i(16, 16, 992, 480), Color(0.2, 0.42, 0.6))
				for r in [Rect2i(16, 16, 992, 6), Rect2i(16, 490, 992, 6), Rect2i(16, 16, 6, 480), Rect2i(1002, 16, 6, 480), Rect2i(509, 16, 6, 480)]:
					img.fill_rect(r, white)
				for a in 128:
					var ang := a * TAU / 128.0
					img.fill_rect(Rect2i(512 + int(cos(ang) * 72) - 3, 256 + int(sin(ang) * 72) - 3, 6, 6), white)
				img.fill_rect(Rect2i(16, 190, 170, 132), Color(0.1, 0.22, 0.55))
				img.fill_rect(Rect2i(838, 190, 170, 132), Color(0.1, 0.22, 0.55))
		img.generate_mipmaps()
		_tex_cache[kind] = ImageTexture.create_from_image(img)
	var m := StandardMaterial3D.new()
	m.albedo_texture = _tex_cache[kind]
	m.roughness = 0.35 if kind == "gym" else 0.9
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	return m


static func _flag_tex(kind: String) -> ImageTexture:
	if not _tex_cache.has(kind):
		var img := Image.create(190, 100, false, Image.FORMAT_RGB8)
		var red := Color(0.7, 0.1, 0.15)
		var blue := Color(0.1, 0.15, 0.4)
		if kind == "us":
			for i in 13:
				img.fill_rect(Rect2i(0, int(i * 100 / 13.0), 190, 8), red if i % 2 == 0 else Color.WHITE)
			img.fill_rect(Rect2i(0, 0, 76, 54), blue)
			for yy in 5:
				for xx in 6:
					img.fill_rect(Rect2i(5 + xx * 12, 5 + yy * 10, 3, 3), Color.WHITE)
		else:
			img.fill_rect(Rect2i(0, 0, 63, 100), blue)
			img.fill_rect(Rect2i(63, 0, 127, 50), Color.WHITE)
			img.fill_rect(Rect2i(63, 50, 127, 50), red)
			img.fill_rect(Rect2i(24, 40, 14, 14), Color.WHITE)
		_tex_cache[kind] = ImageTexture.create_from_image(img)
	return _tex_cache[kind]


static func _flag_mat(kind: String) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_texture = _flag_tex(kind)
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.roughness = 0.9
	return m


# ---------------------------------------------------------------------
#  Decor & outdoor items
# ---------------------------------------------------------------------

static func _decor(root: Node3D, b: Building, w: float, h: float) -> void:
	var c := Vector3(w * 0.5, 0, h * 0.5)
	var rng := RandomNumberGenerator.new()
	rng.seed = b.uid
	match b.id:
		"tree":
			var kinds := ["nature/tree_oak", "nature/tree_default", "nature/tree_tall", "nature/tree_simple"]
			Models.spawn(root, kinds[rng.randi() % kinds.size()], c, rng.randf_range(4.0, 5.2), rng.randf_range(0, 360))
		"flowers":
			Models.place_prop(root, "shrub_03", c + Vector3(-0.3, 0, 0), 1.3, rng.randf_range(0, 360))
			Models.place_prop(root, "shrub_02", c, 0.35, rng.randf_range(0, 360))
			for i in 5:
				var kinds := ["nature/flower_redA", "nature/flower_yellowA", "nature/flower_purpleA"]
				Models.spawn(root, kinds[i % 3], c + Vector3(rng.randf_range(-0.8, 0.8), 0, rng.randf_range(-0.8, 0.8)), 3.0, rng.randf_range(0, 360))
		"planter":
			Models.place_prop(root, "potted_plant_02", c, 1.4, rng.randf_range(0, 360))
		"bench":
			var wood := Models.pbr("white_oak_veneer", 1.0, Color(0.8, 0.65, 0.45))
			Models.box(root, Vector3(1.6, 0.06, 0.45), c + Vector3(0, 0.45, 0), wood)
			Models.box(root, Vector3(1.6, 0.35, 0.05), c + Vector3(0, 0.7, 0.2), wood)
			for x in [-0.7, 0.7]:
				Models.box(root, Vector3(0.06, 0.45, 0.45), c + Vector3(x, 0.22, 0), _dark())
			_seat(root, c + Vector3(-0.35, 0, -0.05), 180)
			_seat(root, c + Vector3(0.35, 0, -0.05), 180)
		"trash_can":
			for i in 3:
				Models.box(root, Vector3(0.42, 0.95, 0.42), c + Vector3(-0.45 + i * 0.45, 0.47, 0),
					Models.color_mat([Color(0.15, 0.35, 0.75), Color(0.2, 0.55, 0.3), Color(0.35, 0.36, 0.38)][i], 0.5))
		"bulletin_board":
			Models.box(root, Vector3(0.9, 1.7, 0.12), c + Vector3(0, 0.95, 0), _dark())
			Models.box(root, Vector3(0.82, 1.5, 0.01), c + Vector3(0, 1.0, -0.065), _screen(Color(0.95, 0.65, 0.2)))
			Models.box(root, Vector3(0.5, 0.06, 0.4), c + Vector3(0, 0.03, 0), _dark())
		"trophy_case":
			var oak := Models.pbr("white_oak_veneer", 0.8)
			Models.box(root, Vector3(w - 0.3, 0.8, 0.6), c + Vector3(0, 0.4, 0), oak)
			Models.box(root, Vector3(w - 0.3, 1.4, 0.6), c + Vector3(0, 1.5, 0), Models.glass_mat())
			var gold := Models.color_mat(Color(0.95, 0.75, 0.25), 0.2, 1.0)
			for i in 6:
				var tx := -w * 0.5 + 0.5 + i * (w - 1.0) / 5.0
				Models.cylinder(root, 0.08, 0.3 + (i % 3) * 0.15, c + Vector3(tx, 0.82, 0), gold, 0.03)
		"lamp":
			Models.cylinder(root, 0.08, 6.0, c, _dark(), 0.05)
			Models.box(root, Vector3(1.4, 0.08, 0.25), c + Vector3(0.6, 6.0, 0), _dark())
			Models.box(root, Vector3(0.8, 0.04, 0.2), c + Vector3(0.9, 5.96, 0), Models.color_mat(Color.WHITE, 0.3, 0, Color(1, 0.97, 0.9)))
		"fountain":
			var stone := Models.pbr("concrete_pavement", 0.8, Color(0.9, 0.9, 0.88))
			Models.cylinder(root, 1.7, 0.55, c, stone)
			var water := Models.cylinder(root, 1.5, 0.05, c + Vector3(0, 0.5, 0), _water_mat())
			water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			Models.cylinder(root, 0.25, 1.4, c, stone)
			Models.cylinder(root, 0.7, 0.15, c + Vector3(0, 1.35, 0), stone, 0.5)
		"mascot_statue":
			Models.box(root, Vector3(1.8, 1.0, 1.8), c + Vector3(0, 0.5, 0), Models.pbr("brick_wall_003", 0.6))
			var bronze := Models.color_mat(Color(0.55, 0.38, 0.2), 0.3, 1.0)
			var bird := Node3D.new()
			bird.position = c + Vector3(0, 1.0, 0)
			root.add_child(bird)
			Models.cylinder(bird, 0.35, 1.3, Vector3.ZERO, bronze, 0.25)
			var head := MeshInstance3D.new()
			var sm := SphereMesh.new()
			sm.radius = 0.3
			sm.height = 0.6
			head.mesh = sm
			head.material_override = bronze
			head.position = Vector3(0, 1.45, 0.05)
			bird.add_child(head)
			Models.box(bird, Vector3(0.12, 0.1, 0.3), Vector3(0, 1.42, 0.35), Models.color_mat(Color(0.95, 0.75, 0.2), 0.2, 1.0))
			for s in [-1, 1]:
				var wing := Models.box(bird, Vector3(1.4, 0.08, 0.55), Vector3(s * 0.8, 1.1, 0), bronze)
				wing.rotation.z = deg_to_rad(s * 32)
		"flagpole":
			for i in 2:
				var px := c + Vector3(-0.5 + i * 1.0, 0, 0)
				Models.cylinder(root, 0.06, 9.0, px, Models.color_mat(Color(0.85, 0.86, 0.88), 0.25, 0.9), 0.04)
				var flag := Models.plane(root, Vector2(1.9, 1.0), px + Vector3(1.0, 8.3, 0), _flag_mat("us" if i == 0 else "tx"))
				flag.rotation.x = PI * 0.5
		"marquee":
			Models.box(root, Vector3(w, 0.8, 0.8), c + Vector3(0, 0.4, 0), Models.pbr("brick_wall_003", 0.5))
			Models.box(root, Vector3(w - 0.6, 1.6, 0.4), c + Vector3(0, 1.6, 0), _dark())
			for side in [-1, 1]:
				var l := Label3D.new()
				l.text = "%s\nHOME OF THE %s" % [Game.school_name.to_upper(), Game.team_name.to_upper()]
				l.font_size = 48
				l.pixel_size = 0.008
				l.modulate = Color(1.0, 0.75, 0.25)
				l.outline_size = 0
				l.position = c + Vector3(0, 1.62, side * 0.21)
				l.rotation.y = 0.0 if side > 0 else PI
				root.add_child(l)
		"security_camera":
			Models.cylinder(root, 0.06, 3.2, c, _metal())
			Models.place_prop(root, "security_camera_01", c + Vector3(0, 3.1, 0), 1.6, 180)
		"solar_panels":
			var cell := Models.color_mat(Color(0.08, 0.12, 0.3), 0.15, 0.6)
			for row in 2:
				for k in 3:
					var p := Vector3(1.0 + k * 2.0, 0.9, 1.0 + row * 2.0)
					Models.box(root, Vector3(0.08, 0.9, 0.08), p - Vector3(0, 0.45, 0), _metal())
					var panel := Models.box(root, Vector3(1.8, 0.05, 1.4), p, cell)
					panel.rotation.x = deg_to_rad(-25)

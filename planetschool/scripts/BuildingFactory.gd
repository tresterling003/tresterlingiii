class_name BuildingFactory
extends RefCounted
## Assembles a 3D building from Kenney kit pieces: tinted modular walls with
## windows and doorways, a flat roof, a textured floor and a furnished interior.
## The returned node carries metadata the people renderer uses:
##   "seats"   Array of [Vector3 local pos, float facing deg]  (sit animation)
##   "spots"   Array of [Vector3, float]                       (stand / idle)
##   "staff"   [Vector3, float]                                (where staff stand)
##   "sport"   Rect2 local area for running around, or null

const T := Models.TILE
const WALL_H := 2.4
const OUTDOOR := ["football_field", "basketball_court", "lockers", "vending", "solar_panels", "security_camera"]
const FLOORS := {
	"gymnasium": ["laminate_floor_02", 0.35], "theater": ["laminate_floor_02", 0.35], "library": ["laminate_floor_02", 0.35],
	"music_room": ["laminate_floor_02", 0.35], "principal_office": ["laminate_floor_02", 0.35],
	"staff_room": ["laminate_floor_02", 0.35], "counselor_office": ["laminate_floor_02", 0.35],
	"restroom": ["floor_tiles_06", 0.9], "cafeteria": ["floor_tiles_06", 0.35], "pool": ["floor_tiles_06", 0.7],
}

static var _court_tex := {}


static func facade_color(b: Building) -> Color:
	var c: Color = b.def()["color"]
	return c.lerp(Color(0.92, 0.88, 0.8), 0.35)


static func build(b: Building, full: bool) -> Node3D:
	var root := Node3D.new()
	root.name = "B%d" % b.uid
	root.position = Vector3(b.pos.x * T, 0, b.pos.y * T)
	var w := b.size.x * T
	var h := b.size.y * T
	root.set_meta("seats", [])
	root.set_meta("spots", [])
	root.set_meta("staff", [Vector3(w * 0.5, 0, h * 0.5), 0.0])
	root.set_meta("sport", null)
	if b.is_decor() or b.id in ["security_camera", "solar_panels"]:
		_decor(root, b)
		return root
	if not b.id in OUTDOOR:
		_floor(root, b, w, h)
		_walls(root, b, w, h, full)
	_interior(root, b, w, h)
	if b.size.x * b.size.y <= 3:
		return root
	# name sign
	var sign := Label3D.new()
	sign.text = b.display_name()
	sign.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	sign.font_size = 44
	sign.outline_size = 12
	sign.pixel_size = 0.012
	sign.modulate = Color(1, 1, 1, 0.92)
	sign.position = Vector3(w * 0.5, (WALL_H + 1.0) if full and not b.id in OUTDOOR else 2.2, h * 0.5)
	sign.visibility_range_end = 70.0
	sign.no_depth_test = false
	sign.name = "Sign"
	root.add_child(sign)
	return root


# ---------------------------------------------------------------------
#  Shell
# ---------------------------------------------------------------------

static func _floor(root: Node3D, b: Building, w: float, h: float) -> void:
	var f: Array = FLOORS.get(b.id, ["floor_tiles_06", 0.5])
	var mi := Models.plane(root, Vector2(w, h), Vector3(w * 0.5, 0.04, h * 0.5), Models.pbr(f[0], f[1]))
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


static func _edge_open(t: Vector2i) -> bool:
	if not Game.in_bounds(t):
		return false
	if Game.path_at(t) > 0:
		return true
	var nb := Game.building_at(t)
	return nb != null and not nb.is_decor() and nb.capacity() > 0


static func _walls(root: Node3D, b: Building, w: float, h: float, full: bool) -> void:
	var mat := Models.wall_mat(facade_color(b), clampf((70.0 - b.condition) / 70.0, 0.0, 1.0))
	var walls := Node3D.new()
	walls.name = "Walls"
	root.add_child(walls)
	# [outside tile, local position, rotation]
	var segs: Array = []
	for j in b.size.y:
		segs.append([b.pos + Vector2i(-1, j), Vector3(0, 0, j * T + T * 0.5), 0.0, j])
		segs.append([b.pos + Vector2i(b.size.x, j), Vector3(w, 0, j * T + T * 0.5), 180.0, j])
	for i in b.size.x:
		segs.append([b.pos + Vector2i(i, -1), Vector3(i * T + T * 0.5, 0, 0), 90.0, i])
		segs.append([b.pos + Vector2i(i, b.size.y), Vector3(i * T + T * 0.5, 0, h), -90.0, i])
	# One doorway per side: the open segment closest to the middle of that side.
	var doors := {}
	for s in segs:
		if not _edge_open(s[0]):
			continue
		var side := "%d" % int(s[2])
		var mid := (b.size.y if absf(s[2]) < 1 or absf(s[2]) > 179 else b.size.x) * 0.5 - 0.5
		var score := absf(float(s[3]) - mid)
		if not doors.has(side) or score < doors[side][0]:
			doors[side] = [score, s[3]]
	for s in segs:
		var side := "%d" % int(s[2])
		var open: bool = doors.has(side) and doors[side][1] == s[3]
		var piece := ""
		if full:
			piece = "building/wall-doorway-square" if open else ("building/wall-window-square" if int(s[3]) % 2 == 0 else "building/wall")
		else:
			piece = "" if open else "building/wall-low"
		if piece == "":
			continue
		var n := Models.spawn(walls, piece, s[1], 1.0, s[2])
		Models.override_all(n, mat)
	for c in [Vector3(0, 0, 0), Vector3(w, 0, 0), Vector3(0, 0, h), Vector3(w, 0, h)]:
		var col := Models.spawn(walls, "building/column", c, 0.8)
		col.scale.y = 1.0 if full else 0.5
		Models.override_all(col, mat)
	if full:
		var roof := Node3D.new()
		roof.name = "Roof"
		root.add_child(roof)
		Models.box(roof, Vector3(w + 0.2, 0.22, h + 0.2), Vector3(w * 0.5, WALL_H + 0.11, h * 0.5), Models.color_mat(Color(0.3, 0.31, 0.34), 0.95))
		var trim := Models.color_mat(facade_color(b).darkened(0.15), 0.9)
		Models.box(roof, Vector3(w + 0.3, 0.35, 0.18), Vector3(w * 0.5, WALL_H + 0.3, 0), trim)
		Models.box(roof, Vector3(w + 0.3, 0.35, 0.18), Vector3(w * 0.5, WALL_H + 0.3, h), trim)
		Models.box(roof, Vector3(0.18, 0.35, h + 0.3), Vector3(0, WALL_H + 0.3, h * 0.5), trim)
		Models.box(roof, Vector3(0.18, 0.35, h + 0.3), Vector3(w, WALL_H + 0.3, h * 0.5), trim)
		if b.size.x * b.size.y >= 12:
			Models.spawn(roof, "modular/detail-ac-a", Vector3(w * 0.3, WALL_H + 0.22, h * 0.35), 2.2)
			Models.spawn(roof, "modular/detail-ac-b", Vector3(w * 0.7, WALL_H + 0.22, h * 0.6), 2.2, 90)


# ---------------------------------------------------------------------
#  Interiors
# ---------------------------------------------------------------------

static func _seat(root: Node3D, p: Vector3, facing: float) -> void:
	root.get_meta("seats").append([p, facing])


static func _spot(root: Node3D, p: Vector3, facing: float) -> void:
	root.get_meta("spots").append([p, facing])


## Rows of student desks facing the front (z = 0) wall.
static func _desk_rows(root: Node3D, w: float, h: float, desk := "furniture/desk", extra := "") -> void:
	var x := 1.0
	while x <= w - 1.0:
		var z := 2.6
		while z <= h - 0.8:
			Models.place(root, desk, Vector3(x, 0, z - 0.5), 1.25, 180)
			if extra != "":
				Models.place(root, extra, Vector3(x, 0.48, z - 0.55), 1.3, 180)
			Models.place(root, "furniture/chairDesk", Vector3(x, 0, z), 1.25, 180)
			_seat(root, Vector3(x, 0, z), 180)
			z += 1.35
		x += 1.35


static func _front_board(root: Node3D, w: float) -> void:
	Models.box(root, Vector3(minf(w * 0.5, 4.0), 0.75, 0.06), Vector3(w * 0.5, 0.75, 0.22), Models.color_mat(Color(0.96, 0.97, 0.98), 0.3))
	Models.box(root, Vector3(minf(w * 0.5, 4.0) + 0.12, 0.87, 0.04), Vector3(w * 0.5, 0.75, 0.18), Models.color_mat(Color(0.55, 0.57, 0.6), 0.5, 0.6))
	Models.place(root, "furniture/desk", Vector3(w * 0.5 + 1.3, 0, 1.1), 1.6, 0)
	Models.place(root, "furniture/chairDesk", Vector3(w * 0.5 + 1.3, 0, 0.55), 1.6, 0)
	root.set_meta("staff", [Vector3(w * 0.5 - 0.6, 0, 0.9), 0.0])


static func _interior(root: Node3D, b: Building, w: float, h: float) -> void:
	match b.id:
		"math_room", "english_room", "history_room", "language_room":
			_front_board(root, w)
			_desk_rows(root, w, h)
			Models.place(root, "furniture/bookcaseOpen", Vector3(w - 0.6, 0, h - 0.4), 2.0, 180)
			Models.place(root, "furniture/pottedPlant", Vector3(0.5, 0, h - 0.5), 2.0)
		"science_lab":
			_front_board(root, w)
			_desk_rows(root, w, h, "furniture/kitchenBar")
			Models.place(root, "furniture/kitchenSink", Vector3(w - 0.5, 0, h * 0.5), 2.0, -90)
			Models.place(root, "furniture/kitchenCabinet", Vector3(w - 0.5, 0, h * 0.5 + 0.9), 2.0, -90)
		"computer_lab", "robotics_lab":
			_front_board(root, w)
			_desk_rows(root, w, h, "furniture/desk", "furniture/computerScreen" if b.id == "computer_lab" else "furniture/cardboardBoxOpen")
		"art_studio":
			_front_board(root, w)
			_desk_rows(root, w, h, "furniture/table")
			for i in 3:
				Models.box(root, Vector3(0.6, 0.45, 0.04), Vector3(0.8 + i * 1.4, 1.5, h - 0.15), Models.color_mat(Color.from_hsv(randf(), 0.6, 0.9)))
		"music_room":
			root.set_meta("staff", [Vector3(w * 0.5, 0, 1.0), 0.0])
			Models.box(root, Vector3(1.6, 1.0, 0.6), Vector3(1.2, 0.5, 0.6), Models.color_mat(Color(0.05, 0.05, 0.06), 0.25))
			Models.place(root, "furniture/speaker", Vector3(w - 0.6, 0, 0.5), 2.2, 0)
			for ring in 3:
				var r := 2.0 + ring * 1.2
				for k in 7:
					var a := deg_to_rad(-60 + k * 20)
					var p := Vector3(w * 0.5 + sin(a) * r, 0, 0.9 + cos(a) * r)
					if p.x > 0.5 and p.x < w - 0.5 and p.z < h - 0.4:
						var face := rad_to_deg(atan2(-sin(a), -cos(a)))
						Models.place(root, "furniture/chair", p, 2.0, face)
						_seat(root, p, face)
		"gymnasium":
			_room_gymnasium(root, w, h)
		"pool":
			_room_pool(root, w, h)
		"theater":
			_room_theater(root, w, h)
		"cafeteria":
			_room_cafeteria(root, w, h)
		"library":
			_room_library(root, w, h)
		"restroom":
			_room_restroom(root, w, h)
		"student_lounge":
			_room_student_lounge(root, w, h)
		"nurse_office":
			_room_nurse_office(root, w, h)
		"counselor_office":
			_room_counselor_office(root, w, h)
		"principal_office":
			_room_principal_office(root, w, h)
		"staff_room":
			_room_staff_room(root, w, h)
		"esports_arena":
			_room_esports_arena(root, w, h)
		"lockers":
			for i in int(w / 0.5):
				var c := Color(0.2, 0.35, 0.7) if i % 2 == 0 else Color(0.25, 0.42, 0.78)
				Models.box(root, Vector3(0.46, 1.9, 0.5), Vector3(0.25 + i * 0.5, 0.95, 0.35), Models.color_mat(c, 0.4, 0.5))
				Models.box(root, Vector3(0.2, 0.03, 0.01), Vector3(0.25 + i * 0.5, 1.6, 0.61), Models.color_mat(Color(0.1, 0.1, 0.12)))
				_spot(root, Vector3(0.25 + i * 0.5, 0, 1.2), 180)
		"vending":
			Models.box(root, Vector3(1.0, 1.9, 0.8), Vector3(1.0, 0.95, 0.7), Models.color_mat(Color(0.75, 0.08, 0.1), 0.35, 0.3))
			Models.box(root, Vector3(0.6, 1.3, 0.02), Vector3(0.85, 1.1, 1.11), Models.color_mat(Color(0.7, 0.9, 1.0), 0.1, 0, Color(0.5, 0.75, 1.0)))
			_spot(root, Vector3(1.0, 0, 1.6), 180)
		"basketball_court":
			Models.plane(root, Vector2(w, h), Vector3(w * 0.5, 0.03, h * 0.5), _court_mat("basket", w, h))
			_hoop(root, Vector3(0.6, 0, h * 0.5), 90)
			_hoop(root, Vector3(w - 0.6, 0, h * 0.5), -90)
			root.set_meta("sport", Rect2(1, 1, w - 2, h - 2))
		"football_field":
			_room_football_field(root, w, h)


static func _hoop(root: Node3D, p: Vector3, rot: float) -> void:
	var n := Node3D.new()
	n.position = p
	n.rotation.y = deg_to_rad(rot)
	root.add_child(n)
	Models.cylinder(n, 0.07, 3.0, Vector3(0, 1.5, 0), Models.color_mat(Color(0.3, 0.3, 0.32), 0.4, 0.8))
	Models.box(n, Vector3(1.8, 1.05, 0.06), Vector3(0, 3.1, 0.15), Models.color_mat(Color(0.95, 0.95, 0.95), 0.3))
	var rim := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.2
	tm.outer_radius = 0.24
	rim.mesh = tm
	rim.material_override = Models.color_mat(Color(0.95, 0.4, 0.1), 0.4, 0.6)
	rim.position = Vector3(0, 2.75, 0.45)
	n.add_child(rim)


static func _room_gymnasium(root: Node3D, w: float, h: float) -> void:
	Models.plane(root, Vector2(w - 3.2, h - 4.0), Vector3(w * 0.5, 0.05, h * 0.5 + 0.8), _court_mat("gym", w - 3.2, h - 4.0))
	_hoop(root, Vector3(1.1, 0, h * 0.5 + 0.8), 90)
	_hoop(root, Vector3(w - 1.1, 0, h * 0.5 + 0.8), -90)
	_bleachers(root, Vector3(w * 0.5, 0, 0.2), w - 2.0, 0.0)
	root.set_meta("sport", Rect2(2, 3.5, w - 4, h - 5))
	root.set_meta("staff", [Vector3(w * 0.5, 0, h - 1.0), 180.0])


static func _bleachers(root: Node3D, p: Vector3, length: float, rot: float) -> void:
	var n := Node3D.new()
	n.position = p
	n.rotation.y = deg_to_rad(rot)
	root.add_child(n)
	var mat := Models.color_mat(Color(0.62, 0.64, 0.68), 0.5, 0.6)
	var seat_mat := Models.color_mat(Color(0.75, 0.2, 0.2), 0.6)
	for row in 3:
		Models.box(n, Vector3(length, 0.45 * (row + 1), 0.8), Vector3(0, 0.225 * (row + 1), 2.2 - row * 0.8), mat)
		Models.box(n, Vector3(length, 0.06, 0.3), Vector3(0, 0.45 * (row + 1) + 0.03, 2.35 - row * 0.8), seat_mat)
		var x := -length * 0.5 + 0.6
		while x < length * 0.5 - 0.4:
			var lp: Vector3 = n.transform * Vector3(x, 0.45 * (row + 1), 2.3 - row * 0.8)
			_seat(root, lp, rot)
			x += 0.9


static func _room_pool(root: Node3D, w: float, h: float) -> void:
	Models.box(root, Vector3(w - 2.4, 0.3, h - 2.4), Vector3(w * 0.5, 0.15, h * 0.5), Models.color_mat(Color(0.85, 0.88, 0.9), 0.4))
	var water := Models.plane(root, Vector2(w - 2.8, h - 2.8), Vector3(w * 0.5, 0.33, h * 0.5), _water_mat())
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for i in range(1, 5):
		var z := 1.4 + (h - 2.8) * i / 5.0
		Models.box(root, Vector3(w - 2.8, 0.06, 0.06), Vector3(w * 0.5, 0.36, z), Models.color_mat(Color(0.9, 0.2, 0.2), 0.5))
	root.set_meta("sport", Rect2(1.6, 1.6, w - 3.2, h - 3.2))
	root.set_meta("staff", [Vector3(0.7, 0, h * 0.5), 90.0])


static func _water_mat() -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/water.gdshader")
	return m


static func _room_theater(root: Node3D, w: float, h: float) -> void:
	Models.box(root, Vector3(w - 1.0, 0.8, 2.4), Vector3(w * 0.5, 0.4, 1.4), Models.pbr("laminate_floor_02", 0.4, Color(0.6, 0.45, 0.35)))
	Models.box(root, Vector3(w - 1.0, 2.2, 0.15), Vector3(w * 0.5, 1.9, 0.35), Models.color_mat(Color(0.55, 0.05, 0.08), 0.9))
	root.set_meta("staff", [Vector3(w * 0.5, 0.8, 1.6), 0.0])
	var z := 3.4
	while z < h - 0.6:
		var x := 1.0
		while x < w - 0.8:
			Models.place(root, "furniture/chairCushion", Vector3(x, 0, z), 2.0, 180)
			_seat(root, Vector3(x, 0, z), 180)
			x += 0.9
		z += 1.1


static func _room_cafeteria(root: Node3D, w: float, h: float) -> void:
	var x := 0.6
	while x < w - 0.6:
		Models.place(root, "furniture/kitchenCabinet", Vector3(x, 0, 0.5), 2.0, 0)
		x += 0.9
	Models.place(root, "furniture/kitchenStove", Vector3(1.5, 0, 0.5), 2.0, 0)
	Models.place(root, "furniture/kitchenFridgeLarge", Vector3(w - 0.8, 0, 0.5), 2.0, 0)
	root.set_meta("staff", [Vector3(w * 0.5, 0, 1.25), 0.0])
	var tz := 2.8
	while tz < h - 0.8:
		var tx := 1.6
		while tx < w - 1.4:
			Models.place(root, "furniture/table", Vector3(tx, 0, tz), 2.4, 0)
			for side in [-1, 1]:
				for k in [-0.55, 0.0, 0.55]:
					var p := Vector3(tx + k, 0, tz + side * 0.85)
					Models.place(root, "furniture/chair", p, 2.0, 180.0 if side > 0 else 0.0)
					_seat(root, p, 180.0 if side > 0 else 0.0)
			tx += 2.8
		tz += 2.4


static func _room_library(root: Node3D, w: float, h: float) -> void:
	var x := 0.6
	while x < w - 0.4:
		Models.place(root, "furniture/bookcaseOpen", Vector3(x, 0, 0.35), 2.0, 0)
		x += 0.85
	for row in range(1, 3):
		var bx := 0.8
		while bx < w * 0.45:
			Models.place(root, "furniture/bookcaseClosedWide", Vector3(bx, 0, row * 1.6 + 0.6), 2.0, 0)
			bx += 1.2
	var tz := 1.8
	while tz < h - 0.8:
		Models.place(root, "furniture/table", Vector3(w * 0.72, 0, tz), 2.4, 0)
		for side in [-1, 1]:
			for k in [-0.5, 0.5]:
				var p := Vector3(w * 0.72 + k, 0, tz + side * 0.85)
				Models.place(root, "furniture/chair", p, 2.0, 180.0 if side > 0 else 0.0)
				_seat(root, p, 180.0 if side > 0 else 0.0)
		tz += 2.3
	Models.place(root, "furniture/desk", Vector3(w * 0.5, 0, h - 0.8), 1.6, 180)
	root.set_meta("staff", [Vector3(w * 0.5, 0, h - 0.3), 180.0])


static func _room_restroom(root: Node3D, w: float, h: float) -> void:
	var x := 0.6
	var stall := Models.color_mat(Color(0.55, 0.7, 0.8), 0.4, 0.3)
	while x < w - 0.3:
		Models.place(root, "furniture/toilet", Vector3(x, 0, 0.45), 2.0, 0)
		Models.box(root, Vector3(0.05, 1.6, 1.2), Vector3(x + 0.48, 0.9, 0.6), stall)
		_spot(root, Vector3(x, 0, 1.4), 0)
		x += 0.95
	x = 0.8
	while x < w - 0.5:
		Models.place(root, "furniture/bathroomSink", Vector3(x, 0, h - 0.35), 2.0, 180)
		_spot(root, Vector3(x, 0, h - 1.0), 180)
		x += 1.1


static func _room_student_lounge(root: Node3D, w: float, h: float) -> void:
	Models.place(root, "furniture/rugRounded", Vector3(w * 0.5, 0.05, h * 0.5), 3.0)
	Models.place(root, "furniture/tableCoffee", Vector3(w * 0.5, 0, h * 0.5), 2.2)
	Models.place(root, "furniture/loungeSofaLong", Vector3(w * 0.5, 0, h * 0.5 - 1.6), 2.0, 0)
	Models.place(root, "furniture/loungeSofa", Vector3(w * 0.5, 0, h * 0.5 + 1.6), 2.0, 180)
	for k in [-0.8, 0.0, 0.8]:
		_seat(root, Vector3(w * 0.5 + k, 0, h * 0.5 - 1.5), 0)
	for k in [-0.5, 0.5]:
		_seat(root, Vector3(w * 0.5 + k, 0, h * 0.5 + 1.5), 180)
	Models.place(root, "furniture/televisionModern", Vector3(0.4, 0, h * 0.5), 2.2, 90)
	Models.place(root, "furniture/loungeChair", Vector3(w - 1.0, 0, 1.0), 2.0, -135)
	_seat(root, Vector3(w - 1.0, 0, 1.0), -135)
	Models.place(root, "furniture/pottedPlant", Vector3(0.5, 0, 0.5), 2.0)
	Models.place(root, "furniture/pottedPlant", Vector3(w - 0.5, 0, h - 0.5), 2.0)
	for i in 10:
		_spot(root, Vector3(randf_range(0.8, w - 0.8), 0, randf_range(0.8, h - 0.8)), randf_range(0, 360))


static func _room_nurse_office(root: Node3D, w: float, h: float) -> void:
	Models.place(root, "furniture/bedSingle", Vector3(1.0, 0, h * 0.5), 2.0, 90)
	Models.place(root, "furniture/bedSingle", Vector3(w - 1.0, 0, h * 0.5), 2.0, -90)
	_seat(root, Vector3(1.0, 0.4, h * 0.5), 90)
	_seat(root, Vector3(w - 1.0, 0.4, h * 0.5), -90)
	Models.place(root, "furniture/bathroomCabinet", Vector3(w * 0.5, 0, 0.35), 2.0, 0)
	root.set_meta("staff", [Vector3(w * 0.5, 0, h * 0.5), 0.0])


static func _room_counselor_office(root: Node3D, w: float, h: float) -> void:
	Models.place(root, "furniture/desk", Vector3(w * 0.5, 0, 1.2), 1.8, 0)
	Models.place(root, "furniture/chairDesk", Vector3(w * 0.5, 0, 0.6), 1.8, 0)
	root.set_meta("staff", [Vector3(w * 0.5, 0, 0.6), 0.0])
	Models.place(root, "furniture/loungeChair", Vector3(w * 0.35, 0, h - 1.4), 2.0, 180)
	Models.place(root, "furniture/loungeChair", Vector3(w * 0.68, 0, h - 1.4), 2.0, 180)
	_seat(root, Vector3(w * 0.35, 0, h - 1.4), 180)
	_seat(root, Vector3(w * 0.68, 0, h - 1.4), 180)
	Models.place(root, "furniture/pottedPlant", Vector3(0.5, 0, 0.5), 2.0)


static func _room_principal_office(root: Node3D, w: float, h: float) -> void:
	Models.place(root, "furniture/rugRectangle", Vector3(w * 0.5, 0.05, h * 0.5), 2.5)
	Models.place(root, "furniture/desk", Vector3(w * 0.5, 0, 1.3), 2.0, 0)
	Models.place(root, "furniture/computerScreen", Vector3(w * 0.5, 0.77, 1.35), 2.0, 180)
	Models.place(root, "furniture/chairDesk", Vector3(w * 0.5, 0, 0.6), 2.0, 0)
	root.set_meta("staff", [Vector3(w * 0.5, 0, 0.6), 0.0])
	for k in [-0.7, 0.7]:
		Models.place(root, "furniture/chair", Vector3(w * 0.5 + k, 0, 2.4), 2.0, 180)
		_seat(root, Vector3(w * 0.5 + k, 0, 2.4), 180)
	Models.place(root, "furniture/bookcaseClosedDoors", Vector3(0.5, 0, h * 0.5), 2.0, 90)
	Models.place(root, "furniture/pottedPlant", Vector3(w - 0.5, 0, 0.5), 2.0)


static func _room_staff_room(root: Node3D, w: float, h: float) -> void:
	Models.place(root, "furniture/table", Vector3(w * 0.4, 0, h * 0.55), 2.4, 0)
	for side in [-1, 1]:
		for k in [-0.5, 0.5]:
			var p := Vector3(w * 0.4 + k, 0, h * 0.55 + side * 0.85)
			Models.place(root, "furniture/chair", p, 2.0, 180.0 if side > 0 else 0.0)
			_seat(root, p, 180.0 if side > 0 else 0.0)
	Models.place(root, "furniture/kitchenCabinet", Vector3(w - 1.4, 0, 0.5), 2.0, 0)
	Models.place(root, "furniture/kitchenCoffeeMachine", Vector3(w - 1.4, 0.9, 0.5), 2.0, 0)
	Models.place(root, "furniture/kitchenFridge", Vector3(w - 0.5, 0, 0.5), 2.0, 0)
	Models.place(root, "furniture/loungeSofa", Vector3(w - 1.2, 0, h - 0.7), 2.0, 180)
	_seat(root, Vector3(w - 1.5, 0, h - 0.7), 180)
	_seat(root, Vector3(w - 0.9, 0, h - 0.7), 180)


static func _room_esports_arena(root: Node3D, w: float, h: float) -> void:
	Models.box(root, Vector3(w * 0.7, 1.6, 0.1), Vector3(w * 0.5, 1.6, 0.2), Models.color_mat(Color(0.2, 0.1, 0.4), 0.2, 0, Color(0.45, 0.2, 0.9)))
	_desk_rows(root, w, h, "furniture/desk", "furniture/computerScreen")


static func _room_football_field(root: Node3D, w: float, h: float) -> void:
	Models.plane(root, Vector2(w, h), Vector3(w * 0.5, 0.02, h * 0.5), Models.color_mat(Color(0.55, 0.32, 0.25), 0.9))
	Models.plane(root, Vector2(w - 3.0, h - 4.6), Vector3(w * 0.5, 0.04, h * 0.5 + 0.8), _court_mat("football", w - 3.0, h - 4.6))
	for side in [0, 1]:
		var gx := 1.5 if side == 0 else w - 1.5
		var post := Models.color_mat(Color(0.95, 0.85, 0.15), 0.4, 0.5)
		Models.cylinder(root, 0.08, 3.0, Vector3(gx, 1.5, h * 0.5 + 0.8), post)
		Models.box(root, Vector3(0.1, 0.1, 2.8), Vector3(gx, 3.0, h * 0.5 + 0.8), post)
		Models.cylinder(root, 0.05, 2.2, Vector3(gx, 4.1, h * 0.5 - 0.6), post)
		Models.cylinder(root, 0.05, 2.2, Vector3(gx, 4.1, h * 0.5 + 2.2), post)
	_bleachers(root, Vector3(w * 0.5, 0, -0.3), w - 6.0, 0.0)
	for c in [Vector3(0.4, 0, 0.4), Vector3(w - 0.4, 0, 0.4), Vector3(0.4, 0, h - 0.4), Vector3(w - 0.4, 0, h - 0.4)]:
		Models.spawn(root, "roads/light-square", c, 12.0, 0 if c.x < w * 0.5 else 180)
	var sb := Models.box(root, Vector3(3.5, 1.6, 0.2), Vector3(w * 0.5, 4.6, h - 0.2), Models.color_mat(Color(0.08, 0.08, 0.1), 0.4))
	sb.name = "Scoreboard"
	Models.cylinder(root, 0.12, 3.8, Vector3(w * 0.5, 1.9, h - 0.2), Models.color_mat(Color(0.3, 0.3, 0.32), 0.4, 0.8))
	var lbl := Label3D.new()
	lbl.text = "HOME  %d   AWAY  %d" % [Game.wins, Game.losses]
	lbl.font_size = 40
	lbl.pixel_size = 0.01
	lbl.modulate = Color(1, 0.6, 0.1)
	lbl.position = Vector3(w * 0.5, 4.6, h - 0.32)
	lbl.rotation.y = PI
	root.add_child(lbl)
	root.set_meta("sport", Rect2(3, 4, w - 6, h - 6))
	root.set_meta("staff", [Vector3(w * 0.5, 0, 3.6), 180.0])


static func _court_mat(kind: String, w: float, h: float) -> StandardMaterial3D:
	if not _court_tex.has(kind):
		var img := Image.create(512, 256, false, Image.FORMAT_RGB8)
		var white := Color(0.95, 0.95, 0.95)
		match kind:
			"football":
				for i in 16:
					img.fill_rect(Rect2i(i * 32, 0, 32, 256), Color(0.22, 0.52, 0.2) if i % 2 == 0 else Color(0.25, 0.57, 0.22))
				img.fill_rect(Rect2i(0, 0, 44, 256), Color(0.1, 0.2, 0.55))
				img.fill_rect(Rect2i(468, 0, 44, 256), Color(0.6, 0.12, 0.12))
				for i in 11:
					img.fill_rect(Rect2i(44 + i * 42, 0, 3, 256), white)
				img.fill_rect(Rect2i(0, 0, 512, 3), white)
				img.fill_rect(Rect2i(0, 253, 512, 3), white)
				img.fill_rect(Rect2i(240, 100, 32, 56), Color(0.9, 0.75, 0.15))
			"basket", "gym":
				img.fill(Color(0.72, 0.5, 0.3) if kind == "gym" else Color(0.32, 0.36, 0.4))
				if kind == "basket":
					img.fill_rect(Rect2i(8, 8, 496, 240), Color(0.2, 0.42, 0.6))
				for r in [Rect2i(8, 8, 496, 4), Rect2i(8, 244, 496, 4), Rect2i(8, 8, 4, 240), Rect2i(500, 8, 4, 240), Rect2i(254, 8, 4, 240)]:
					img.fill_rect(r, white)
				for a in 64:
					var ang := a * TAU / 64.0
					img.fill_rect(Rect2i(256 + int(cos(ang) * 36) - 2, 128 + int(sin(ang) * 36) - 2, 4, 4), white)
				img.fill_rect(Rect2i(8, 96, 80, 64), Color(0.75, 0.2, 0.15))
				img.fill_rect(Rect2i(424, 96, 80, 64), Color(0.75, 0.2, 0.15))
		img.generate_mipmaps()
		_court_tex[kind] = ImageTexture.create_from_image(img)
	var m := StandardMaterial3D.new()
	m.albedo_texture = _court_tex[kind]
	m.roughness = 0.6 if kind == "gym" else 0.9
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	return m


# ---------------------------------------------------------------------
#  Decor & small outdoor items
# ---------------------------------------------------------------------

static func _decor(root: Node3D, b: Building) -> void:
	var w := b.size.x * T
	var h := b.size.y * T
	var c := Vector3(w * 0.5, 0, h * 0.5)
	var rng := RandomNumberGenerator.new()
	rng.seed = b.uid
	match b.id:
		"tree":
			var kinds := ["nature/tree_oak", "nature/tree_default", "nature/tree_tall", "nature/tree_simple"]
			Models.spawn(root, kinds[rng.randi() % kinds.size()], c, rng.randf_range(3.6, 4.6), rng.randf_range(0, 360))
		"flowers":
			var kinds := ["nature/flower_redA", "nature/flower_yellowA", "nature/flower_purpleA", "nature/flower_redB", "nature/flower_yellowB", "nature/flower_purpleB"]
			Models.spawn(root, "nature/plant_bush", c, 2.5, rng.randf_range(0, 360))
			for i in 7:
				Models.spawn(root, kinds[rng.randi() % kinds.size()], c + Vector3(rng.randf_range(-0.8, 0.8), 0, rng.randf_range(-0.8, 0.8)), 3.0, rng.randf_range(0, 360))
		"bench":
			Models.place(root, "furniture/bench", c, 2.6, 0)
			_seat(root, c + Vector3(-0.25, 0, 0), 180)
			_seat(root, c + Vector3(0.25, 0, 0), 180)
		"trash_can":
			Models.place(root, "furniture/trashcan", c, 2.6)
		"bulletin_board":
			var wood := Models.color_mat(Color(0.45, 0.3, 0.18), 0.8)
			Models.box(root, Vector3(0.08, 1.8, 0.08), c + Vector3(-0.7, 0.9, 0), wood)
			Models.box(root, Vector3(0.08, 1.8, 0.08), c + Vector3(0.7, 0.9, 0), wood)
			Models.box(root, Vector3(1.6, 1.0, 0.08), c + Vector3(0, 1.4, 0), Models.color_mat(Color(0.75, 0.58, 0.38), 0.95))
			for i in 5:
				Models.box(root, Vector3(0.25, 0.3, 0.02), c + Vector3(-0.55 + i * 0.27, 1.45 + rng.randf_range(-0.2, 0.2), 0.05),
					Models.color_mat(Color.from_hsv(rng.randf(), 0.35, 1.0), 0.9))
		"lamp":
			Models.spawn(root, "roads/light-square", c, 7.0, rng.randi() % 4 * 90)
		"fountain":
			var stone := Models.pbr("concrete_pavement", 0.8, Color(0.9, 0.9, 0.88))
			Models.cylinder(root, 1.7, 0.55, c + Vector3(0, 0.27, 0), stone)
			var water := Models.cylinder(root, 1.5, 0.05, c + Vector3(0, 0.52, 0), _water_mat())
			water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			Models.cylinder(root, 0.25, 1.4, c + Vector3(0, 0.7, 0), stone)
			Models.cylinder(root, 0.7, 0.15, c + Vector3(0, 1.4, 0), stone, 0.5)
		"mascot_statue":
			var stone := Models.pbr("concrete_pavement", 0.8, Color(0.85, 0.85, 0.82))
			Models.box(root, Vector3(1.8, 1.0, 1.8), c + Vector3(0, 0.5, 0), stone)
			var gold := Models.color_mat(Color(0.95, 0.72, 0.25), 0.25, 1.0)
			var bird := Node3D.new()
			bird.position = c + Vector3(0, 1.0, 0)
			root.add_child(bird)
			Models.cylinder(bird, 0.35, 1.3, Vector3(0, 0.65, 0), gold, 0.25)
			var head := MeshInstance3D.new()
			var sm := SphereMesh.new()
			sm.radius = 0.3
			sm.height = 0.6
			head.mesh = sm
			head.material_override = gold
			head.position = Vector3(0, 1.45, 0.05)
			bird.add_child(head)
			Models.box(bird, Vector3(0.12, 0.1, 0.3), Vector3(0, 1.42, 0.35), gold)
			for s in [-1, 1]:
				var wing := Models.box(bird, Vector3(1.3, 0.08, 0.5), Vector3(s * 0.75, 1.1, 0), gold)
				wing.rotation.z = deg_to_rad(s * 30)
		"security_camera":
			var metal := Models.color_mat(Color(0.35, 0.36, 0.38), 0.4, 0.8)
			Models.cylinder(root, 0.06, 3.2, c + Vector3(0, 1.6, 0), metal)
			Models.box(root, Vector3(0.22, 0.2, 0.45), c + Vector3(0, 3.2, 0.2), Models.color_mat(Color(0.9, 0.9, 0.9), 0.4))
			var led := Models.box(root, Vector3(0.05, 0.05, 0.05), c + Vector3(0.06, 3.28, 0.43), Models.color_mat(Color.RED, 0.4, 0, Color.RED))
			led.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		"solar_panels":
			var frame := Models.color_mat(Color(0.7, 0.72, 0.75), 0.4, 0.8)
			var cell := Models.color_mat(Color(0.08, 0.12, 0.3), 0.15, 0.6)
			for row in 2:
				for k in 3:
					var p := Vector3(1.0 + k * 2.0, 0.9, 1.0 + row * 2.0)
					Models.box(root, Vector3(0.08, 0.9, 0.08), p - Vector3(0, 0.45, 0), frame)
					var panel := Models.box(root, Vector3(1.8, 0.05, 1.4), p, cell)
					panel.rotation.x = deg_to_rad(-25)

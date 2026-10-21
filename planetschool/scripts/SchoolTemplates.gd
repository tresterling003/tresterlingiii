class_name SchoolTemplates
extends RefCounted
## Example schools for the career scenarios. They are assembled from exactly
## the same floors, walls, roofs and rooms the player builds with, so every
## piece can be edited or bulldozed afterwards.

const DRYWALL := 1
const BRICK_TAN := 6
const BRICK_RED := 7
const BRICK_DARK := 8
const FACADE := 9
const METAL_NAVY := 10

const SOLID := 1
const WINDOW := 2
const DOORWAY := 3
const GLASS := 4
const GLASS_DOORS := 5
const RAILING := 6


static func _floor_rect(g, x0: int, y0: int, x1: int, y1: int, lv: int, mat: int, inside := {}) -> void:
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			var c := Vector3i(x, y, lv)
			g.set_floor(c, mat, true)
			inside[c] = true


static func _room(g, id: String, x: int, y: int, lv: int, inside := {}, rot := 0) -> Building:
	var b: Building = g.place_building(id, Vector2i(x, y), true, lv, rot)
	if b == null:
		push_warning("Template could not place %s at %d,%d L%d" % [id, x, y, lv])
		return null
	for l in range(b.level, b.level + b.span()):
		for yy in b.size.y:
			for xx in b.size.x:
				inside[Vector3i(x + xx, y + yy, l)] = true
	return b


## Interior walls around a room: glass or drywall fronts where it faces open
## floor (with one doorway near the middle), drywall elsewhere.
static func _wall_room(g, b: Building, glass_front: bool, mat := DRYWALL) -> void:
	var edges: Array = g.edges_between(b.pos, b.pos + b.size, b.level)
	var front: Array = []
	for e in edges:
		var out: Vector3i = g._edge_outside_cell(e, b)
		if g.in_cell(out) and g.building_at_cell(out) == null and g.floor_at(out) > 0:
			front.append(e)
	var door := Vector4i(-1, -1, -1, -1)
	var best := INF
	var mid := Vector2(b.pos) + Vector2(b.size) * 0.5
	for e in front:
		var d := (Vector2(e.x + 0.5, e.y + 0.5) - mid).length()
		if d < best:
			best = d
			door = e
	for e in edges:
		var style := Data.wall_style(mat, SOLID)
		if e == door:
			style = Data.wall_style(mat, DOORWAY)
		elif e in front and glass_front:
			style = Data.wall_style(mat, GLASS)
		g.set_wall(e, style, true)


## Outer walls wherever an inside cell meets an outside cell on that level.
static func _envelope(g, inside: Dictionary, lv: int, style_fn: Callable) -> void:
	for c in inside:
		if c.z != lv:
			continue
		var n := [[Vector3i(c.x, c.y - 1, lv), Vector4i(c.x, c.y, lv, 0), "N"], [Vector3i(c.x, c.y + 1, lv), Vector4i(c.x, c.y + 1, lv, 0), "S"],
			[Vector3i(c.x - 1, c.y, lv), Vector4i(c.x, c.y, lv, 1), "W"], [Vector3i(c.x + 1, c.y, lv), Vector4i(c.x + 1, c.y, lv, 1), "E"]]
		for e in n:
			if not inside.has(e[0]):
				g.set_wall(e[1], style_fn.call(c, e[2]), true)


static func _hire(g, role: String, subj: String, skill: int, n := 1) -> void:
	for i in n:
		var p: Person = g._make_staff(role, subj, skill + (randi() % 2))
		g._add_person(p)


# =====================================================================
#  Eagle Ridge High: modern two-story Texas mega school
# =====================================================================

static func build_mega(g) -> void:
	for r in ["aquatics", "drama", "comp_sci", "ap_courses"]:
		g.research_done[r] = true
	var inside := {}
	# ---- Ground floor -------------------------------------------------
	_floor_rect(g, 8, 19, 61, 20, 0, 2, inside)  # main corridor
	_floor_rect(g, 34, 21, 38, 30, 0, 3, inside)  # entrance lobby (double height)
	_floor_rect(g, 16, 21, 16, 22, 0, 2, inside)  # stair bay
	var north0 := [["gymnasium", 8, 13], ["pool", 16, 13], ["weight_room", 24, 15], ["cafeteria", 29, 14],
		["commons", 36, 14], ["staff_room", 42, 16], ["theater", 46, 13], ["music_room", 53, 15], ["art_studio", 58, 16]]
	var south0 := [["math_room", 8, 21], ["english_room", 12, 21], ["restroom", 16, 23], ["history_room", 21, 21],
		["language_room", 25, 21], ["science_lab", 29, 21], ["principal_office", 39, 21], ["nurse_office", 44, 21],
		["counselor_office", 47, 21], ["restroom", 50, 21], ["library", 55, 21]]
	var rooms0: Array = []
	for r in north0 + south0:
		rooms0.append(_room(g, r[0], r[1], r[2], 0, inside))
	_room(g, "stairs", 17, 21, 0, inside, 1)  # east end goes up
	_room(g, "stairs", 34, 21, 0, inside, 0)  # grand stair in the lobby, north end up
	_room(g, "elevator", 53, 21, 0, inside)
	_room(g, "lockers", 36, 23, 0, inside)
	_room(g, "lockers", 36, 25, 0, inside)
	_room(g, "vending", 38, 27, 0, inside)
	_room(g, "vending", 38, 28, 0, inside)
	_room(g, "trophy_case", 34, 30, 0, inside)
	_room(g, "planter", 38, 30, 0, inside)
	_room(g, "planter", 34, 26, 0, inside)
	_room(g, "bulletin_board", 38, 24, 0, inside)
	for b in rooms0:
		if b == null:
			continue
		var glass: bool = b.subject() != "" and not b.id in ["gymnasium", "theater", "music_room"]
		_wall_room(g, b, glass or b.id in ["commons", "library", "principal_office"])
	# keep people from stepping onto the top of the grand stair from the corridor
	for x in [34, 35]:
		g.set_wall(Vector4i(x, 21, 0, 0), Data.wall_style(DRYWALL, RAILING), true)
	for x in range(17, 21):
		g.set_wall(Vector4i(x, 21, 0, 0), Data.wall_style(DRYWALL, RAILING), true)

	# ---- Second floor -------------------------------------------------
	var inside1 := {}
	_floor_rect(g, 8, 19, 61, 20, 1, 2, inside1)
	_floor_rect(g, 16, 21, 16, 22, 1, 2, inside1)
	_floor_rect(g, 51, 21, 52, 22, 1, 2, inside1)
	var rooms1: Array = []
	for r in [["computer_lab", 24, 16], ["science_lab", 29, 16], ["restroom", 34, 17], ["math_room", 42, 16],
			["english_room", 53, 16], ["history_room", 57, 16], ["math_room", 8, 21], ["english_room", 12, 21],
			["restroom", 16, 23], ["history_room", 21, 21], ["language_room", 25, 21], ["science_lab", 29, 21],
			["math_room", 39, 21], ["english_room", 43, 21], ["history_room", 47, 21], ["science_lab", 55, 21]]:
		rooms1.append(_room(g, r[0], r[1], r[2], 1, inside1))
	for b in rooms1:
		if b:
			_wall_room(g, b, b.subject() != "")
	# Double-height spaces: gym, natatorium, commons, arts center, lobby. Their
	# upper walls are drywall shells; the corridor gets glass railings.
	for b in rooms0:
		if b and b.id in ["gymnasium", "pool", "theater"]:
			for e in g.edges_between(b.pos, b.pos + b.size, 1):
				g.set_wall(e, Data.wall_style(DRYWALL, SOLID), true)
			for y in b.size.y:
				for x in b.size.x:
					inside1[Vector3i(b.pos.x + x, b.pos.y + y, 1)] = true
	for x in range(36, 42):  # commons atrium edge
		g.set_wall(Vector4i(x, 19, 1, 0), Data.wall_style(DRYWALL, RAILING), true)
	for y in range(14, 19):
		for x in range(36, 42):
			inside1[Vector3i(x, y, 1)] = true
	for x in range(36, 39):  # lobby atrium edge (stair top stays open)
		g.set_wall(Vector4i(x, 21, 1, 0), Data.wall_style(DRYWALL, RAILING), true)
	for x in range(17, 20):  # stair void
		g.set_wall(Vector4i(x, 21, 1, 0), Data.wall_style(DRYWALL, RAILING), true)
	for y in range(21, 31):
		for x in range(34, 39):
			inside1[Vector3i(x, y, 1)] = true
	for y in range(15, 19):  # above the weight room's spare row
		inside1[Vector3i(24, y, 1)] = true
		for x in range(24, 29):
			inside1[Vector3i(x, y, 1)] = true
	# fill the remaining footprint so the upper envelope matches the ground floor
	for c in inside.keys():
		var up := Vector3i(c.x, c.y, 1)
		if not inside1.has(up):
			inside1[up] = true

	# ---- Exterior: tan brick with windows, glass lobby, dark brick athletics ----
	var ext := func(c: Vector3i, side: String) -> int:
		if c.x >= 34 and c.x <= 38 and c.y >= 21:
			if c.z == 0 and side == "S" and c.x >= 35 and c.x <= 37:
				return Data.wall_style(FACADE, GLASS_DOORS)
			return Data.wall_style(FACADE, GLASS)
		if c.y >= 19 and c.y <= 20 and (side == "W" or side == "E"):
			return Data.wall_style(FACADE, GLASS_DOORS if c.z == 0 else GLASS)
		if c.x <= 23 and c.y <= 18:
			return Data.wall_style(BRICK_DARK, SOLID if c.z == 0 else WINDOW)
		if c.x >= 46 and c.x <= 52 and c.y <= 18:
			return Data.wall_style(METAL_NAVY, SOLID)
		return Data.wall_style(BRICK_TAN, WINDOW if (c.x + c.y) % 2 == 0 else SOLID)
	_envelope(g, inside, 0, ext)
	_envelope(g, inside1, 1, ext)
	# Roof over everything; solar on the athletics wing.
	for c in inside1:
		var kind := 3 if c.x <= 23 and c.y <= 18 else 1
		if c.x >= 34 and c.x <= 38 and c.y >= 21:
			kind = 2
		g.set_roof(c, kind, true)

	# ---- Site ------------------------------------------------------------
	_floor_rect(g, 34, 31, 38, 46, 0, 1)  # front walk to the bus loop
	_floor_rect(g, 28, 32, 44, 35, 0, 1)  # front plaza
	_floor_rect(g, 6, 19, 7, 33, 0, 1)  # west exit to stadium
	_floor_rect(g, 6, 33, 27, 33, 0, 1)
	_floor_rect(g, 62, 19, 63, 33, 0, 1)  # east exit to parking
	_floor_rect(g, 45, 33, 63, 33, 0, 1)
	_room(g, "football_field", 4, 34, 0)
	_room(g, "basketball_court", 20, 34, 0)
	for p in [Vector2i(46, 34), Vector2i(52, 34), Vector2i(58, 34), Vector2i(46, 38), Vector2i(52, 38), Vector2i(58, 38)]:
		_room(g, "parking_lot", p.x, p.y, 0)
	_room(g, "fountain", 30, 33, 0)
	_room(g, "mascot_statue", 41, 33, 0)
	for x in [32, 40]:
		_room(g, "flagpole", x, 36, 0)
	_room(g, "marquee", 40, 44, 0)
	for x in range(10, 33, 3):
		_room(g, "tree", x, 45, 0)
	for x in range(42, 68, 3):
		_room(g, "tree", x, 45, 0)
	for y in range(36, 44, 3):
		_room(g, "tree", 31, y, 0)
		_room(g, "tree", 42, y, 0)
	for p in [Vector2i(29, 36), Vector2i(43, 36), Vector2i(33, 31), Vector2i(39, 31), Vector2i(28, 31), Vector2i(44, 31)]:
		_room(g, "flowers", p.x, p.y, 0)
	for p in [Vector2i(33, 34), Vector2i(39, 34)]:
		_room(g, "bench", p.x, p.y, 0)
	for p in [Vector2i(36, 36), Vector2i(36, 41)]:
		_room(g, "lamp", p.x - 3, p.y, 0)
		_room(g, "lamp", p.x + 3, p.y, 0)
	for y in range(8, 12):
		for x in range(8, 61, 4):
			if randf() < 0.5:
				_room(g, "tree", x + randi() % 3, y, 0)

	# ---- People ------------------------------------------------------------
	for b in g.buildings:
		if b.required_staff() == "teacher":
			_hire(g, "teacher", b.subject(), 3)
	_hire(g, "lunch", "", 3, 1)
	_hire(g, "nurse", "", 3)
	_hire(g, "counselor", "", 3)
	_hire(g, "coach", "", 4)
	_hire(g, "janitor", "", 3, 5)
	_hire(g, "security", "", 3, 3)
	for i in 420:
		var st: Person = g._make_student(9 + randi() % 4)
		g._add_person(st)


# =====================================================================
#  Riverside High: an old open-air campus of separate buildings
# =====================================================================

static func build_riverside(g) -> void:
	_floor_rect(g, 36, 14, 36, 46, 0, 1)
	_floor_rect(g, 18, 25, 55, 25, 0, 1)
	_floor_rect(g, 24, 20, 24, 24, 0, 1)
	_floor_rect(g, 48, 20, 48, 24, 0, 1)
	var layout := [["math_room", 31, 22], ["english_room", 38, 22], ["history_room", 31, 26], ["science_lab", 38, 26],
		["restroom", 25, 23], ["cafeteria", 44, 26], ["gymnasium", 16, 26], ["lockers", 32, 30], ["vending", 35, 30],
		["staff_room", 49, 21]]
	for item in layout:
		var b: Building = g.place_building(item[0], Vector2i(item[1], item[2]), true)
		if b == null:
			continue
		b.cleanliness = randf_range(20, 45)
		b.condition = randf_range(40, 65)
		if b.id in ["lockers", "vending"]:
			continue
		g.build_room_walls(b, Data.wall_style(BRICK_RED, WINDOW), true)
		for y in b.size.y:
			for x in b.size.x:
				g.set_roof(Vector3i(b.pos.x + x, b.pos.y + y, 0), 1, true)
	for p in [Vector2i(30, 20), Vector2i(43, 20), Vector2i(28, 32), Vector2i(45, 33), Vector2i(20, 35), Vector2i(52, 30)]:
		g.place_building("tree", p, true)
	g._rebuild_nav()
	for subj in ["Math", "English", "History"]:
		var t: Person = g._make_staff("teacher", subj, 1 + randi() % 2)
		t.morale = 40
		g._add_person(t)
	g._add_person(g._make_staff("lunch", "", 1))
	for i in 70:
		var st: Person = g._make_student(9 + randi() % 4)
		st.gpa = randf_range(1.2, 2.6)
		st.happiness = randf_range(25, 55)
		st.stress = randf_range(40, 70)
		g._add_person(st)
	for i in 60:
		var c := Vector3i(randi_range(18, 54), randi_range(16, 40), 0)
		if g.floor_at(c) > 0:
			g.add_litter(c, randi_range(1, 3))
	g.incidents = 12

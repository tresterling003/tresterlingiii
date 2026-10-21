extends Node
## Core simulation: campus grid, clock, students, staff, economy, ratings,
## events and save/load. The World node draws this state; the UI reads it.

signal notify(text: String, kind: String)  # kind: info, good, bad, money, event
signal changed  # coarse "something in the HUD may have changed"
signal map_changed
signal selection_changed(obj)
signal scenario_won(name: String)
signal game_started
signal fight_happened(uid: int)

const W := 72
const H := 48
const LEVELS := 3
const TILE := 32
const GATE := Vector2i(36, 47)
const GATE_CELL := Vector3i(36, 47, 0)

# Daily timetable, in minutes after midnight.
const DAY_START := 450  # 7:30 staff and students start arriving
const PERIODS := [480, 540, 600, 720, 780, 840]  # six 50-minute periods
const PERIOD_LEN := 50
const LUNCH_START := 660
const LUNCH_END := 710
const AFTER_START := 900
const LEAVE_TIME := 990
const STAFF_LEAVE := 1000
const DAY_END := 1020
const DAYS_PER_YEAR := 60
const DAYS_PER_SEMESTER := 30
const SEC_PER_MIN := 0.5  # real seconds per game minute at 1x
const WALK_TILES_PER_MIN := 3.0
const WEEKDAYS := ["Mon", "Tue", "Wed", "Thu", "Fri"]

var running := false
var paused := false
var speed := 1
var _acc := 0.0

var scenario_id := "fresh_start"
var school_name := "Sterling High"
var team_name := "Eagles"
var money := 0
var loan := 0
var day := 1
var minute := DAY_START
var next_uid := 1

var buildings: Array = []
var bld_by_uid := {}
var people: Array = []
var person_by_uid := {}
# Per-cell layers, indexed by cidx(Vector3i(x, y, level)).
var grid_bld := PackedInt32Array()  # building uid, -1 if empty
var grid_floor := PackedByteArray()  # floor material id (Data.FLOORS), 0 = none
var grid_roof := PackedByteArray()  # roof type (Data.ROOFS) covering this cell, 0 = none
# Walls live on tile edges. walls_h: top edge of tile (x, y); walls_v: left edge of tile (x, y).
var walls_h := PackedByteArray()
var walls_v := PackedByteArray()
var litter := {}  # Vector3i -> pieces of trash
var reachable := {}  # Vector3i -> true, cells walkable from the gate
var astar := AStar3D.new()

var research_done := {}
var research_current := ""
var research_progress := 0.0

var policies := {"tuition": 0, "lunch_price": 4, "phones": "allow", "uniforms": false, "homework": "normal"}
var rating := {"academics": 50.0, "welfare": 70.0, "safety": 80.0, "cleanliness": 90.0,
	"facilities": 0.0, "attendance": 100.0, "overall": 40.0}
var incidents := 0.0  # recent misbehavior, decays daily
var incident_tile := Vector3i(-1, -1, 0)
var wins := 0
var losses := 0
var graduates := 0
var won_scenario := false
var day_off := false  # snow day etc.

var finance_today := {}
var finance_history: Array = []  # last 30 days of {income, expense, net}
var hire_pool: Array = []
var selected = null
var _batch := 0  # >0 while building many pieces at once (skips nav rebuilds)


func _ready() -> void:
	_clear()
	_make_gate()


# =====================================================================
#  Setup
# =====================================================================

func new_game(scen: String, name_: String) -> void:
	_clear()
	scenario_id = scen
	school_name = name_ if name_.strip_edges() != "" else "Sterling High"
	team_name = Data.TEAM_NAMES.pick_random()
	var s: Dictionary = Data.SCENARIOS[scen]
	money = s["money"]
	if scen == "sandbox":
		for r in Data.RESEARCH:
			research_done[r] = true
	_make_gate()
	begin_batch()
	match s["prebuilt"]:
		"mega":
			team_name = "Eagles"
			if name_.strip_edges() in ["", "Sterling High"]:
				school_name = "Eagle Ridge High"
			SchoolTemplates.build_mega(self)
		"riverside":
			SchoolTemplates.build_riverside(self)
		_:
			for y in range(GATE.y - 4, GATE.y):
				set_floor(Vector3i(GATE.x, y, 0), 1)
	end_batch()
	_refresh_hire_pool()
	compute_ratings()
	running = true
	paused = false
	speed = 1
	start_day()
	game_started.emit()
	map_changed.emit()
	notify.emit("Welcome to %s, home of the %s!" % [school_name, team_name], "good")
	if s["prebuilt"] == "":
		notify.emit("Tip: paint floors from the gate, draw walls with doorways, then place classrooms. Use the level buttons to build upstairs.", "info")
		notify.emit("Tip: hire a teacher for every classroom, and add Restrooms and a Cafeteria.", "info")


func _clear() -> void:
	buildings.clear()
	bld_by_uid.clear()
	people.clear()
	person_by_uid.clear()
	litter.clear()
	research_done.clear()
	research_current = ""
	research_progress = 0.0
	grid_bld = PackedInt32Array()
	grid_bld.resize(W * H * LEVELS)
	grid_bld.fill(-1)
	grid_floor = PackedByteArray()
	grid_floor.resize(W * H * LEVELS)
	grid_floor.fill(0)
	grid_roof = PackedByteArray()
	grid_roof.resize(W * H * LEVELS)
	grid_roof.fill(0)
	walls_h = PackedByteArray()
	walls_h.resize(W * (H + 1) * LEVELS)
	walls_h.fill(0)
	walls_v = PackedByteArray()
	walls_v.resize((W + 1) * H * LEVELS)
	walls_v.fill(0)
	policies = {"tuition": 0, "lunch_price": 4, "phones": "allow", "uniforms": false, "homework": "normal"}
	day = 1
	minute = DAY_START
	next_uid = 1
	loan = 0
	wins = 0
	losses = 0
	graduates = 0
	incidents = 0.0
	won_scenario = false
	finance_today = {}
	finance_history.clear()
	selected = null
	_batch = 0


func _make_gate() -> void:
	for x in range(GATE.x - 1, GATE.x + 2):
		grid_floor[cidx(Vector3i(x, GATE.y, 0))] = Data.GATE_FLOOR


## Group many construction calls; navigation is rebuilt once at the end.
func begin_batch() -> void:
	_batch += 1


func end_batch() -> void:
	_batch = maxi(0, _batch - 1)
	if _batch == 0:
		_rebuild_nav()
		auto_assign_staff()
		map_changed.emit()
		changed.emit()


func _after_edit() -> void:
	if _batch > 0:
		return
	_rebuild_nav()
	auto_assign_staff()
	map_changed.emit()
	changed.emit()


# =====================================================================
#  Grid helpers
# =====================================================================

func in_bounds(t: Vector2i) -> bool:
	return t.x >= 0 and t.y >= 0 and t.x < W and t.y < H


func in_cell(c: Vector3i) -> bool:
	return c.x >= 0 and c.y >= 0 and c.x < W and c.y < H and c.z >= 0 and c.z < LEVELS


func cidx(c: Vector3i) -> int:
	return (c.z * H + c.y) * W + c.x


func cell_of(id: int) -> Vector3i:
	var lv := id / (W * H)
	var r := id % (W * H)
	return Vector3i(r % W, r / W, lv)


func floor_at(c: Vector3i) -> int:
	return grid_floor[cidx(c)] if in_cell(c) else 0


func roof_at(c: Vector3i) -> int:
	return grid_roof[cidx(c)] if in_cell(c) else 0


func building_at(t: Vector2i, lv := 0) -> Building:
	return building_at_cell(Vector3i(t.x, t.y, lv))


func building_at_cell(c: Vector3i) -> Building:
	if not in_cell(c):
		return null
	var u := grid_bld[cidx(c)]
	return bld_by_uid.get(u) if u >= 0 else null


func is_walkable(c: Vector3i) -> bool:
	if not in_cell(c):
		return false
	var b := building_at_cell(c)
	if b != null:
		if b.is_decor() or b.capacity() == 0:
			return false
		if b.id == "stairs" and c.z > b.level:
			return Vector2i(c.x, c.y) in b.stair_top_tiles()
		return true
	return grid_floor[cidx(c)] > 0


func tile_center(t: Vector2i) -> Vector2:
	return (Vector2(t) + Vector2(0.5, 0.5)) * TILE


# ---- walls -----------------------------------------------------------
# An edge is Vector4i(x, y, level, dir): dir 0 = top edge of tile (x, y),
# dir 1 = left edge of tile (x, y).

func edge_valid(e: Vector4i) -> bool:
	if e.z < 0 or e.z >= LEVELS:
		return false
	if e.w == 0:
		return e.x >= 0 and e.x < W and e.y >= 0 and e.y <= H
	return e.x >= 0 and e.x <= W and e.y >= 0 and e.y < H


func _eidx(e: Vector4i) -> int:
	if e.w == 0:
		return (e.z * (H + 1) + e.y) * W + e.x
	return (e.z * H + e.y) * (W + 1) + e.x


func get_wall(e: Vector4i) -> int:
	if not edge_valid(e):
		return 0
	return walls_h[_eidx(e)] if e.w == 0 else walls_v[_eidx(e)]


func _set_wall_raw(e: Vector4i, style: int) -> void:
	if e.w == 0:
		walls_h[_eidx(e)] = style
	else:
		walls_v[_eidx(e)] = style


## The wall style between two orthogonally adjacent cells on the same level.
func wall_between(a: Vector3i, b: Vector3i) -> int:
	if a.x == b.x:
		return get_wall(Vector4i(a.x, maxi(a.y, b.y), a.z, 0))
	return get_wall(Vector4i(maxi(a.x, b.x), a.y, a.z, 1))


## Edges along a straight line between two grid vertices, or the outline of
## the rectangle they span.
func edges_between(a: Vector2i, b: Vector2i, lv: int) -> Array:
	var out: Array = []
	var x0 := mini(a.x, b.x)
	var x1 := maxi(a.x, b.x)
	var y0 := mini(a.y, b.y)
	var y1 := maxi(a.y, b.y)
	if a.y == b.y or a.x != b.x:
		for x in range(x0, x1):
			out.append(Vector4i(x, y0, lv, 0))
			if y1 != y0:
				out.append(Vector4i(x, y1, lv, 0))
	if a.x == b.x or a.y != b.y:
		for y in range(y0, y1):
			out.append(Vector4i(x0, y, lv, 1))
			if x1 != x0:
				out.append(Vector4i(x1, y, lv, 1))
	return out


func _edge_blocked_for_gate(e: Vector4i) -> bool:
	return e.z == 0 and e.w == 0 and e.y == GATE.y and e.x >= GATE.x - 1 and e.x <= GATE.x + 1


func set_wall(e: Vector4i, style: int, free := false) -> bool:
	if not edge_valid(e) or _edge_blocked_for_gate(e) or get_wall(e) == style:
		return false
	if style > 0:
		var cost := Data.wall_cost(style)
		if not free:
			if money < cost:
				return false
			spend(cost, "Construction")
	_set_wall_raw(e, style)
	_after_edit()
	return true


# ---- floors & roofs --------------------------------------------------

func can_floor(c: Vector3i, mat: int) -> bool:
	if not in_cell(c) or c.y >= GATE.y or building_at_cell(c) != null:
		return false
	if Data.FLOORS[mat].get("outdoor", false) and c.z > 0:
		return false
	return grid_floor[cidx(c)] != mat


func set_floor(c: Vector3i, mat: int, free := false) -> bool:
	if mat > 0 and not can_floor(c, mat):
		return false
	if mat == 0 and (not in_cell(c) or grid_floor[cidx(c)] in [0, Data.GATE_FLOOR]):
		return false
	if mat > 0 and not free:
		var cost: int = Data.FLOORS[mat]["cost"]
		if money < cost:
			return false
		spend(cost, "Construction")
	grid_floor[cidx(c)] = mat
	_after_edit()
	return true


func set_roof(c: Vector3i, kind: int, free := false) -> bool:
	if not in_cell(c) or grid_roof[cidx(c)] == kind:
		return false
	if kind > 0 and not free:
		var cost: int = Data.ROOFS[kind]["cost"]
		if money < cost:
			return false
		spend(cost, "Construction")
	grid_roof[cidx(c)] = kind
	_after_edit()
	return true


# ---- rooms & objects -------------------------------------------------

func can_place(id: String, at: Vector2i, lv := 0, rot := 0) -> String:
	var d: Dictionary = Data.BUILDINGS[id]
	var sz := Building.footprint(id, rot)
	if d.has("unlock") and not research_done.has(d["unlock"]):
		return "Needs curriculum: %s" % Data.RESEARCH[d["unlock"]]["name"]
	if money < d["cost"]:
		return "Not enough money"
	if d.get("outdoor", false) and lv > 0:
		return "Only on the ground floor"
	var span: int = d.get("span", 1)
	if lv + span > LEVELS:
		return "No floor above to connect to"
	for l in range(lv, lv + span):
		for y in sz.y:
			for x in sz.x:
				var t := at + Vector2i(x, y)
				if not in_bounds(t) or t.y >= GATE.y:
					return "Out of bounds"
				if grid_bld[cidx(Vector3i(t.x, t.y, l))] >= 0:
					return "Space is occupied"
	return ""


func place_building(id: String, at: Vector2i, free := false, lv := 0, rot := 0, wall_style := 0) -> Building:
	if not free and can_place(id, at, lv, rot) != "":
		return null
	var d: Dictionary = Data.BUILDINGS[id]
	var b := Building.new()
	b.uid = _uid()
	b.id = id
	b.pos = at
	b.level = lv
	b.rot = rot
	b.size = Building.footprint(id, rot)
	buildings.append(b)
	bld_by_uid[b.uid] = b
	for l in range(lv, lv + b.span()):
		for y in b.size.y:
			for x in b.size.x:
				grid_bld[cidx(Vector3i(at.x + x, at.y + y, l))] = b.uid
	if not free:
		spend(d["cost"], "Construction")
	if wall_style > 0 and not b.is_decor():
		begin_batch()
		build_room_walls(b, wall_style, free)
		end_batch()
	else:
		_after_edit()
	return b


## Optional convenience: wall a room in with one doorway facing a walkable neighbor.
func build_room_walls(b: Building, style: int, free := false) -> void:
	var lv := b.level
	var mat := Data.wall_mat(style)
	var edges := edges_between(b.pos, b.pos + b.size, lv)
	var door := Vector4i(-1, -1, -1, -1)
	var best := INF
	var mid := Vector2(b.pos) + Vector2(b.size) * 0.5
	for e in edges:
		var outside := _edge_outside_cell(e, b)
		if not is_walkable(outside):
			continue
		var d := (Vector2(e.x, e.y) - mid).length() + (0.0 if building_at_cell(outside) == null else 3.0)
		if d < best:
			best = d
			door = e
	if door.x < 0:
		door = Vector4i(b.pos.x + b.size.x / 2, b.pos.y + b.size.y, lv, 0)
	for e in edges:
		if get_wall(e) == 0 or e == door:
			set_wall(e, Data.wall_style(mat, 3) if e == door else style, free)


func _edge_outside_cell(e: Vector4i, b: Building) -> Vector3i:
	if e.w == 0:
		return Vector3i(e.x, e.y - 1 if e.y == b.pos.y else e.y, e.z)
	return Vector3i(e.x - 1 if e.x == b.pos.x else e.x, e.y, e.z)


## Remove everything in a rectangle on one level. filter: all, rooms, walls, floors, roofs.
func bulldoze_rect(r: Rect2i, lv: int, filter := "all") -> bool:
	var any := false
	begin_batch()
	if filter in ["all", "rooms"]:
		var seen := {}
		for y in range(r.position.y, r.end.y):
			for x in range(r.position.x, r.end.x):
				var b := building_at(Vector2i(x, y), lv)
				if b and not seen.has(b.uid):
					seen[b.uid] = true
					remove_building(b)
					any = true
	if filter in ["all", "walls"]:
		for e in edges_between(r.position, r.end, lv):
			if get_wall(e) > 0:
				_set_wall_raw(e, 0)
				any = true
		for y in range(r.position.y, r.end.y):
			for x in range(r.position.x + 1, r.end.x):
				var e := Vector4i(x, y, lv, 1)
				if get_wall(e) > 0:
					_set_wall_raw(e, 0)
					any = true
		for y in range(r.position.y + 1, r.end.y):
			for x in range(r.position.x, r.end.x):
				var e := Vector4i(x, y, lv, 0)
				if get_wall(e) > 0:
					_set_wall_raw(e, 0)
					any = true
	for y in range(r.position.y, r.end.y):
		for x in range(r.position.x, r.end.x):
			var c := Vector3i(x, y, lv)
			if not in_cell(c):
				continue
			if filter in ["all", "floors"] and grid_floor[cidx(c)] > 0 and grid_floor[cidx(c)] != Data.GATE_FLOOR:
				grid_floor[cidx(c)] = 0
				any = true
			if filter in ["all", "roofs"] and grid_roof[cidx(c)] > 0:
				grid_roof[cidx(c)] = 0
				any = true
			if filter == "all" and litter.has(c):
				litter.erase(c)
	end_batch()
	return any


func remove_building(b: Building) -> void:
	var refund := int(b.def()["cost"] * 0.5)
	earn(refund, "Construction")
	for l in range(b.level, b.level + b.span()):
		for y in b.size.y:
			for x in b.size.x:
				grid_bld[cidx(Vector3i(b.pos.x + x, b.pos.y + y, l))] = -1
	buildings.erase(b)
	bld_by_uid.erase(b.uid)
	for p in people:
		if p.assigned_uid == b.uid:
			p.assigned_uid = -1
		if p.dest_uid == b.uid or p.class_uid == b.uid:
			_reset_person(p)
	if selected == b:
		select(null)
	if _batch == 0:
		notify.emit("Demolished %s (+$%d refund)" % [b.display_name(), refund], "money")
	_after_edit()


## Recompute the walk graph (walls block, doors pass, stairs connect floors),
## what is reachable from the gate, and decor appeal.
func _rebuild_nav() -> void:
	astar.clear()
	var walk := PackedByteArray()
	walk.resize(W * H * LEVELS)
	for lv in LEVELS:
		for y in H:
			for x in W:
				var c := Vector3i(x, y, lv)
				if is_walkable(c):
					var i := cidx(c)
					walk[i] = 1
					astar.add_point(i, Vector3(x, lv * 3.0, y))
	for lv in LEVELS:
		for y in H:
			for x in W:
				var i := cidx(Vector3i(x, y, lv))
				if walk[i] == 0:
					continue
				if x + 1 < W and walk[i + 1] == 1 and Data.wall_passable(walls_v[_eidx(Vector4i(x + 1, y, lv, 1))]):
					astar.connect_points(i, i + 1)
				if y + 1 < H and walk[i + W] == 1 and Data.wall_passable(walls_h[_eidx(Vector4i(x, y + 1, lv, 0))]):
					astar.connect_points(i, i + W)
	for b in buildings:
		if not b.is_connector():
			continue
		var tiles: Array = b.stair_top_tiles() if b.id == "stairs" else []
		if b.id == "elevator":
			for y in b.size.y:
				for x in b.size.x:
					tiles.append(b.pos + Vector2i(x, y))
		for t in tiles:
			var a := cidx(Vector3i(t.x, t.y, b.level))
			var c := cidx(Vector3i(t.x, t.y, b.level + 1))
			if astar.has_point(a) and astar.has_point(c):
				astar.connect_points(a, c)
	reachable.clear()
	var start := cidx(GATE_CELL)
	if astar.has_point(start):
		var stack: Array = [start]
		reachable[GATE_CELL] = true
		while not stack.is_empty():
			var i: int = stack.pop_back()
			for n in astar.get_point_connections(i):
				var nc := cell_of(n)
				if not reachable.has(nc):
					reachable[nc] = true
					stack.append(n)
	for b in buildings:
		if b.is_decor() or b.capacity() == 0:
			b.connected = _touches_reachable(b)
		else:
			b.connected = reachable.has(Vector3i(b.pos.x, b.pos.y, b.level))
		b.appeal = 0.0
	for d in buildings:
		var ap: float = d.def().get("appeal", 0)
		if ap <= 0:
			continue
		for b in buildings:
			if b.is_decor() or b.level != d.level:
				continue
			if b.center_px().distance_to(d.center_px()) < 7 * TILE:
				b.appeal += ap
	# Anyone left standing somewhere unwalkable goes back to the gate.
	for p in people:
		if p.present and not reachable.has(p.cell()):
			p.pos = tile_center(GATE)
			p.level = 0
			_reset_person(p)


func _touches_reachable(b: Building) -> bool:
	for y in range(-1, b.size.y + 1):
		for x in range(-1, b.size.x + 1):
			if reachable.has(Vector3i(b.pos.x + x, b.pos.y + y, b.level)):
				return true
	return false


func find_path(from: Vector3i, to: Vector3i) -> Array:
	if not reachable.has(from) or not reachable.has(to):
		return []
	if from == to:
		return [to]
	var ids := astar.get_id_path(cidx(from), cidx(to))
	var out: Array = []
	for i in range(1, ids.size()):
		out.append(cell_of(ids[i]))
	return out


func near_building(t: Vector2i, id: String, radius: float) -> bool:
	var c := tile_center(t)
	for b in buildings:
		if b.id == id and b.center_px().distance_to(c) <= radius * TILE:
			return true
	return false


func add_litter(c: Vector3i, n := 1) -> void:
	litter[c] = mini(litter.get(c, 0) + n, 6)


func total_litter() -> int:
	var s := 0
	for k in litter:
		s += litter[k]
	return s


func _uid() -> int:
	next_uid += 1
	return next_uid


func find_person(u: int) -> Person:
	return person_by_uid.get(u)


func buildings_of(id: String) -> Array:
	return buildings.filter(func(b): return b.id == id)


func buildings_serving(need: String) -> Array:
	return buildings.filter(func(b): return b.def().get("serves", "") == need and b.connected)


func has_building(id: String) -> bool:
	for b in buildings:
		if b.id == id:
			return true
	return false


# =====================================================================
#  Money
# =====================================================================

func spend(amount: int, cat: String) -> void:
	money -= amount
	finance_today[cat] = finance_today.get(cat, 0) - amount
	changed.emit()


func earn(amount: int, cat: String) -> void:
	money += amount
	finance_today[cat] = finance_today.get(cat, 0) + amount
	changed.emit()


func take_loan() -> void:
	money += 50000
	loan += 60000
	notify.emit("Took a $50,000 district loan. $60,000 will be repaid at $1,000/day.", "money")
	changed.emit()


# =====================================================================
#  People
# =====================================================================

func grade_color(g: int) -> Color:
	match g:
		9: return Color(0.4, 0.9, 0.4)
		10: return Color(0.3, 0.75, 1.0)
		11: return Color(1.0, 0.8, 0.25)
		_: return Color(0.95, 0.35, 0.35)


func available_electives() -> Array:
	var out: Array = Data.BASE_ELECTIVES.duplicate()
	if research_done.has("comp_sci"):
		out.append("CompSci")
	if research_done.has("robotics"):
		out.append("Engineering")
	if research_done.has("drama"):
		out.append("Drama")
	return out


func _preferred_electives(pers: String) -> Array:
	match pers:
		"Athlete": return ["PE"]
		"Artist": return ["Art", "Drama"]
		"Musician": return ["Music"]
		"Nerd": return ["CompSci", "Engineering", "Spanish"]
		"Gamer": return ["CompSci", "Engineering"]
		"Socialite": return ["Drama", "Spanish"]
	return []


func _pick_electives(p: Person) -> Array:
	var offered := available_electives().filter(func(s): return has_building(Data.subject_room(s)))
	if offered.size() < 2:
		offered = available_electives()
	var picks: Array = []
	for s in _preferred_electives(p.personality):
		if s in offered and picks.size() < 1:
			picks.append(s)
	offered.shuffle()
	for s in offered:
		if picks.size() >= 2:
			break
		if not s in picks:
			picks.append(s)
	return picks


func _make_schedule(p: Person) -> void:
	var sched: Array = Data.CORE_SUBJECTS.duplicate()
	sched.append_array(_pick_electives(p))
	sched.shuffle()
	p.schedule = sched


func _make_student(g: int) -> Person:
	var p := Person.new()
	p.uid = _uid()
	p.role = "student"
	p.name = Data.random_name()
	p.grade = g
	p.personality = Data.PERSONALITIES.pick_random()
	p.gpa = clampf(randfn(2.7, 0.6), 0.8, 4.0)
	p.color = grade_color(g)
	p.jitter = Vector2(randf_range(-9, 9), randf_range(-9, 9))
	_make_schedule(p)
	p.arrive_minute = DAY_START + randi() % 28
	return p


func _make_staff(role: String, subj: String, skill: int) -> Person:
	var p := Person.new()
	p.uid = _uid()
	p.role = role
	p.name = Data.random_name()
	p.subject = subj
	p.skill = clampi(skill, 1, 5)
	var base: int = Data.STAFF_ROLES[role]["base_salary"]
	p.salary = int(base * (0.7 + p.skill * 0.15)) + randi_range(-8, 8)
	p.morale = randf_range(65, 90)
	p.color = Data.STAFF_ROLES[role]["color"]
	p.jitter = Vector2(randf_range(-6, 6), randf_range(-6, 6))
	return p


func _add_person(p: Person) -> void:
	people.append(p)
	person_by_uid[p.uid] = p


func _add_staff(p: Person) -> void:
	_add_person(p)
	auto_assign_staff()


func students() -> Array:
	return people.filter(func(p): return p.is_student())


func staff() -> Array:
	return people.filter(func(p): return not p.is_student())


func _refresh_hire_pool() -> void:
	hire_pool.clear()
	var subjects: Array = Data.CORE_SUBJECTS.duplicate()
	subjects.append_array(available_electives())
	for s in subjects:
		hire_pool.append(_make_staff("teacher", s, _rand_skill()))
	for role in ["janitor", "janitor", "security", "nurse", "counselor", "lunch", "coach"]:
		hire_pool.append(_make_staff(role, "", _rand_skill()))


func _rand_skill() -> int:
	return clampi(int(round(randfn(2.8, 1.0))), 1, 5)


func hire(p: Person) -> void:
	hire_pool.erase(p)
	_add_staff(p)
	if running and minute < STAFF_LEAVE and not day_off:
		_arrive(p)
	notify.emit("Hired %s (%s) for $%d/day" % [p.name, p.role_name(), p.salary], "good")
	changed.emit()


func fire(p: Person) -> void:
	_remove_person(p)
	auto_assign_staff()
	notify.emit("%s was let go." % p.name, "info")
	changed.emit()


func _remove_person(p: Person) -> void:
	for b in buildings:
		b.staff_uids.erase(p.uid)
	people.erase(p)
	person_by_uid.erase(p.uid)
	if selected == p:
		select(null)


## Assign each unassigned staff member to a building that needs their role.
func auto_assign_staff() -> void:
	for b in buildings:
		b.staff_uids = b.staff_uids.filter(func(u): return person_by_uid.has(u) and person_by_uid[u].assigned_uid == b.uid)
	for p in people:
		if p.is_student() or p.role in ["janitor", "security"]:
			continue
		if p.assigned_uid != -1 and bld_by_uid.has(p.assigned_uid):
			continue
		p.assigned_uid = -1
		for b in buildings:
			if b.required_staff() != p.role or not b.staff_uids.is_empty():
				continue
			if p.role == "teacher" and b.subject() != p.subject:
				continue
			p.assigned_uid = b.uid
			b.staff_uids.append(p.uid)
			break


func assign_staff_to(p: Person, b: Building) -> void:
	if p.assigned_uid != -1 and bld_by_uid.has(p.assigned_uid):
		bld_by_uid[p.assigned_uid].staff_uids.erase(p.uid)
	for u in b.staff_uids.duplicate():
		var other := find_person(u)
		if other:
			other.assigned_uid = -1
	b.staff_uids = [p.uid]
	p.assigned_uid = b.uid
	_reset_person(p)
	changed.emit()


func select(obj) -> void:
	selected = obj
	selection_changed.emit(obj)


# =====================================================================
#  Clock
# =====================================================================

func set_speed(s: int) -> void:
	if s == 0:
		paused = true
	else:
		paused = false
		speed = s
	changed.emit()


func toggle_pause() -> void:
	paused = not paused
	changed.emit()


func _process(delta: float) -> void:
	if not running or paused:
		return
	var sd := delta * speed
	_acc += sd
	var ticks := 0
	while _acc >= SEC_PER_MIN and ticks < 40:
		_acc -= SEC_PER_MIN
		ticks += 1
		_tick()
	for p in people:
		if p.present and not p.path.is_empty():
			_move(p, sd)


func _move(p: Person, dt: float) -> void:
	var dist := WALK_TILES_PER_MIN * TILE / SEC_PER_MIN * dt
	while dist > 0.0 and not p.path.is_empty():
		var c: Vector3i = p.path[0]
		var target := tile_center(Vector2i(c.x, c.y))
		var d := p.pos.distance_to(target)
		if d <= dist:
			p.pos = target
			p.level = c.z
			dist -= d
			p.path.pop_front()
		else:
			p.pos += (target - p.pos) / d * dist
			dist = 0.0


func period_index(m := minute) -> int:
	for i in PERIODS.size():
		if m >= PERIODS[i] and m < PERIODS[i] + PERIOD_LEN:
			return i
	return -1


func next_period(m := minute) -> int:
	for i in PERIODS.size():
		if PERIODS[i] > m:
			return i
	return -1


func phase(m := minute) -> String:
	if m < PERIODS[0]:
		return "arrive"
	if period_index(m) >= 0:
		return "class"
	if m >= LUNCH_START and m < LUNCH_END:
		return "lunch"
	if m >= LEAVE_TIME:
		return "leave"
	if m >= AFTER_START:
		return "after"
	return "passing"


func phase_label() -> String:
	if day_off:
		return "No school today"
	var ph := phase()
	match ph:
		"arrive": return "Students arriving"
		"class": return "Period %d" % (period_index() + 1)
		"lunch": return "Lunch"
		"after": return "After school"
		"leave": return "Dismissal"
	return "Passing period"


func clock_text() -> String:
	var h := minute / 60
	var m := minute % 60
	var ampm := "AM" if h < 12 else "PM"
	var h12 := h % 12
	if h12 == 0:
		h12 = 12
	return "%d:%02d %s" % [h12, m, ampm]


func year() -> int:
	return (day - 1) / DAYS_PER_YEAR + 1


func day_of_year() -> int:
	return (day - 1) % DAYS_PER_YEAR + 1


func semester_name() -> String:
	return "Fall" if day_of_year() <= DAYS_PER_SEMESTER else "Spring"


func weekday() -> String:
	return WEEKDAYS[(day - 1) % 5]


func date_text() -> String:
	return "Year %d  %s  Day %d  (%s)" % [year(), semester_name(), day_of_year(), weekday()]


# =====================================================================
#  Day cycle
# =====================================================================

func start_day() -> void:
	minute = DAY_START
	day_off = false
	_refresh_hire_pool()
	for b in buildings:
		b.uses_today = 0
		b.occupants = 0
	for p in people:
		_reset_person(p)
		p.present = false
		p.state_text = "At home"
		p.had_break = false
		if p.is_student():
			p.learning_today = 0.0
			p.classes_today = 0
			p.classes_missed = 0
			p.attended_period = -1
			p.missed_logged = -1
			p.class_period = -1
			p.class_uid = -1
			p.ate_lunch = false
			p.arrive_minute = DAY_START + randi() % 28
			p.needs = {"hunger": randf_range(60, 95), "bladder": randf_range(75, 100), "energy": randf_range(55, 100),
				"social": randf_range(50, 90), "fun": randf_range(50, 90)}
			p.sick = randf() < 0.01
			# Swap electives whose room doesn't exist for ones that do.
			for i in p.schedule.size():
				var s: String = p.schedule[i]
				if s in Data.CORE_SUBJECTS or has_building(Data.subject_room(s)):
					continue
				for alt in available_electives():
					if has_building(Data.subject_room(alt)) and not alt in p.schedule:
						p.schedule[i] = alt
						break
	_roll_morning_event()
	changed.emit()


func _arrive(p: Person) -> void:
	p.present = true
	p.pos = tile_center(GATE) + Vector2(randf_range(-30, 30), 0)
	p.pos.x = clampf(p.pos.x, tile_center(GATE + Vector2i.LEFT).x, tile_center(GATE + Vector2i.RIGHT).x)
	p.level = 0
	p.state_text = "Arriving"
	_reset_person(p)


func _reset_person(p: Person) -> void:
	if p.dest_uid != -1 and bld_by_uid.has(p.dest_uid):
		bld_by_uid[p.dest_uid].occupants = maxi(0, bld_by_uid[p.dest_uid].occupants - 1)
	p.path = []
	p.dest_uid = -1
	p.activity = ""
	p.busy = 0


func _tick() -> void:
	minute += 1
	if day_off:
		if minute >= DAY_END:
			end_day()
		return
	if minute == DAY_START + 1:
		for p in people:
			if not p.is_student():
				_arrive(p)
	for p in people:
		if p.is_student() and not p.present and minute == p.arrive_minute and minute < LEAVE_TIME:
			_arrive(p)
	for i in PERIODS.size():
		if minute == PERIODS[i] - 10:
			_assign_period(i)
		if minute == PERIODS[i] - 8:
			_interrupt_students()
		if minute == PERIODS[i] + PERIOD_LEN:
			_log_missed(i)
	if minute == LUNCH_START:
		for p in people:
			if not p.is_student():
				p.had_break = false
	if minute == AFTER_START - 10:
		for p in people:
			if p.is_student():
				p.after_school_left = 0 if randf() < 0.35 else randi_range(1, 2)
	if minute == LEAVE_TIME:
		_interrupt_students()
	if minute == STAFF_LEAVE:
		for p in people:
			if not p.is_student() and p.present:
				_reset_person(p)
	for p in people:
		if p.present:
			if p.is_student():
				_student_tick(p)
			else:
				_staff_tick(p)
	if minute % 30 == 0:
		compute_ratings()
		changed.emit()
	if minute >= DAY_END:
		end_day()


func _interrupt_students() -> void:
	for p in people:
		if p.is_student() and p.present and not p.activity in ["class", "restroom", "eat", "nurse", "counsel", "home"]:
			_reset_person(p)


func _assign_period(k: int) -> void:
	var taken := {}
	var rooms_by_subject := {}
	for b in buildings:
		if b.subject() == "" or not b.connected or b.staff_uids.is_empty():
			continue
		if not rooms_by_subject.has(b.subject()):
			rooms_by_subject[b.subject()] = []
		rooms_by_subject[b.subject()].append(b)
		taken[b.uid] = 0
	var studs := students()
	studs.shuffle()
	for p in studs:
		p.class_period = k
		p.class_uid = -1
		var subj: String = p.schedule[k]
		var best: Building = null
		for b in rooms_by_subject.get(subj, []):
			if taken[b.uid] < b.capacity() and (best == null or taken[b.uid] < taken[best.uid]):
				best = b
		if best:
			p.class_uid = best.uid
			taken[best.uid] += 1


func _log_missed(k: int) -> void:
	for p in people:
		if p.is_student() and p.present and p.attended_period != k:
			p.classes_missed += 1
			p.stress += 2


# ---------------------------------------------------------------------
#  Student AI
# ---------------------------------------------------------------------

func _student_tick(p: Person) -> void:
	var stress_mult := 0.7 if research_done.has("sel") else 1.0
	var in_class := p.activity == "class" and p.busy > 0
	p.needs["hunger"] -= 0.09
	p.needs["bladder"] -= 0.17
	p.needs["energy"] -= 0.05
	p.needs["social"] -= 0.04 if in_class else 0.02
	p.needs["fun"] -= 0.09 if in_class else 0.03
	if in_class:
		var hw := 0.05 if policies["homework"] == "heavy" else (0.015 if policies["homework"] == "light" else 0.03)
		p.stress += hw * stress_mult
	else:
		p.stress -= 0.02
	for k in p.needs:
		p.needs[k] = clampf(p.needs[k], 0, 100)
	p.stress = clampf(p.stress, 0, 100)
	if minute % 5 == 0:
		p.recalc_happiness()

	if p.busy > 0:
		_student_activity_minute(p)
		p.busy -= 1
		if p.busy <= 0:
			_finish_activity(p)
		return
	if p.is_walking():
		return
	if p.activity == "home":
		p.present = false
		p.state_text = "At home"
		_reset_person(p)
		return
	if p.activity != "":
		_start_activity(p)
		return
	_student_decide(p)


func _student_decide(p: Person) -> void:
	var ph := phase()
	if ph == "leave" or (ph == "after" and p.after_school_left <= 0):
		_go_home(p)
		return
	if p.sick:
		if _go_to_need(p, "health", "nurse", "Heading to the nurse"):
			return
		p.think("I feel sick and there's no nurse...", false)
		_go_home(p)
		return
	if p.needs["bladder"] < 30:
		if _go_to_need(p, "bladder", "restroom", "Going to the restroom"):
			return
		p.think("I can't find a restroom!", false)
		p.needs["bladder"] = 60
		p.stress += 15
		p.happiness -= 10
	if p.happiness < 30 and p.stress > 60 and randf() < 0.1:
		if _go_to_need(p, "counsel", "counsel", "Seeing the counselor"):
			return

	match ph:
		"class":
			var k := period_index()
			if p.attended_period == k:
				_wander(p)
				return
			if p.class_period == k and p.class_uid != -1 and minute - PERIODS[k] < 25:
				_go_to_class(p)
				return
			if p.missed_logged != k:
				p.missed_logged = k
				var subj: String = p.schedule[k] if k < p.schedule.size() else "?"
				if p.class_uid == -1:
					p.think("There's no %s class for me!" % subj, false)
			if _go_to_need(p, "study", "study", "Study hall"):
				return
			_wander(p, true)
		"passing", "arrive":
			var nk := next_period()
			if nk >= 0 and PERIODS[nk] - minute <= 8 and p.class_period == nk and p.class_uid != -1:
				_go_to_class(p)
				return
			if p.needs["bladder"] < 60 and _go_to_need(p, "bladder", "restroom", "Going to the restroom"):
				return
			if p.needs["hunger"] < 35 and _go_to_need(p, "snack", "snack", "Buying a snack"):
				return
			if randf() < 0.4 and _go_to_need(p, "locker", "locker", "At their locker"):
				return
			_wander(p)
		"lunch":
			if not p.ate_lunch:
				var cafs := buildings_serving("hunger").filter(func(b): return b.is_staffed())
				if not cafs.is_empty():
					_send(p, cafs.pick_random(), "eat", "Getting lunch")
					return
				if _go_to_need(p, "snack", "snack", "Buying a snack for lunch"):
					p.ate_lunch = true
					return
				p.think("Where am I supposed to eat lunch?!", false)
				p.ate_lunch = true
			if randf() < 0.5 and _go_to_need(p, "social", "hangout", "Hanging out"):
				return
			if randf() < 0.5 and _go_to_need(p, "rest", "rest", "Sitting on a bench"):
				return
			_wander(p)
		"after":
			p.after_school_left -= 1
			var want := _after_school_need(p.personality)
			for need in want:
				if _go_to_need(p, need, need, "After-school " + _activity_label(need)):
					return
			if _go_to_need(p, "social", "hangout", "Hanging out after school"):
				return
			_go_home(p)


func _after_school_need(pers: String) -> Array:
	match pers:
		"Athlete": return ["sport"]
		"Artist": return ["art"]
		"Musician": return ["music"]
		"Nerd": return ["study", "game"]
		"Gamer": return ["game", "social"]
		"Socialite": return ["social", "sport"]
		"Rebel": return ["sport", "social"]
	return ["social"]


func _activity_label(need: String) -> String:
	match need:
		"sport": return "sports"
		"art": return "art club"
		"music": return "band practice"
		"study": return "studying"
		"game": return "gaming club"
	return "hangout"


func _go_to_class(p: Person) -> void:
	var b: Building = bld_by_uid.get(p.class_uid)
	if b == null:
		p.class_uid = -1
		return
	_send(p, b, "class", "Going to %s" % p.schedule[p.class_period])


## Find the closest building that serves `need`, respecting staffing and capacity.
func _go_to_need(p: Person, need: String, act: String, label: String) -> bool:
	var best: Building = null
	var bd := INF
	for b in buildings:
		if b.def().get("serves", "") != need or not b.connected:
			continue
		if b.required_staff() != "" and not b.is_staffed():
			continue
		# Restrooms get a line instead of turning people away.
		if b.capacity() > 0 and b.occupants >= b.capacity() and need != "bladder":
			continue
		var d: float = b.center_px().distance_squared_to(p.pos) + absi(b.level - p.level) * 250000.0
		if need == "bladder":
			d += maxi(0, b.occupants - b.capacity()) * 20000.0
		if d < bd:
			bd = d
			best = b
	if best == null:
		return false
	return _send(p, best, act, label)


func _send(p: Person, b: Building, act: String, label: String) -> bool:
	var target := b.random_cell()
	if b.is_decor():
		# Decor isn't walkable; stand on a walkable neighbor instead.
		target = Vector3i(-1, -1, -1)
		for dvec in [Vector2i.DOWN, Vector2i.UP, Vector2i.LEFT, Vector2i.RIGHT]:
			var n := Vector3i(b.pos.x + dvec.x, b.pos.y + dvec.y, b.level)
			if reachable.has(n):
				target = n
				break
		if target.x < 0:
			return false
	elif not reachable.has(target):
		target = Vector3i(b.pos.x, b.pos.y, b.level)
	var from := _from_cell(p)
	var path := find_path(from, target)
	if path.is_empty():
		return false
	p.path = path
	p.dest_uid = b.uid
	p.activity = act
	p.state_text = label
	b.occupants += 1
	return true


## Where the person stands now; anyone stranded off the walk graph goes back to the gate.
func _from_cell(p: Person) -> Vector3i:
	var c := p.cell()
	if not reachable.has(c):
		p.pos = tile_center(GATE)
		p.level = 0
		c = GATE_CELL
	return c


func _wander(p: Person, idle_class := false) -> void:
	var from := _from_cell(p)
	for attempt in 6:
		var t := from + Vector3i(randi_range(-7, 7), randi_range(-7, 7), 0)
		if reachable.has(t) and t.y < GATE.y:
			p.path = find_path(from, t)
			break
	p.activity = "wander"
	p.dest_uid = -1
	p.state_text = "Skipping class" if idle_class else "Wandering"
	if idle_class or p.personality == "Rebel" or p.happiness < 40:
		_maybe_misbehave(p)


func _go_home(p: Person, label := "Going home") -> void:
	_reset_person(p)
	var from := p.cell()
	if not reachable.has(from):
		p.present = false
		_reset_person(p)
		return
	p.path = find_path(from, GATE_CELL)
	p.dest_uid = -1
	p.activity = "home"
	p.busy = 0
	p.state_text = label


func _start_activity(p: Person) -> void:
	var b: Building = bld_by_uid.get(p.dest_uid)
	if p.activity == "wander":
		p.activity = "idle"
		p.busy = randi_range(3, 10)
		p.state_text = "Hanging around" if p.state_text == "Wandering" else p.state_text
		var dirt := 0
		for dy in range(-2, 3):
			for dx in range(-2, 3):
				dirt += litter.get(p.cell() + Vector3i(dx, dy, 0), 0)
		if dirt >= 5:
			p.think("This place is covered in trash.", false)
			p.needs["fun"] -= 4
		elif near_building(p.tile(), "mascot_statue", 6) or near_building(p.tile(), "fountain", 6):
			p.think("Our campus looks great!", true)
			p.needs["fun"] += 3
		return
	if b == null:
		_reset_person(p)
		return
	b.uses_today += 1
	match p.activity:
		"class":
			p.busy = maxi(1, PERIODS[p.class_period] + PERIOD_LEN - minute)
			p.attended_period = p.class_period
			p.classes_today += 1
			p.state_text = "In %s class" % p.schedule[p.class_period]
			if teacher_in_room(b) == null:
				p.think("Our %s teacher isn't here..." % p.schedule[p.class_period], false)
		"restroom":
			p.busy = 4
			b.cleanliness -= 2.0
			if b.cleanliness < 35:
				p.think("The restroom is disgusting!", false)
				p.happiness -= 4
		"eat":
			p.busy = 20
		"snack":
			p.busy = 2
		"locker":
			p.busy = randi_range(3, 6)
		"study":
			p.busy = 30
		"hangout":
			p.busy = randi_range(12, 25)
		"rest":
			p.busy = randi_range(5, 10)
		"nurse":
			p.busy = 20
		"counsel":
			p.busy = 20
		"sport", "art", "music", "game":
			p.busy = randi_range(30, 50)
		_:
			p.busy = 5


func _student_activity_minute(p: Person) -> void:
	var b: Building = bld_by_uid.get(p.dest_uid)
	match p.activity:
		"class":
			if b and period_index() == p.class_period:
				var t := teacher_in_room(b)
				if t:
					p.learning_today += _learning_rate(p, t, b)
		"study":
			var rate := 0.35 * (2.0 if research_done.has("tutoring") else 1.0)
			if period_index() >= 0:
				p.learning_today += rate
			p.needs["energy"] += 0.1
		"hangout", "rest", "locker":
			p.needs["social"] += 1.2
			p.needs["fun"] += 0.6
			p.needs["energy"] += 0.3 if p.activity == "rest" else 0.0
		"sport", "art", "music", "game":
			var fav := _after_school_need(p.personality).has(p.activity)
			p.needs["fun"] += 1.6 if fav else 0.8
			p.needs["social"] += 0.8
			p.stress -= 0.4
			if p.activity == "sport":
				p.needs["energy"] -= 0.1
		"idle":
			p.needs["social"] += 0.2


func _learning_rate(p: Person, t: Person, b: Building) -> float:
	var r := 0.5 + t.skill * 0.15
	r *= 0.6 + t.morale / 250.0
	r *= 0.5 + p.happiness / 200.0
	r *= 0.7 + p.needs["energy"] / 333.0
	r *= 1.0 + minf(b.appeal, 30.0) / 100.0
	if near_building(b.pos, "bulletin_board", 6):
		r *= 1.05
	if research_done.has("ap_courses") and p.schedule[p.class_period] in Data.CORE_SUBJECTS:
		r *= 1.15
	if policies["phones"] == "ban":
		r *= 1.1
	match policies["homework"]:
		"heavy": r *= 1.15
		"light": r *= 0.9
	if b.occupants > b.capacity():
		r *= 0.8
	return r


func _finish_activity(p: Person) -> void:
	var b: Building = bld_by_uid.get(p.dest_uid)
	if b:
		b.occupants = maxi(0, b.occupants - 1)
	match p.activity:
		"restroom":
			p.needs["bladder"] = 100
		"eat":
			p.needs["hunger"] = 100
			p.ate_lunch = true
			earn(policies["lunch_price"], "Cafeteria")
			if research_done.has("healthy_lunch"):
				p.needs["energy"] += 20
			if policies["lunch_price"] >= 7:
				p.think("Lunch is way too expensive.", false)
				p.happiness -= 3
			else:
				p.think("Lunch was pretty good today.", true)
			if b and b.is_staffed():
				b.cleanliness -= 0.3
			_maybe_litter(p, 0.08)
		"snack":
			p.needs["hunger"] = minf(100, p.needs["hunger"] + 35)
			earn(2, "Vending")
			_maybe_litter(p, 0.35)
		"nurse":
			if b and b.is_staffed():
				p.sick = false
				p.think("The nurse fixed me up!", true)
		"counsel":
			p.stress = maxf(0, p.stress - 40)
			p.happiness += 15
			p.think("Talking to the counselor really helped.", true)
		"sport", "art", "music", "game":
			p.think("Loved %s today!" % _activity_label(p.activity), true)
		"class":
			if b and teacher_in_room(b) != null and p.happiness > 60:
				p.think("%s class was interesting." % p.schedule[p.class_period], true)
	p.activity = ""
	p.dest_uid = -1
	p.state_text = "Deciding"


func _maybe_litter(p: Person, chance: float) -> void:
	if near_building(p.tile(), "trash_can", 4):
		return
	if randf() < chance:
		add_litter(p.cell())


func _maybe_misbehave(p: Person) -> void:
	var chance := 0.01 * (2.5 if p.personality == "Rebel" else 1.0) * (1.2 - p.happiness / 100.0)
	if has_building("principal_office"):
		chance *= 0.7
	if policies["uniforms"]:
		chance *= 0.8
	if policies["phones"] == "ban":
		chance *= 1.15
	if near_building(p.tile(), "security_camera", 7):
		chance *= 0.4
	var guard := _nearest_staff("security", p.pos, 8 * TILE)
	if guard:
		chance *= 0.25
	if randf() >= chance:
		return
	var roll := randf()
	if roll < 0.5:
		add_litter(p.cell(), 2)
		p.think("Whatever, someone else will pick it up.", false)
	elif roll < 0.8:
		var target: Building = null
		for b in buildings:
			if not b.is_decor() and b.center_px().distance_to(p.pos) < 5 * TILE:
				target = b
				break
		if target:
			target.condition = maxf(0, target.condition - 12)
			incidents += 1
			notify.emit("Vandalism! %s tagged the %s with graffiti." % [p.name, target.display_name()], "bad")
	else:
		incidents += 2
		incident_tile = p.cell()
		fight_happened.emit(p.uid)
		p.stress += 15
		p.happiness -= 15
		if guard:
			notify.emit("Fight broken up by security near the %s. %s sent to the principal." % [_place_name(p.tile()), p.name], "bad")
		else:
			notify.emit("A fight broke out! %s got into it. Hire security to keep the peace." % p.name, "bad")
		for o in people:
			if o.is_student() and o.present and o != p and o.pos.distance_to(p.pos) < 3 * TILE:
				o.think("I saw a fight today. Scary.", false)
				if o.pos.distance_to(p.pos) < 1.5 * TILE and not o.is_walking():
					fight_happened.emit(o.uid)
				o.stress += 5


func _place_name(t: Vector2i) -> String:
	var best := "hallway"
	var bd := INF
	for b in buildings:
		if b.is_decor():
			continue
		var d: float = b.center_px().distance_to(tile_center(t))
		if d < bd:
			bd = d
			best = b.display_name()
	return best


func teacher_in_room(b: Building) -> Person:
	for u in b.staff_uids:
		var t := find_person(u)
		if t and t.present and t.dest_uid == b.uid and not t.is_walking() and t.activity == "work":
			return t
	return null


func _nearest_staff(role: String, at: Vector2, radius: float) -> Person:
	for p in people:
		if p.role == role and p.present and p.pos.distance_to(at) < radius:
			return p
	return null


# ---------------------------------------------------------------------
#  Staff AI
# ---------------------------------------------------------------------

func _staff_tick(p: Person) -> void:
	p.morale = clampf(p.morale - 0.012, 0, 100)
	if p.busy > 0:
		p.busy -= 1
		if p.activity == "break":
			p.morale = minf(100, p.morale + 0.8)
		if p.busy <= 0:
			_staff_finish(p)
		return
	if p.is_walking():
		return
	if p.activity == "home":
		p.present = false
		p.state_text = "Off duty"
		_reset_person(p)
		return
	if p.activity != "":
		_staff_arrive(p)
		return
	if minute >= STAFF_LEAVE:
		_go_home(p, "Heading home")
		return
	# Lunch break in the teachers' lounge.
	if phase() == "lunch" and not p.had_break and p.role != "lunch":
		var lounges := buildings_serving("staff")
		if not lounges.is_empty():
			p.had_break = true
			_send(p, lounges.pick_random(), "break", "On break")
			return
		p.had_break = true
		p.think("We don't even have a teachers' lounge.", false)
		p.morale -= 5
	match p.role:
		"janitor":
			_janitor_decide(p)
		"security":
			_security_decide(p)
		_:
			var b: Building = bld_by_uid.get(p.assigned_uid)
			if b == null:
				p.state_text = "No assignment"
				_wander(p)
				return
			if not _send(p, b, "work", "Heading to %s" % b.display_name()):
				p.state_text = "Can't reach %s!" % b.display_name()
				_wander(p)


func _staff_arrive(p: Person) -> void:
	var b: Building = bld_by_uid.get(p.dest_uid)
	match p.activity:
		"work":
			p.busy = 30
			p.state_text = "Working in %s" % (b.display_name() if b else "?")
		"break":
			p.busy = 30
			p.state_text = "On break in the lounge"
		"clean":
			p.busy = 4
			p.state_text = "Cleaning"
		"wander":
			p.activity = "idle"
			p.busy = randi_range(2, 6)
			p.state_text = "Patrolling" if p.role == "security" else "Idle"
		_:
			p.busy = 3


func _staff_finish(p: Person) -> void:
	var b: Building = bld_by_uid.get(p.dest_uid)
	if b:
		b.occupants = maxi(0, b.occupants - 1)
	if p.activity == "clean":
		var t := p.cell()
		for dy in range(-1, 2):
			for dx in range(-1, 2):
				litter.erase(t + Vector3i(dx, dy, 0))
		if b:
			b.cleanliness = minf(100, b.cleanliness + 40 + p.skill * 8)
			b.condition = minf(100, b.condition + 10 + p.skill * 3)
	if p.activity == "work" and b and minute < STAFF_LEAVE and not (phase() == "lunch" and not p.had_break):
		# Stay put: keep working in the room.
		p.busy = 30
		b.occupants += 1
		return
	p.activity = ""
	p.dest_uid = -1


func _janitor_decide(p: Person) -> void:
	var best_t := Vector3i(-1, -1, -1)
	var bd := INF
	for t in litter:
		if not reachable.has(t):
			continue
		var d := (tile_center(Vector2i(t.x, t.y)).distance_squared_to(p.pos) + absi(t.z - p.level) * 40000.0) / float(litter[t])
		if d < bd and not _claimed_by_other_janitor(p, t):
			bd = d
			best_t = t
	var dirty: Building = null
	for b in buildings:
		if b.is_decor() or not b.connected:
			continue
		var need: bool = (b.id in ["restroom", "cafeteria"] and b.cleanliness < 65) or b.condition < 80
		if need:
			var d: float = b.center_px().distance_squared_to(p.pos) * 0.5 + absi(b.level - p.level) * 40000.0
			if d < bd:
				bd = d
				dirty = b
				best_t = Vector3i(-1, -1, -1)
	if dirty:
		_send(p, dirty, "clean", "Cleaning %s" % dirty.display_name())
		return
	if best_t.x >= 0:
		var path := find_path(_from_cell(p), best_t)
		if not path.is_empty() or p.cell() == best_t:
			p.path = path
			p.activity = "clean"
			p.dest_uid = -1
			p.state_text = "Picking up trash"
			return
	_wander(p)


func _claimed_by_other_janitor(me: Person, t: Vector3i) -> bool:
	for o in people:
		if o != me and o.role == "janitor" and o.activity == "clean" and not o.path.is_empty() and o.path.back() == t:
			return true
	return false


func _security_decide(p: Person) -> void:
	if incident_tile.x >= 0 and reachable.has(incident_tile):
		var path := find_path(_from_cell(p), incident_tile)
		incident_tile = Vector3i(-1, -1, 0)
		if not path.is_empty():
			p.path = path
			p.activity = "wander"
			p.state_text = "Responding to an incident"
			return
	_wander(p)
	p.state_text = "Patrolling"


# =====================================================================
#  End of day, ratings, events
# =====================================================================

func end_day() -> void:
	var studs := students()
	for p in people:
		p.present = false
		_reset_person(p)
	# --- grades & welfare ---
	var expected := PERIODS.size() * PERIOD_LEN * 1.0
	if not day_off:
		for p in studs:
			var daily := clampf(p.learning_today / expected * 4.6, 0.0, 4.3)
			p.gpa = clampf(lerpf(p.gpa, daily, 0.06), 0.0, 4.0)
			if p.happiness < 30:
				p.unhappy_days += 1
			else:
				p.unhappy_days = maxi(0, p.unhappy_days - 1)
			p.recalc_happiness()
	# --- transfers out ---
	var left := 0
	for p in studs:
		if p.unhappy_days >= 6 and randf() < 0.25:
			_remove_person(p)
			left += 1
	if left > 0:
		notify.emit("%d unhappy student%s transferred to another school." % [left, "s" if left > 1 else ""], "bad")
	compute_ratings()
	# --- finances ---
	var n := students().size()
	var funding := int(n * 22 * (0.5 + rating["overall"] / 100.0))
	if funding > 0:
		earn(funding, "State funding")
	if policies["tuition"] > 0 and n > 0:
		earn(n * policies["tuition"], "Tuition")
	var payroll := 0
	for p in staff():
		payroll += p.salary
	if payroll > 0:
		spend(payroll, "Salaries")
	var upkeep := 0
	for b in buildings:
		upkeep += b.def()["upkeep"]
	if upkeep != 0:
		spend(upkeep, "Upkeep")
	if loan > 0:
		var pay := mini(1000, loan)
		loan -= pay
		spend(pay, "Loan")
	_friday_game()
	_school_calendar_events()
	# --- research ---
	var pts := 1.0
	if has_building("principal_office"):
		pts += 3
	if has_building("library"):
		pts += 2
	for p in staff():
		if p.role == "teacher":
			pts += 0.15 * p.skill
	if research_current != "":
		research_progress += pts
		var cost: float = Data.RESEARCH[research_current]["cost"]
		if research_progress >= cost:
			research_done[research_current] = true
			notify.emit("Curriculum unlocked: %s!" % Data.RESEARCH[research_current]["name"], "good")
			research_current = ""
			research_progress = 0.0
	# --- staff ---
	for p in staff():
		p.days_employed += 1
		if research_done.has("mentoring") and p.role == "teacher" and p.skill < 5 and randf() < 0.03:
			p.skill += 1
			notify.emit("%s improved their teaching skill to %d stars." % [p.name, p.skill], "good")
		if p.morale < 20 and randf() < 0.2:
			notify.emit("%s quit! Low morale. Build a Teachers' Lounge and pay better." % p.name, "bad")
			_remove_person(p)
	# --- night cleaning crew ---
	for p in staff():
		if p.role != "janitor":
			continue
		var keys := litter.keys()
		keys.shuffle()
		for i in mini(4 + p.skill * 2, keys.size()):
			litter.erase(keys[i])
	# --- enrollment ---
	_enrollment()
	incidents *= 0.85
	# --- bookkeeping ---
	var inc := 0
	var expense := 0
	for k in finance_today:
		if finance_today[k] > 0:
			inc += finance_today[k]
		else:
			expense -= finance_today[k]
	finance_history.append({"day": day, "income": inc, "expense": expense, "detail": finance_today.duplicate()})
	if finance_history.size() > 30:
		finance_history.pop_front()
	finance_today = {}
	if money < 0:
		notify.emit("You're in the red! Cut costs or take a loan from the Finance window.", "bad")
	if day_of_year() == DAYS_PER_YEAR:
		_graduation()
	_check_goals()
	day += 1
	start_day()


func seat_capacity() -> int:
	var s := 0
	for b in buildings:
		if b.subject() != "" and not b.staff_uids.is_empty() and b.connected:
			s += b.capacity()
	return s


func _enrollment() -> void:
	var n := students().size()
	var cap := seat_capacity()
	if cap == 0:
		return
	var limit := int(cap * 1.1)
	if n >= limit:
		if randf() < 0.2:
			notify.emit("Families are being turned away - build more classrooms and hire teachers!", "info")
		return
	var appeal: float = rating["overall"] / 100.0
	var tuition_factor := clampf(1.0 - policies["tuition"] / 60.0, 0.1, 1.0)
	var count := int(round((2 + randf() * 8) * appeal * tuition_factor))
	count = mini(count, limit - n)
	for i in count:
		var g := 9 if randf() < 0.6 else randi_range(10, 12)
		_add_person(_make_student(g))
	if count > 0:
		notify.emit("%d new student%s enrolled!" % [count, "s" if count > 1 else ""], "good")


func _graduation() -> void:
	var grads := 0
	var held := 0
	var bonus := 0
	for p in students():
		if p.grade == 12:
			if p.gpa >= 1.5:
				grads += 1
				bonus += 200 + int(p.gpa * 100)
				_remove_person(p)
			else:
				held += 1
		else:
			p.grade += 1
			p.color = grade_color(p.grade)
			_make_schedule(p)
	graduates += grads
	if bonus > 0:
		earn(bonus, "Graduation grants")
	notify.emit("GRADUATION DAY! %d seniors graduated (%d held back). The district awarded $%d." % [grads, held, bonus], "event")
	var freshmen := int(10 + rating["overall"] / 4.0)
	var room := int(seat_capacity() * 1.1) - students().size()
	freshmen = clampi(freshmen, 0, maxi(0, room))
	for i in freshmen:
		_add_person(_make_student(9))
	if freshmen > 0:
		notify.emit("A new class of %d freshmen is starting next year." % freshmen, "good")


func _friday_game() -> void:
	if day_off or weekday() != "Fri":
		return
	var field: Building = null
	for b in buildings_of("football_field"):
		if b.has_staff_assigned():
			field = b
	if field == null:
		return
	var coach: Person = null
	if not field.staff_uids.is_empty():
		coach = find_person(field.staff_uids[0])
	var studs := students()
	var athletes := studs.filter(func(p): return p.personality == "Athlete").size()
	var chance := 0.3 + (coach.skill * 0.07 if coach else 0.0) + minf(0.25, athletes * 0.01)
	if has_building("gymnasium"):
		chance += 0.05
	var us := randi_range(7, 35)
	var them := randi_range(3, 31)
	var won := randf() < chance
	if won and us <= them:
		us = them + randi_range(1, 14)
	elif not won and us >= them:
		them = us + randi_range(1, 10)
	var tickets := int(400 + studs.size() * 9 * (0.5 + rating["overall"] / 100.0))
	earn(tickets, "Game tickets")
	var rival: String = Data.TEAM_NAMES.pick_random()
	while rival == team_name:
		rival = Data.TEAM_NAMES.pick_random()
	if won:
		wins += 1
		for p in studs:
			p.happiness = minf(100, p.happiness + 6)
			p.think("WE WON THE GAME! Go %s!" % team_name, true)
		notify.emit("FRIDAY NIGHT LIGHTS: %s beat the %s %d-%d! Tickets: $%d" % [team_name, rival, us, them, tickets], "event")
	else:
		losses += 1
		notify.emit("Friday night: the %s lost to the %s %d-%d. Tickets: $%d" % [team_name, rival, them, us, tickets], "event")


func _school_calendar_events() -> void:
	if day_off:
		return
	var d := day_of_year()
	var studs := students()
	if d == 15 and has_building("football_field"):
		for p in studs:
			p.happiness = minf(100, p.happiness + 10)
			p.think("Homecoming was amazing!", true)
		earn(1500 + studs.size() * 5, "Events")
		notify.emit("HOMECOMING WEEK! Spirit is sky high. The dance and parade raised money.", "event")
	if d == 25 or d == 55:
		var avg := average("gpa")
		var bonus := int(maxf(0, (avg - 2.5)) * 8000)
		if bonus > 0:
			earn(bonus, "Test score grants")
		notify.emit("Standardized test results are in: average GPA %.2f. %s" % [avg, ("District bonus $%d!" % bonus) if bonus > 0 else "No bonus this time."], "event")
		for p in studs:
			p.stress += 10
	if d == 52:
		var gyms := buildings_of("gymnasium")
		if gyms.is_empty():
			for p in studs:
				if p.grade >= 11:
					p.think("We don't even have a gym for prom.", false)
					p.happiness -= 10
			notify.emit("No gym, no prom. Juniors and seniors are upset.", "bad")
		else:
			var upper := studs.filter(func(p): return p.grade >= 11)
			for p in upper:
				p.happiness = minf(100, p.happiness + 20)
				p.think("PROM WAS THE BEST NIGHT EVER!", true)
			earn(upper.size() * 40, "Events")
			notify.emit("PROM NIGHT in the gym! %d juniors and seniors danced the night away." % upper.size(), "event")
	if d == 40 and has_building("theater"):
		earn(2000 + studs.size() * 6, "Events")
		notify.emit("The school play sold out the Theater!", "event")


func _roll_morning_event() -> void:
	var studs := students()
	if studs.size() < 10 or randf() > 0.12:
		return
	var roll := randi() % 8
	match roll:
		0:
			if semester_name() == "Spring" and day_of_year() < 40:
				day_off = true
				notify.emit("SNOW DAY! School is closed today. (Staff are still paid.)", "event")
		1:
			var n := 0
			for p in studs:
				if randf() < 0.12:
					p.sick = true
					n += 1
			notify.emit("Flu outbreak! %d students are sick. Make sure you have a staffed Nurse's Office." % n, "bad")
		2:
			var score: float = rating["cleanliness"]
			if score >= 75:
				earn(3000, "Inspections")
				notify.emit("Health inspection passed with flying colors! +$3,000", "good")
			else:
				spend(4000, "Inspections")
				notify.emit("Health inspection FAILED (cleanliness %d%%). Fined $4,000." % int(score), "bad")
		3:
			var cafs := buildings_of("cafeteria")
			if not cafs.is_empty():
				var c: Building = cafs[0]
				for i in 25:
					add_litter(c.random_cell(), 2)
				c.cleanliness = 10
				notify.emit("FOOD FIGHT in the cafeteria! It's a mess in there.", "bad")
		4:
			if rating["overall"] >= 70:
				var grant := 10000 + int(rating["overall"] * 100)
				earn(grant, "Grants")
				notify.emit("The School Board visited and was impressed. Grant awarded: $%d" % grant, "good")
			else:
				notify.emit("The School Board visited... they left unimpressed. Rating needs work.", "bad")
		5:
			var raised := 500 + studs.size() * 8
			earn(raised, "Fundraisers")
			notify.emit("The PTA bake sale raised $%d!" % raised, "good")
		6:
			if graduates > 0:
				var gift := 2000 + graduates * 150
				earn(gift, "Donations")
				notify.emit("An alumna donated $%d to the school!" % gift, "good")
		7:
			var avg_m := average_staff_morale()
			if avg_m < 35 and staff().size() > 3:
				day_off = true
				notify.emit("TEACHER WALKOUT! Staff morale is too low. No classes today.", "bad")
			else:
				for p in studs:
					p.needs["fun"] = 100
				notify.emit("Spirit Day! Everyone wore school colors.", "good")


func average(field: String) -> float:
	var studs := students()
	if studs.is_empty():
		return 0.0
	var s := 0.0
	for p in studs:
		s += p.get(field)
	return s / studs.size()


func average_need(need: String) -> float:
	var studs := students()
	if studs.is_empty():
		return 0.0
	var s := 0.0
	for p in studs:
		s += p.needs[need]
	return s / studs.size()


func average_staff_morale() -> float:
	var st := staff()
	if st.is_empty():
		return 100.0
	var s := 0.0
	for p in st:
		s += p.morale
	return s / st.size()


func compute_ratings() -> void:
	var studs := students()
	var n := studs.size()
	rating["academics"] = clampf(average("gpa") / 4.0 * 100.0, 0, 100) if n > 0 else 0.0
	rating["welfare"] = average("happiness") if n > 0 else 0.0
	rating["safety"] = clampf(100.0 - incidents * 2.5 + (5.0 if has_building("principal_office") else -10.0), 0, 100)
	var dirt := total_litter() * 1.2
	var cond := 0.0
	var cnt := 0
	for b in buildings:
		if b.is_decor():
			continue
		cnt += 1
		cond += b.condition
		if b.id in ["restroom", "cafeteria"]:
			dirt += (100.0 - b.cleanliness) * 0.25
	var avg_cond := cond / cnt if cnt > 0 else 100.0
	rating["cleanliness"] = clampf(avg_cond - dirt, 0, 100)
	var kinds := {}
	var appeal := 0.0
	for b in buildings:
		kinds[b.id] = true
		appeal += b.def().get("appeal", 0)
	var fac := kinds.size() * 4.0 + minf(25.0, appeal * 0.15)
	for req in ["restroom", "cafeteria", "principal_office", "library", "nurse_office"]:
		if not kinds.has(req):
			fac -= 6
	rating["facilities"] = clampf(fac, 0, 100)
	var att_total := 0
	var att_miss := 0
	for p in studs:
		att_total += p.classes_today + p.classes_missed
		att_miss += p.classes_missed
	rating["attendance"] = 100.0 * (1.0 - float(att_miss) / att_total) if att_total > 0 else (100.0 if n > 0 else 0.0)
	if n == 0:
		rating["overall"] = rating["facilities"] * 0.5
	else:
		rating["overall"] = rating["academics"] * 0.28 + rating["welfare"] * 0.2 + rating["safety"] * 0.14 \
			+ rating["cleanliness"] * 0.1 + rating["facilities"] * 0.13 + rating["attendance"] * 0.15


func letter_grade(v: float = -1) -> String:
	if v < 0:
		v = rating["overall"]
	if v >= 93: return "A+"
	if v >= 85: return "A"
	if v >= 78: return "B+"
	if v >= 70: return "B"
	if v >= 62: return "C+"
	if v >= 55: return "C"
	if v >= 45: return "D"
	return "F"


## Most common student thoughts right now (like guest feedback).
func top_thoughts(limit := 6) -> Array:
	var counts := {}
	var good := {}
	for p in students():
		if p.thoughts.is_empty():
			continue
		var t: Dictionary = p.thoughts[0]
		counts[t["text"]] = counts.get(t["text"], 0) + 1
		good[t["text"]] = t["good"]
	var arr: Array = []
	for k in counts:
		arr.append({"text": k, "count": counts[k], "good": good[k]})
	arr.sort_custom(func(a, b): return a["count"] > b["count"])
	return arr.slice(0, limit)


# =====================================================================
#  Scenario goals
# =====================================================================

func goal_progress(g: Dictionary) -> Array:
	# Returns [current_value, met, label]
	var v: float = g["value"]
	match g["type"]:
		"students":
			var n := students().size()
			return [n, n >= v, "Enroll %d students" % int(v)]
		"rating":
			return [rating["overall"], rating["overall"] >= v, "Reach a school rating of %s (%d)" % [letter_grade(v), int(v)]]
		"gpa":
			var a := average("gpa")
			return [a, a >= v and students().size() >= 20, "Average GPA of %.1f (20+ students)" % v]
		"wins":
			return [wins, wins >= v, "Win %d home football games" % int(v)]
		"money":
			return [money, money >= v, "Have $%s in the bank" % format_money(int(v))]
	return [0, false, "?"]


func _check_goals() -> void:
	if won_scenario:
		return
	var goals: Array = Data.SCENARIOS[scenario_id]["goals"]
	if goals.is_empty():
		return
	for g in goals:
		if not goal_progress(g)[1]:
			return
	won_scenario = true
	scenario_won.emit(Data.SCENARIOS[scenario_id]["name"])
	notify.emit("SCENARIO COMPLETE: %s! Keep playing as long as you like." % Data.SCENARIOS[scenario_id]["name"], "event")


func format_money(v: int) -> String:
	var neg := v < 0
	var s := str(absi(v))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if neg else "") + s + out


# =====================================================================
#  Save / load
# =====================================================================

const SAVE_PATH := "user://planetschool_save.json"


func save_game() -> bool:
	var floors: Array = []
	var roofs: Array = []
	for i in grid_floor.size():
		if grid_floor[i] > 0 and grid_floor[i] != Data.GATE_FLOOR:
			var c := cell_of(i)
			floors.append([c.x, c.y, c.z, grid_floor[i]])
		if grid_roof[i] > 0:
			var c := cell_of(i)
			roofs.append([c.x, c.y, c.z, grid_roof[i]])
	var walls: Array = []
	for lv in LEVELS:
		for y in H + 1:
			for x in W + 1:
				for dir in 2:
					var e := Vector4i(x, y, lv, dir)
					var st := get_wall(e)
					if st > 0:
						walls.append([x, y, lv, dir, st])
	var lit: Array = []
	for t in litter:
		lit.append([t.x, t.y, t.z, litter[t]])
	var data := {
		"version": 2, "scenario": scenario_id, "name": school_name, "team": team_name, "money": money, "loan": loan,
		"day": day, "next_uid": next_uid, "research_done": research_done.keys(), "research_current": research_current,
		"research_progress": research_progress, "policies": policies, "incidents": incidents, "wins": wins,
		"losses": losses, "graduates": graduates, "won": won_scenario, "floors": floors, "roofs": roofs, "walls": walls, "litter": lit,
		"buildings": buildings.map(func(b): return b.to_dict()),
		"people": people.map(func(p): return p.to_dict()),
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		notify.emit("Could not save the game.", "bad")
		return false
	f.store_string(JSON.stringify(data))
	notify.emit("Game saved.", "good")
	return true


func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)


func load_game() -> bool:
	if not has_save():
		return false
	var data = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if typeof(data) != TYPE_DICTIONARY:
		notify.emit("Save file is corrupted.", "bad")
		return false
	_clear()
	scenario_id = data["scenario"]
	school_name = data["name"]
	team_name = data["team"]
	money = int(data["money"])
	loan = int(data.get("loan", 0))
	day = int(data["day"])
	next_uid = int(data["next_uid"])
	for r in data["research_done"]:
		research_done[r] = true
	research_current = data["research_current"]
	research_progress = float(data["research_progress"])
	policies.merge(data["policies"], true)
	policies["tuition"] = int(policies["tuition"])
	policies["lunch_price"] = int(policies["lunch_price"])
	incidents = float(data["incidents"])
	wins = int(data["wins"])
	losses = int(data["losses"])
	graduates = int(data["graduates"])
	won_scenario = bool(data["won"])
	if int(data.get("version", 1)) < 2:
		notify.emit("That save is from an older version of PlanetSchool and can't be loaded.", "bad")
		return false
	_make_gate()
	for e in data["floors"]:
		grid_floor[cidx(Vector3i(int(e[0]), int(e[1]), int(e[2])))] = int(e[3])
	for e in data["roofs"]:
		grid_roof[cidx(Vector3i(int(e[0]), int(e[1]), int(e[2])))] = int(e[3])
	for e in data["walls"]:
		_set_wall_raw(Vector4i(int(e[0]), int(e[1]), int(e[2]), int(e[3])), int(e[4]))
	for e in data["litter"]:
		litter[Vector3i(int(e[0]), int(e[1]), int(e[2]))] = int(e[3])
	for d in data["buildings"]:
		var b := Building.from_dict(d)
		buildings.append(b)
		bld_by_uid[b.uid] = b
		for l in range(b.level, b.level + b.span()):
			for y in b.size.y:
				for x in b.size.x:
					grid_bld[cidx(Vector3i(b.pos.x + x, b.pos.y + y, l))] = b.uid
	for d in data["people"]:
		var p := Person.from_dict(d)
		p.jitter = Vector2(randf_range(-9, 9), randf_range(-9, 9))
		_add_person(p)
	_rebuild_nav()
	auto_assign_staff()
	compute_ratings()
	running = true
	paused = false
	start_day()
	game_started.emit()
	map_changed.emit()
	notify.emit("Loaded %s. Welcome back!" % school_name, "good")
	return true

class_name Building
extends RefCounted
## A placed room or object on one level of the campus grid. Stairs and
## elevators span two levels (their own and the one above).

var uid: int
var id: String
var pos: Vector2i
var size: Vector2i
var level := 0
var rot := 0  # 0..3 quarter turns; for stairs also which end is "up"
var cleanliness := 100.0
var condition := 100.0  # drops with vandalism / graffiti
var connected := true
var occupants := 0  # people currently using it
var staff_uids: Array = []  # assigned staff (teachers etc.)
var uses_today := 0
var custom_name := ""
var appeal := 0.0  # decor score nearby, boosts room quality


func def() -> Dictionary:
	return Data.BUILDINGS[id]


func display_name() -> String:
	return custom_name if custom_name != "" else def()["name"]


func rect() -> Rect2i:
	return Rect2i(pos, size)


func center_px() -> Vector2:
	return (Vector2(pos) + Vector2(size) * 0.5) * Game.TILE


func contains(t: Vector2i) -> bool:
	return rect().has_point(t)


func span() -> int:
	return def().get("span", 1)


func on_level(lv: int) -> bool:
	return lv >= level and lv < level + span()


func random_tile() -> Vector2i:
	return pos + Vector2i(randi() % size.x, randi() % size.y)


## A random walkable cell of this building (stairs: on its base level).
func random_cell() -> Vector3i:
	var t := random_tile()
	return Vector3i(t.x, t.y, level)


func capacity() -> int:
	return def().get("cap", 0)


func subject() -> String:
	return def().get("subject", "")


func required_staff() -> String:
	return def().get("staff", "")


func is_decor() -> bool:
	return Data.is_decor(id)


func is_connector() -> bool:
	return id == "stairs" or id == "elevator"


## Stairs: the row/column at the top end, as tiles.
func stair_top_tiles() -> Array:
	var out: Array = []
	for y in size.y:
		for x in size.x:
			var t := pos + Vector2i(x, y)
			match rot:
				0: if y == 0: out.append(t)
				1: if x == size.x - 1: out.append(t)
				2: if y == size.y - 1: out.append(t)
				3: if x == 0: out.append(t)
	return out


## 0 at the bottom end of a staircase, 1 at the top end.
func stair_progress(t: Vector2i) -> float:
	var l := t - pos
	match rot:
		0: return 1.0 - (l.y + 0.5) / size.y
		1: return (l.x + 0.5) / size.x
		2: return (l.y + 0.5) / size.y
		3: return 1.0 - (l.x + 0.5) / size.x
	return 0.0


## True if the building's required staff member is assigned and on site.
func is_staffed() -> bool:
	var role := required_staff()
	if role == "":
		return true
	for u in staff_uids:
		var p: Person = Game.find_person(u)
		if p != null and p.present and p.role == role:
			return true
	return false


func has_staff_assigned() -> bool:
	return required_staff() == "" or not staff_uids.is_empty()


func to_dict() -> Dictionary:
	return {"uid": uid, "id": id, "x": pos.x, "y": pos.y, "lv": level, "rot": rot, "clean": cleanliness, "cond": condition,
		"staff": staff_uids, "name": custom_name}


static func footprint(id_: String, rot_: int) -> Vector2i:
	var s: Vector2i = Data.BUILDINGS[id_]["size"]
	return Vector2i(s.y, s.x) if rot_ % 2 == 1 else s


static func from_dict(d: Dictionary) -> Building:
	var b := Building.new()
	b.uid = int(d["uid"])
	b.id = d["id"]
	b.pos = Vector2i(int(d["x"]), int(d["y"]))
	b.level = int(d.get("lv", 0))
	b.rot = int(d.get("rot", 0))
	b.size = footprint(b.id, b.rot)
	b.cleanliness = float(d.get("clean", 100))
	b.condition = float(d.get("cond", 100))
	b.custom_name = d.get("name", "")
	for u in d.get("staff", []):
		b.staff_uids.append(int(u))
	return b

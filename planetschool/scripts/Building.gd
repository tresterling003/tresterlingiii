class_name Building
extends RefCounted
## A placed structure on the campus grid (classroom, facility, decor...).

var uid: int
var id: String
var pos: Vector2i
var size: Vector2i
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


func random_tile() -> Vector2i:
	return pos + Vector2i(randi() % size.x, randi() % size.y)


func capacity() -> int:
	return def().get("cap", 0)


func subject() -> String:
	return def().get("subject", "")


func required_staff() -> String:
	return def().get("staff", "")


func is_decor() -> bool:
	return def()["cat"] == "Decor"


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
	return {"uid": uid, "id": id, "x": pos.x, "y": pos.y, "clean": cleanliness, "cond": condition,
		"staff": staff_uids, "name": custom_name}


static func from_dict(d: Dictionary) -> Building:
	var b := Building.new()
	b.uid = int(d["uid"])
	b.id = d["id"]
	b.pos = Vector2i(int(d["x"]), int(d["y"]))
	b.size = Data.BUILDINGS[b.id]["size"]
	b.cleanliness = float(d.get("clean", 100))
	b.condition = float(d.get("cond", 100))
	b.custom_name = d.get("name", "")
	for u in d.get("staff", []):
		b.staff_uids.append(int(u))
	return b

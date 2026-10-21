class_name PeopleView
extends Node3D
## Animated 3D stand-ins for every person on campus. The simulation moves
## people tile by tile; this view smooths them, seats them at desks/tables,
## sends athletes running laps and plays fight / cleaning animations.

const STUDENT_MODELS := ["students/character-female-a", "students/character-female-b", "students/character-female-c",
	"students/character-female-d", "students/character-female-e", "students/character-female-f",
	"students/character-male-a", "students/character-male-b", "students/character-male-c",
	"students/character-male-d", "students/character-male-e", "students/character-male-f"]
const STAFF_MODELS := {
	"teacher": ["staff/character-a", "staff/character-b", "staff/character-c", "staff/character-d", "staff/character-e",
		"staff/character-f", "staff/character-h", "staff/character-i", "staff/character-k", "staff/character-l"],
	"janitor": ["staff/character-g"], "security": ["staff/character-j"], "nurse": ["staff/character-m"],
	"counselor": ["staff/character-n"], "lunch": ["staff/character-o"], "coach": ["staff/character-p", "staff/character-q"],
}
const STUDENT_SCALE := 1.45
const STAFF_SCALE := 0.5
const SEATED := ["class", "eat", "study", "nurse", "counsel", "rest", "hangout", "art", "music", "game", "break"]
const STANDING := ["restroom", "locker", "snack"]
const LOOPING := ["idle", "walk", "sprint", "sit", "interact-right", "pick-up"]

var world  # World3D, for building nodes
var _views := {}  # uid -> {node, anim, cur, model}
var _seat_owner := {}  # "uid:kind:i" -> person uid
var _person_slot := {}  # person uid -> slot key
var _actions := {}  # uid -> [anim, until_time]
var _looped := {}
var _time := 0.0


func _ready() -> void:
	Game.fight_happened.connect(func(uid): play_action(uid, "attack-melee-right", 2.5))


func play_action(uid: int, anim: String, secs: float) -> void:
	_actions[uid] = [anim, _time + secs]


func view_position(uid: int):
	var v = _views.get(uid)
	return v["node"].global_position if v else null


func clear() -> void:
	for uid in _views:
		_views[uid]["node"].queue_free()
	_views.clear()
	_seat_owner.clear()
	_person_slot.clear()
	_actions.clear()


func _process(delta: float) -> void:
	_time += delta
	var seen := {}
	for p in Game.people:
		if not p.present:
			continue
		seen[p.uid] = true
		var v = _views.get(p.uid)
		if v == null:
			v = _spawn(p)
		_update(p, v, delta)
	for uid in _views.keys():
		if not seen.has(uid):
			_views[uid]["node"].queue_free()
			_views.erase(uid)
			_release(uid)


func _spawn(p: Person) -> Dictionary:
	var model: String
	var sc: float
	if p.is_student():
		model = STUDENT_MODELS[p.uid % STUDENT_MODELS.size()]
		sc = STUDENT_SCALE * (0.92 + 0.03 * (p.grade - 9))
	else:
		var opts: Array = STAFF_MODELS[p.role]
		model = opts[p.uid % opts.size()]
		sc = STAFF_SCALE
	var n := Models.spawn(self, model, Models.px_to_world(p.pos + p.jitter), sc, randf_range(0, 360))
	var ap: AnimationPlayer = n.find_child("AnimationPlayer", true, false)
	if ap and not _looped.has(model):
		_looped[model] = true
		for a in LOOPING:
			if ap.has_animation(a):
				ap.get_animation(a).loop_mode = Animation.LOOP_LINEAR
	var v := {"node": n, "anim": ap, "cur": "", "last": n.position}
	_views[p.uid] = v
	return v


func _release(uid: int) -> void:
	if _person_slot.has(uid):
		_seat_owner.erase(_person_slot[uid])
		_person_slot.erase(uid)


## Reserve a seat/spot in a building for this person; returns [local pos, facing] or [].
func _slot(p: Person, b_uid: int, kind: String) -> Array:
	var bn: Node3D = world.building_node(b_uid)
	if bn == null:
		return []
	var list: Array = bn.get_meta(kind, [])
	if list.is_empty():
		return []
	var cur: String = _person_slot.get(p.uid, "")
	var prefix := "%d:%s:" % [b_uid, kind]
	if cur.begins_with(prefix):
		return list[int(cur.substr(prefix.length())) % list.size()]
	_release(p.uid)
	var start := p.uid % list.size()
	for k in list.size():
		var i := (start + k) % list.size()
		var key := prefix + str(i)
		if not _seat_owner.has(key):
			_seat_owner[key] = p.uid
			_person_slot[p.uid] = key
			return list[i]
	return []


func _update(p: Person, v: Dictionary, delta: float) -> void:
	var n: Node3D = v["node"]
	var target := Models.px_to_world(p.pos + p.jitter * 0.6)
	var yaw := n.rotation.y
	var anim := "idle"
	var at_dest := not p.is_walking() and p.dest_uid != -1 and p.busy > 0
	var bn: Node3D = world.building_node(p.dest_uid) if at_dest else null
	var placed := false
	if bn:
		if p.role != "student" and p.activity == "work":
			var s: Array = bn.get_meta("staff")
			target = bn.transform * s[0]
			yaw = bn.rotation.y + deg_to_rad(s[1])
			placed = true
			anim = "interact-right" if int(_time * 0.25 + p.uid) % 3 == 0 else "idle"
		elif (p.activity == "sport" or (p.activity == "class" and p.schedule[p.class_period] == "PE")) and bn.get_meta("sport") != null:
			var r: Rect2 = bn.get_meta("sport")
			var ph := _time * 0.6 + p.uid * 1.37
			var local := Vector3(r.get_center().x + cos(ph) * r.size.x * 0.4, 0, r.get_center().y + sin(ph) * r.size.y * 0.4)
			target = bn.transform * local
			yaw = atan2(-sin(ph), cos(ph)) + bn.rotation.y
			anim = "sprint"
			placed = true
			_release(p.uid)
		elif p.activity in SEATED or (p.activity == "sport"):
			var seat := _slot(p, p.dest_uid, "seats")
			if seat.is_empty() and p.activity in ["hangout", "break"]:
				seat = _slot(p, p.dest_uid, "spots")
				if not seat.is_empty():
					anim = "idle"
			elif not seat.is_empty():
				anim = "sit"
			if not seat.is_empty():
				target = bn.transform * (seat[0] as Vector3)
				yaw = bn.rotation.y + deg_to_rad(seat[1])
				placed = true
		elif p.activity in STANDING:
			var spot := _slot(p, p.dest_uid, "spots")
			if not spot.is_empty():
				target = bn.transform * (spot[0] as Vector3)
				yaw = bn.rotation.y + deg_to_rad(spot[1])
				placed = true
				anim = "interact-right" if p.activity != "restroom" else "idle"
	if not placed:
		_release(p.uid)
		var moved := target - n.position
		moved.y = 0
		if moved.length() > 0.03:
			yaw = atan2(moved.x, moved.z)
			anim = "walk"
		if p.role == "janitor" and p.activity == "clean" and p.busy > 0:
			anim = "pick-up"
	# one-shot actions (fights)
	if _actions.has(p.uid):
		var act: Array = _actions[p.uid]
		if _time < act[1]:
			anim = act[0]
		else:
			_actions.erase(p.uid)
	# smooth motion; snap if far (e.g. new seat across the room)
	var dist := n.position.distance_to(target)
	if dist > 6.0:
		n.position = target
	else:
		n.position = n.position.lerp(target, clampf(delta * (14.0 if anim == "walk" else 6.0), 0, 1))
	n.rotation.y = lerp_angle(n.rotation.y, yaw, clampf(delta * 10.0, 0, 1))
	var ap: AnimationPlayer = v["anim"]
	if ap:
		ap.speed_scale = 0.0 if Game.paused else minf(1.0 + (Game.speed - 1) * 0.35, 2.5)
		if v["cur"] != anim and ap.has_animation(anim):
			ap.play(anim, 0.2)
			v["cur"] = anim

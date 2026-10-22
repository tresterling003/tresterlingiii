class_name PeopleView
extends Node3D
## Animated 3D stand-ins for everyone on campus (Quaternius CC0 characters,
## recolored per person with realistic skin tones and their own outfits). The
## simulation moves people tile by tile; this view smooths them, puts them on
## the right floor, seats them at desks/tables, sends athletes running laps and
## plays fight / clean-up animations.

const STUDENT_MODELS := ["Casual_Male", "Casual_Female", "Casual2_Male", "Casual2_Female", "Casual3_Male",
	"Casual3_Female", "Casual_Bald"]
const STAFF_MODELS := {
	"teacher": ["Suit_Male", "Suit_Female", "OldClassy_Male", "OldClassy_Female", "Casual2_Female", "Casual3_Male"],
	"janitor": ["Worker_Male", "Worker_Female"], "security": ["Suit_Male"], "nurse": ["Doctor_Female_Young", "Doctor_Male_Young"],
	"counselor": ["OldClassy_Female", "Suit_Female"], "lunch": ["Chef_Female", "Chef_Male"], "coach": ["Casual_Male", "Casual3_Male"],
}
const SKIN := [Color(0.98, 0.84, 0.72), Color(0.93, 0.75, 0.6), Color(0.82, 0.62, 0.45), Color(0.68, 0.48, 0.32),
	Color(0.52, 0.35, 0.22), Color(0.4, 0.26, 0.17), Color(0.3, 0.2, 0.13)]
const HAIR := [Color(0.08, 0.06, 0.05), Color(0.18, 0.11, 0.06), Color(0.32, 0.2, 0.1), Color(0.55, 0.38, 0.2),
	Color(0.85, 0.7, 0.42), Color(0.5, 0.18, 0.1)]
const SHIRTS := [Color(0.12, 0.2, 0.42), Color(0.75, 0.1, 0.12), Color(0.95, 0.95, 0.95), Color(0.15, 0.15, 0.16),
	Color(0.3, 0.55, 0.35), Color(0.95, 0.72, 0.2), Color(0.55, 0.6, 0.65), Color(0.6, 0.35, 0.65), Color(0.95, 0.5, 0.55),
	Color(0.35, 0.65, 0.9)]
const PANTS := [Color(0.16, 0.25, 0.45), Color(0.1, 0.12, 0.2), Color(0.12, 0.12, 0.13), Color(0.55, 0.5, 0.42),
	Color(0.35, 0.36, 0.38)]
const SEATED := ["class", "eat", "study", "nurse", "counsel", "rest", "hangout", "art", "music", "game", "break"]
const STANDING := ["restroom", "locker", "snack"]
const A := "CharacterArmature|"
const MAX_VIEWS := 320
const MAX_VIEWS_WEB := 110

var world  # World3D, for building nodes
var visible_top := 2  # people above this floor are hidden (cutaway)
var _views := {}  # uid -> {node, anim, cur, model}
var _seat_owner := {}
var _person_slot := {}
var _actions := {}  # uid -> [anim, until_time]
var _looped := {}
var _mat_cache := {}
var _time := 0.0
var _chosen := {}
var _choose_t := 0.0


func _ready() -> void:
	Game.fight_happened.connect(func(uid): play_action(uid, "Punch", 2.5))


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
	_chosen.clear()


func _process(delta: float) -> void:
	_time += delta
	_choose_t -= delta
	if _choose_t <= 0.0:
		_choose_t = 0.5
		_choose_visible()
	for p in Game.people:
		if not _chosen.has(p.uid):
			continue
		var v = _views.get(p.uid)
		if v == null:
			v = _spawn(p)
		_update(p, v, delta)
	for uid in _views.keys():
		if not _chosen.has(uid):
			_views[uid]["node"].queue_free()
			_views.erase(uid)
			_release(uid)


## Keep the nearest MAX_VIEWS visible people (by distance to the camera focus).
func _choose_visible() -> void:
	var focus: Vector3 = world.cam_target if world else Vector3.ZERO
	var cands: Array = []
	for p in Game.people:
		if p.present and p.level <= visible_top:
			var d := Models.px_to_world(p.pos).distance_squared_to(Vector3(focus.x, 0, focus.z))
			cands.append([d, p.uid])
	var cap := MAX_VIEWS_WEB if OS.has_feature("web") else MAX_VIEWS
	if cands.size() > cap:
		cands.sort_custom(func(a, b): return a[0] < b[0])
		cands = cands.slice(0, cap)
	_chosen.clear()
	for c in cands:
		_chosen[c[1]] = true


func _pick(arr: Array, seed_: int):
	return arr[absi(seed_) % arr.size()]


func _spawn(p: Person) -> Dictionary:
	var model: String
	var sc := 0.5
	if p.is_student():
		model = _pick(STUDENT_MODELS, p.uid)
		sc = 0.47 + 0.01 * (p.grade - 9)
	else:
		model = _pick(STAFF_MODELS[p.role], p.uid)
		sc = 0.52
	var ps: PackedScene = load("res://assets/people/%s.fbx" % model)
	var n: Node3D = ps.instantiate()
	n.scale = Vector3.ONE * sc
	n.position = Models.px_to_world(p.pos) + Vector3(0, p.level * Models.LEVEL_H, 0)
	add_child(n)
	_dress(n, p)
	var ap: AnimationPlayer = n.find_child("AnimationPlayer", true, false)
	if ap and not _looped.has(model):
		_looped[model] = true
		for a in ["Idle", "Walk"]:
			if ap.has_animation(A + a):
				ap.get_animation(A + a).loop_mode = Animation.LOOP_LINEAR
	var v := {"node": n, "anim": ap, "cur": ""}
	_views[p.uid] = v
	return v


## Per-person recolor: skin, hair and (for students) clothes.
func _dress(n: Node, p: Person) -> void:
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		for i in mi.mesh.get_surface_count():
			var m := mi.mesh.surface_get_material(i)
			if m == null:
				continue
			var nm := m.resource_name
			var col := Color(-1, 0, 0)
			match nm:
				"Skin":
					col = _pick(SKIN, p.uid * 7 + 3)
				"Hair":
					col = _pick(HAIR, p.uid * 13 + 1)
				"Shirt":
					if p.is_student() or p.role == "coach":
						col = _pick(SHIRTS, p.uid * 3 + 5)
					elif p.role == "security":
						col = Color(0.12, 0.16, 0.3)
				"Pants":
					if p.is_student():
						col = _pick(PANTS, p.uid * 11)
			if col.r >= 0:
				mi.set_surface_override_material(i, _tinted(m, col))
	for c in n.get_children():
		_dress(c, p)


func _tinted(m: Material, col: Color) -> Material:
	var key := "%d|%s" % [m.get_instance_id(), col.to_html()]
	if not _mat_cache.has(key):
		var nm: Material = m.duplicate()
		if nm is StandardMaterial3D:
			(nm as StandardMaterial3D).albedo_color = col
			(nm as StandardMaterial3D).roughness = 0.75
		_mat_cache[key] = nm
	return _mat_cache[key]


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


func _height(p: Person) -> float:
	var y := p.level * Models.LEVEL_H
	var b := Game.building_at(p.tile(), p.level)
	if b and b.id == "stairs" and p.level == b.level:
		y += b.stair_progress(p.tile()) * Models.LEVEL_H
	return y


func _update(p: Person, v: Dictionary, delta: float) -> void:
	var n: Node3D = v["node"]
	var target := Models.px_to_world(p.pos + p.jitter * 0.6) + Vector3(0, _height(p), 0)
	var yaw := n.rotation.y
	var anim := "Idle"
	var at_dest := not p.is_walking() and p.dest_uid != -1 and p.busy > 0
	var bn: Node3D = world.building_node(p.dest_uid) if at_dest else null
	var placed := false
	if bn:
		var pe: bool = p.is_student() and p.activity == "class" and p.class_period >= 0 and p.class_period < p.schedule.size() and p.schedule[p.class_period] == "PE"
		if not p.is_student() and p.activity == "work":
			var s: Array = bn.get_meta("staff")
			target = bn.global_transform * (s[0] as Vector3)
			yaw = bn.rotation.y + deg_to_rad(s[1])
			placed = true
			anim = "Idle"
		elif (p.activity == "sport" or pe) and bn.get_meta("sport") != null:
			var r: Rect2 = bn.get_meta("sport")
			var ph := _time * 0.45 + p.uid * 1.37
			var local := Vector3(r.get_center().x + cos(ph) * r.size.x * 0.42, 0, r.get_center().y + sin(ph) * r.size.y * 0.42)
			target = bn.global_transform * local
			yaw = atan2(-sin(ph), cos(ph))
			anim = "Run"
			placed = true
			_release(p.uid)
		elif p.activity in SEATED or p.activity == "sport":
			var seat := _slot(p, p.dest_uid, "seats")
			if seat.is_empty() and p.activity in ["hangout", "break"]:
				seat = _slot(p, p.dest_uid, "spots")
				if not seat.is_empty():
					anim = "Idle"
			elif not seat.is_empty():
				anim = "SitDown"
			if not seat.is_empty():
				target = bn.global_transform * (seat[0] as Vector3)
				yaw = bn.rotation.y + deg_to_rad(seat[1])
				placed = true
		elif p.activity in STANDING:
			var spot := _slot(p, p.dest_uid, "spots")
			if not spot.is_empty():
				target = bn.global_transform * (spot[0] as Vector3)
				yaw = bn.rotation.y + deg_to_rad(spot[1])
				placed = true
	if not placed:
		_release(p.uid)
		var moved := target - n.position
		moved.y = 0
		if moved.length() > 0.03:
			yaw = atan2(moved.x, moved.z)
			anim = "Walk"
		if p.role == "janitor" and p.activity == "clean" and p.busy > 0:
			anim = "PickUp"
	if _actions.has(p.uid):
		var act: Array = _actions[p.uid]
		if _time < act[1]:
			anim = act[0]
		else:
			_actions.erase(p.uid)
	var dist := n.position.distance_to(target)
	if dist > 6.0:
		n.position = target
	else:
		n.position = n.position.lerp(target, clampf(delta * (14.0 if anim in ["Walk", "Run"] else 6.0), 0, 1))
	n.rotation.y = lerp_angle(n.rotation.y, yaw, clampf(delta * 10.0, 0, 1))
	n.visible = p.level <= visible_top
	var ap: AnimationPlayer = v["anim"]
	if ap:
		var base := minf(1.0 + (Game.speed - 1) * 0.35, 2.5)
		ap.speed_scale = 0.0 if Game.paused else base * (1.7 if anim == "Run" else 1.0)
		var clip := A + ("Walk" if anim == "Run" else anim)
		if v["cur"] != anim and ap.has_animation(clip):
			ap.play(clip, 0.2)
			v["cur"] = anim

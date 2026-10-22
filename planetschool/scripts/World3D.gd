extends Node3D
## The 3D campus: orbit camera, sky and sun, the player-built structure
## (floors, walls, roofs) on several levels, rooms, litter, people, build
## previews and mouse picking. The UI drives it through set_tool(),
## set_level() and the construction settings below.

signal tool_changed(tool: String, build_id: String)
signal view_mode_changed(mode: String)
signal level_changed(level: int)

const T := Models.TILE
const LH := Models.LEVEL_H
const CUTAWAY_DIST := 70.0

# ---- tool state (read/written by the UI) ----
var tool := "select"  # select, build, floor, wall, roof, bulldoze
var build_id := ""
var floor_mat := 2
var wall_mat := 6
var wall_kind := 2
var roof_kind := 1
var bulldoze_filter := "all"
var auto_walls := false
var place_rot := 0
var level := 0
var view_mode := "auto"  # auto, full, cutaway

var hover := Vector2i.ZERO
var hover_vertex := Vector2i.ZERO
var camera: Camera3D
var sun: DirectionalLight3D
var env: Environment
var people: PeopleView
var scenery: Scenery
var structure: StructureView

var cam_target := Vector3.ZERO
var cam_yaw := deg_to_rad(20.0)
var cam_pitch := deg_to_rad(52.0)
var cam_dist := 70.0
var _t_target := Vector3.ZERO
var _t_yaw := 0.0
var _t_pitch := 0.0
var _t_dist := 70.0

var _bld_root: Node3D
var _bld_nodes := {}
var _bld_sig := {}
var _badges := {}
var _litter: MultiMeshInstance3D
var _grid: MeshInstance3D
var _ghost: Node3D
var _ghost_key := ""
var _ghost_ok := true
var _ghost_dirty := false
var _preview: MeshInstance3D
var _sel_ring: MeshInstance3D
var _sel_box: Node3D
var _view_key := ""
var _dragging := false
var _drag_start := Vector2i.ZERO
var _drag_vertex := Vector2i.ZERO
var _rotating := false
var _rot_moved := 0.0
var _panning := false
var _refresh_t := 0.0


func _ready() -> void:
	_setup_environment()
	camera = Camera3D.new()
	camera.fov = 50.0
	camera.near = 0.3
	camera.far = 1500.0
	add_child(camera)
	camera.make_current()
	scenery = Scenery.new()
	add_child(scenery)
	structure = StructureView.new()
	add_child(structure)
	_bld_root = Node3D.new()
	add_child(_bld_root)
	_litter = MultiMeshInstance3D.new()
	add_child(_litter)
	people = PeopleView.new()
	people.world = self
	add_child(people)
	_make_helpers()
	Game.map_changed.connect(_on_map_changed)
	Game.game_started.connect(_on_game_started)
	Game.selection_changed.connect(func(_o): _update_selection())
	_t_target = Vector3(Game.W * T * 0.5, 0, Game.H * T * 0.6)
	_t_dist = 130.0
	cam_dist = 130.0
	cam_pitch = deg_to_rad(32.0)
	_t_pitch = cam_pitch
	cam_target = _t_target
	_t_yaw = cam_yaw
	scenery.build()
	structure.rebuild()
	_apply_camera()


func _setup_environment() -> void:
	var we := WorldEnvironment.new()
	env = Environment.new()
	var sky := Sky.new()
	var psm := PanoramaSkyMaterial.new()
	var sky_path := "res://assets/sky/sky_web.exr"
	psm.panorama = load(sky_path if ResourceLoader.exists(sky_path) else "res://assets/sky/sky_2k.hdr")
	sky.sky_material = psm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.55
	env.ambient_light_sky_contribution = 0.85
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 0.95
	env.tonemap_white = 6.0
	env.ssao_enabled = true
	env.ssao_radius = 1.4
	env.ssao_intensity = 1.8
	env.ssil_enabled = true
	env.ssil_intensity = 0.8
	env.ssr_enabled = true
	env.ssr_max_steps = 48
	env.glow_enabled = true
	env.glow_intensity = 0.25
	env.glow_bloom = 0.05
	env.fog_enabled = true
	env.fog_light_color = Color(0.72, 0.8, 0.9)
	env.fog_density = 0.0006
	env.fog_aerial_perspective = 0.25
	env.fog_sky_affect = 0.3
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.12
	env.adjustment_contrast = 1.08
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 260.0
	if OS.has_feature("web"):
		sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
		sun.directional_shadow_max_distance = 140.0
	sun.shadow_blur = 1.2
	sun.light_energy = 1.4
	add_child(sun)
	_update_sun()


func _make_helpers() -> void:
	_grid = MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(Game.W * T, Game.H * T)
	_grid.mesh = pm
	var gm := ShaderMaterial.new()
	gm.shader = load("res://shaders/grid.gdshader")
	_grid.material_override = gm
	_grid.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_grid.visible = false
	add_child(_grid)
	_preview = MeshInstance3D.new()
	_preview.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_preview)
	_sel_ring = MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.45
	tm.outer_radius = 0.58
	_sel_ring.mesh = tm
	var rm := StandardMaterial3D.new()
	rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	rm.albedo_color = Color(1, 0.85, 0.2)
	_sel_ring.material_override = rm
	_sel_ring.scale = Vector3(1, 0.2, 1)
	_sel_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_sel_ring.visible = false
	add_child(_sel_ring)
	_sel_box = Node3D.new()
	add_child(_sel_box)


# =====================================================================
#  Public API (used by UI)
# =====================================================================

func set_tool(t: String, id := "") -> void:
	tool = t
	build_id = id
	_dragging = false
	if t == "build" and id != "" and id != "stairs":
		place_rot = 0
	tool_changed.emit(tool, build_id)


func set_level(l: int) -> void:
	level = clampi(l, 0, Game.LEVELS - 1)
	_ghost_key = ""
	level_changed.emit(level)


func focus(px: Vector2) -> void:
	_t_target = Models.px_to_world(px)
	_t_dist = minf(_t_dist, 35.0)


func building_node(uid: int) -> Node3D:
	return _bld_nodes.get(uid)


func cycle_view_mode() -> void:
	view_mode = {"auto": "full", "full": "cutaway", "cutaway": "auto"}[view_mode]
	view_mode_changed.emit(view_mode)


func is_cutaway() -> bool:
	if tool != "select":
		return true
	match view_mode:
		"full":
			return false
		"cutaway":
			return true
	return cam_dist < CUTAWAY_DIST


# =====================================================================
#  Frame update
# =====================================================================

func _process(delta: float) -> void:
	if not Game.running:
		_t_yaw += delta * 0.05
	_camera_input(delta)
	_apply_camera(delta)
	_update_sun()
	_mouse_update()
	_update_previews()
	_apply_view()
	if _sel_ring.visible or Game.selected is Person:
		_update_selection()
	_refresh_t += delta
	if _refresh_t > 0.5 and Game.running:
		_refresh_t = 0.0
		_refresh_litter()
		_refresh_badges()


func _apply_view() -> void:
	var cut := is_cutaway()
	var top := level if cut else Game.LEVELS - 1
	var key := "%s|%d" % [cut, top]
	if key == _view_key:
		return
	_view_key = key
	structure.set_view(top, level if cut else -1)
	for uid in _bld_nodes:
		var b: Building = Game.bld_by_uid.get(uid)
		if b:
			_bld_nodes[uid].visible = b.level <= top
	people.visible_top = top
	_grid.position = Vector3(Game.W * T * 0.5, level * LH + 0.1, Game.H * T * 0.5)


func _camera_input(delta: float) -> void:
	if _text_focused():
		return
	var move := Vector3.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		move.z -= 1
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		move.z += 1
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		move.x -= 1
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		move.x += 1
	if move != Vector3.ZERO:
		_t_target += move.normalized().rotated(Vector3.UP, cam_yaw) * delta * (18.0 + _t_dist * 0.9)
	if Input.is_key_pressed(KEY_Q):
		_t_yaw += delta * 1.6
	if Input.is_key_pressed(KEY_E):
		_t_yaw -= delta * 1.6
	_t_target.x = clampf(_t_target.x, -40, Game.W * T + 40)
	_t_target.z = clampf(_t_target.z, -40, Game.H * T + 40)


func _apply_camera(delta := 1.0) -> void:
	var k := clampf(delta * 8.0, 0, 1)
	var target := _t_target + Vector3(0, level * LH, 0)
	cam_target = cam_target.lerp(target, k)
	cam_yaw = lerp_angle(cam_yaw, _t_yaw, k)
	cam_pitch = lerpf(cam_pitch, _t_pitch, k)
	cam_dist = lerpf(cam_dist, _t_dist, k)
	var off := Vector3(0, sin(cam_pitch), cos(cam_pitch)) * cam_dist
	off = off.rotated(Vector3.UP, cam_yaw)
	camera.position = cam_target + off
	camera.look_at(cam_target, Vector3.UP)


func _update_sun() -> void:
	var m := float(Game.minute) if Game.running else 690.0
	var day_t := clampf((m - 420.0) / (1080.0 - 420.0), 0, 1)
	var elev := sin(day_t * PI) * 58.0 + 10.0
	var azim := lerpf(-75.0, 75.0, day_t)
	sun.rotation_degrees = Vector3(-elev, azim + 200.0, 0)
	var warm := 1.0 - clampf((elev - 10.0) / 35.0, 0, 1)
	sun.light_color = Color(1.0, 0.96, 0.9).lerp(Color(1.0, 0.7, 0.45), warm)
	sun.light_energy = 1.45 - warm * 0.4
	if Game.day_off:
		sun.light_energy = 0.55
	env.fog_light_color = Color(0.72, 0.8, 0.9).lerp(Color(0.9, 0.72, 0.6), warm * 0.6)


# =====================================================================
#  Input
# =====================================================================

func _text_focused() -> bool:
	var f := get_viewport().gui_get_focus_owner()
	return f is LineEdit or f is TextEdit


func _mouse_plane(y: float) -> Vector3:
	var mp := get_viewport().get_mouse_position()
	var from := camera.project_ray_origin(mp)
	var dir := camera.project_ray_normal(mp)
	var hit = Plane(Vector3.UP, y).intersects_ray(from, dir)
	return hit if hit != null else Vector3.ZERO


func _mouse_update() -> void:
	var g := _mouse_plane(level * LH)
	hover = Vector2i(floori(g.x / T), floori(g.z / T))
	hover_vertex = Vector2i(roundi(g.x / T), roundi(g.z / T))


func _unhandled_input(event: InputEvent) -> void:
	if not Game.running:
		return
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		match mb.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				if mb.pressed:
					_t_dist = clampf(_t_dist * 0.88, 6.0, 200.0)
			MOUSE_BUTTON_WHEEL_DOWN:
				if mb.pressed:
					_t_dist = clampf(_t_dist / 0.88, 6.0, 200.0)
			MOUSE_BUTTON_MIDDLE:
				_panning = mb.pressed
			MOUSE_BUTTON_RIGHT:
				if mb.pressed:
					_rotating = true
					_rot_moved = 0.0
				else:
					_rotating = false
					if _rot_moved < 6.0:
						if _dragging:
							_dragging = false
						elif tool != "select":
							set_tool("select")
						else:
							Game.select(null)
			MOUSE_BUTTON_LEFT:
				if mb.pressed:
					_on_left_press()
				else:
					_on_left_release()
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if _rotating:
			_rot_moved += mm.relative.length()
			_t_yaw -= mm.relative.x * 0.006
			_t_pitch = clampf(_t_pitch + mm.relative.y * 0.004, deg_to_rad(15), deg_to_rad(85))
		if _panning:
			var right := Vector3.RIGHT.rotated(Vector3.UP, cam_yaw)
			var fwd := Vector3.FORWARD.rotated(Vector3.UP, cam_yaw)
			_t_target -= (right * mm.relative.x - fwd * mm.relative.y) * cam_dist * 0.0016
	elif event is InputEventKey and event.pressed and not event.echo and not _text_focused():
		match event.keycode:
			KEY_SPACE:
				Game.toggle_pause()
			KEY_1:
				Game.set_speed(1)
			KEY_2:
				Game.set_speed(2)
			KEY_3:
				Game.set_speed(4)
			KEY_4:
				Game.set_speed(8)
			KEY_ESCAPE:
				set_tool("select")
			KEY_X:
				set_tool("bulldoze")
			KEY_V:
				cycle_view_mode()
			KEY_R:
				place_rot = (place_rot + 1) % 4
				_ghost_key = ""
			KEY_PAGEUP, KEY_BRACKETRIGHT:
				set_level(level + 1)
			KEY_PAGEDOWN, KEY_BRACKETLEFT:
				set_level(level - 1)


func _build_origin() -> Vector2i:
	var sz := Building.footprint(build_id, place_rot)
	return hover - Vector2i((sz.x - 1) / 2, (sz.y - 1) / 2)


func _on_left_press() -> void:
	match tool:
		"select":
			_pick()
		"build":
			var o := _build_origin()
			var why := Game.can_place(build_id, o, level, place_rot)
			if why != "":
				Game.notify.emit(why, "bad")
				return
			var style := Data.wall_style(wall_mat, 1) if auto_walls else 0
			var b := Game.place_building(build_id, o, false, level, place_rot, style)
			if b and not b.is_decor() and not b.connected:
				Game.notify.emit("%s can't be reached yet - connect it with floor and a doorway." % b.display_name(), "info")
			if not Input.is_key_pressed(KEY_SHIFT) and not b.is_decor():
				set_tool("select")
				Game.select(b)
		"floor", "roof", "bulldoze":
			_dragging = true
			_drag_start = hover
		"wall":
			_dragging = true
			_drag_vertex = hover_vertex


func _on_left_release() -> void:
	if not _dragging:
		return
	_dragging = false
	match tool:
		"floor":
			var r := _drag_rect()
			var cost := r.size.x * r.size.y * int(Data.FLOORS[floor_mat]["cost"])
			if cost > Game.money:
				Game.notify.emit("Not enough money ($%s needed)" % Game.format_money(cost), "bad")
				return
			Game.begin_batch()
			for y in range(r.position.y, r.end.y):
				for x in range(r.position.x, r.end.x):
					Game.set_floor(Vector3i(x, y, level), floor_mat)
			Game.end_batch()
		"roof":
			var r := _drag_rect()
			Game.begin_batch()
			for y in range(r.position.y, r.end.y):
				for x in range(r.position.x, r.end.x):
					Game.set_roof(Vector3i(x, y, level), roof_kind)
			Game.end_batch()
		"wall":
			var edges := Game.edges_between(_drag_vertex, hover_vertex, level)
			var style := Data.wall_style(wall_mat, wall_kind)
			var cost := edges.size() * Data.wall_cost(style)
			if cost > Game.money:
				Game.notify.emit("Not enough money ($%s needed)" % Game.format_money(cost), "bad")
				return
			Game.begin_batch()
			for e in edges:
				Game.set_wall(e, style)
			Game.end_batch()
		"bulldoze":
			Game.bulldoze_rect(_drag_rect(), level, bulldoze_filter)


func _drag_rect() -> Rect2i:
	var a := _drag_start
	var b := hover
	var p := Vector2i(mini(a.x, b.x), mini(a.y, b.y))
	return Rect2i(p, Vector2i(maxi(a.x, b.x), maxi(a.y, b.y)) - p + Vector2i.ONE)


func _pick() -> void:
	var g := _mouse_plane(level * LH)
	var best = null
	var bd := 1.2
	for p in Game.people:
		if not p.present or p.level != level and is_cutaway():
			continue
		var vp = people.view_position(p.uid)
		if vp == null:
			continue
		var d: float = Vector2(vp.x - g.x, vp.z - g.z).length()
		if d < bd:
			bd = d
			best = p
	if best:
		Game.select(best)
		return
	var b := Game.building_at(hover, level)
	if b == null and level > 0:
		for l in range(level - 1, -1, -1):
			b = Game.building_at(hover, l)
			if b and b.on_level(level):
				break
	Game.select(b)


# =====================================================================
#  Map sync
# =====================================================================

func _on_game_started() -> void:
	for c in _bld_root.get_children():
		c.queue_free()
	_bld_nodes.clear()
	_bld_sig.clear()
	for k in _badges:
		_badges[k].queue_free()
	_badges.clear()
	people.clear()
	scenery.build()
	level = 0
	level_changed.emit(0)
	_t_target = Vector3(Game.GATE.x * T, 0, Game.H * T * 0.55)
	_t_dist = 95.0
	_t_pitch = deg_to_rad(45)
	_t_yaw = deg_to_rad(15)
	_on_map_changed()


func _on_map_changed() -> void:
	structure.rebuild()
	_sync_buildings()
	scenery.refresh_campus()
	_refresh_litter()
	_refresh_badges()
	_view_key = ""


func _signature(b: Building) -> String:
	return "%d|%d|%s|%d" % [int(b.condition / 25.0), b.rot, b.custom_name, Game.wins * 100 + Game.losses]


func _sync_buildings() -> void:
	var alive := {}
	for b in Game.buildings:
		alive[b.uid] = true
		var sig := _signature(b)
		if _bld_sig.get(b.uid, "") == sig:
			continue
		if _bld_nodes.has(b.uid):
			_bld_nodes[b.uid].free()
		var n := BuildingFactory.build(b)
		_bld_root.add_child(n)
		_bld_nodes[b.uid] = n
		_bld_sig[b.uid] = sig
	for uid in _bld_nodes.keys():
		if not alive.has(uid):
			_bld_nodes[uid].queue_free()
			_bld_nodes.erase(uid)
			_bld_sig.erase(uid)
	_view_key = ""
	_update_selection()


func _refresh_litter() -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var bm := BoxMesh.new()
	bm.size = Vector3(0.36, 0.08, 0.26)
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.9
	bm.material = mat
	mm.mesh = bm
	var xfs: Array = []
	var cols: Array = []
	var top := level if is_cutaway() else Game.LEVELS - 1
	for t in Game.litter:
		if t.z > top:
			continue
		var rng := RandomNumberGenerator.new()
		rng.seed = hash(t)
		for i in int(Game.litter[t]):
			var p := Vector3((t.x + rng.randf_range(0.1, 0.9)) * T, t.z * LH + 0.09, (t.y + rng.randf_range(0.1, 0.9)) * T)
			xfs.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU), p))
			cols.append([Color(0.95, 0.95, 0.92), Color(0.85, 0.2, 0.15), Color(0.2, 0.45, 0.9), Color(0.95, 0.75, 0.2)][i % 4])
	mm.instance_count = xfs.size()
	for i in xfs.size():
		mm.set_instance_transform(i, xfs[i])
		mm.set_instance_color(i, cols[i])
	_litter.multimesh = mm


func _refresh_badges() -> void:
	var alive := {}
	var top := level if is_cutaway() else Game.LEVELS - 1
	for b in Game.buildings:
		if b.is_decor() or b.is_connector() or b.capacity() == 0 or b.level > top:
			continue
		var text := ""
		if not b.connected:
			text = "NO ACCESS"
		elif not b.has_staff_assigned():
			text = "NO STAFF"
		elif b.id in ["restroom", "cafeteria"] and b.cleanliness < 40:
			text = "DIRTY"
		if text == "":
			continue
		alive[b.uid] = true
		var l: Label3D = _badges.get(b.uid)
		if l == null:
			l = Label3D.new()
			l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			l.font_size = 40
			l.outline_size = 14
			l.pixel_size = 0.014
			l.no_depth_test = true
			add_child(l)
			_badges[b.uid] = l
		l.text = "! " + text
		l.modulate = Color(1, 0.3, 0.25) if text != "DIRTY" else Color(0.95, 0.75, 0.2)
		l.position = Vector3((b.pos.x + b.size.x * 0.5) * T, b.level * LH + 4.2, (b.pos.y + b.size.y * 0.5) * T)
	for uid in _badges.keys():
		if not alive.has(uid):
			_badges[uid].queue_free()
			_badges.erase(uid)


# =====================================================================
#  Previews & selection
# =====================================================================

func _preview_mat(ok: bool) -> Material:
	return Models.color_mat(Color(0.35, 1.0, 0.45, 0.45) if ok else Color(1.0, 0.3, 0.25, 0.45), 0.5)


func _update_previews() -> void:
	_grid.visible = tool != "select" and Game.running
	var k := Models.Kit.new()
	var y := level * LH
	match tool:
		"floor", "roof", "bulldoze":
			var r := _drag_rect() if _dragging else Rect2i(hover, Vector2i.ONE)
			var py := y + (LH + 0.3 if tool == "roof" else 0.08)
			var col := Color(1, 0.25, 0.15, 0.4) if tool == "bulldoze" else Color(0.4, 0.85, 1.0, 0.4)
			k.box(Models.color_mat(col, 0.5), Vector3((r.position.x + r.size.x * 0.5) * T, py, (r.position.y + r.size.y * 0.5) * T),
				Vector3(r.size.x * T, 0.12 if tool != "bulldoze" else 1.0, r.size.y * T))
		"wall":
			var a := _drag_vertex if _dragging else hover_vertex
			var edges := Game.edges_between(a, hover_vertex, level) if _dragging else []
			var m := _preview_mat(Data.wall_cost(Data.wall_style(wall_mat, wall_kind)) * maxi(1, edges.size()) <= Game.money)
			for e in edges:
				var c := Vector3((e.x + (0.5 if e.w == 0 else 0.0)) * T, y + 1.5, (e.y + (0.5 if e.w == 1 else 0.0)) * T)
				k.box(m, c, Vector3(T if e.w == 0 else 0.25, 3.0, 0.25 if e.w == 0 else T))
			k.cylinder(Models.color_mat(Color(1, 1, 1, 0.8), 0.5), Vector3(hover_vertex.x * T, y, hover_vertex.y * T), 0.18, 3.2, 10)
	_preview.mesh = k.commit() if not k.is_empty() else null
	if tool != "build" or build_id == "":
		if _ghost:
			_ghost.queue_free()
			_ghost = null
			_ghost_key = ""
		return
	var o := _build_origin()
	var key := "%s|%d|%d" % [build_id, place_rot, level]
	if _ghost_key != key:
		if _ghost:
			_ghost.queue_free()
		var fake := Building.new()
		fake.uid = -1
		fake.id = build_id
		fake.rot = place_rot
		fake.level = level
		fake.pos = Vector2i(-1000, -1000)
		fake.size = Building.footprint(build_id, place_rot)
		_ghost = BuildingFactory.build(fake)
		add_child(_ghost)
		Models.shadows_off(_ghost)
		_ghost_key = key
		_ghost_dirty = true
	var ok := Game.can_place(build_id, o, level, place_rot) == ""
	if ok != _ghost_ok or _ghost_dirty:
		_ghost_dirty = false
		_ghost_ok = ok
		Models.override_all(_ghost, _preview_mat(ok))
	_ghost.position = Vector3(o.x * T, y + 0.02, o.y * T)


func _update_selection() -> void:
	var sel = Game.selected
	_sel_ring.visible = false
	for c in _sel_box.get_children():
		c.queue_free()
	if sel is Person:
		var vp = people.view_position(sel.uid)
		if vp != null:
			_sel_ring.visible = true
			_sel_ring.position = vp + Vector3(0, 0.08, 0)
	elif sel is Building:
		var b: Building = sel
		var w := b.size.x * T
		var h := b.size.y * T
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.albedo_color = Color(1, 0.85, 0.2)
		var base := Vector3(b.pos.x * T, b.level * LH + 0.12, b.pos.y * T)
		Models.box(_sel_box, Vector3(w + 0.3, 0.12, 0.15), base + Vector3(w * 0.5, 0, 0), m)
		Models.box(_sel_box, Vector3(w + 0.3, 0.12, 0.15), base + Vector3(w * 0.5, 0, h), m)
		Models.box(_sel_box, Vector3(0.15, 0.12, h + 0.3), base + Vector3(0, 0, h * 0.5), m)
		Models.box(_sel_box, Vector3(0.15, 0.12, h + 0.3), base + Vector3(w, 0, h * 0.5), m)

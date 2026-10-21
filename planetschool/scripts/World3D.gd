extends Node3D
## The 3D campus: orbit camera, sky and sun, buildings, paths, litter, people,
## placement previews and mouse picking. Same public API the UI used for the
## old 2D map: set_tool(), tool, build_id, tool_changed, focus().

signal tool_changed(tool: String, build_id: String)
signal view_mode_changed(mode: String)

const T := Models.TILE
const CUTAWAY_DIST := 55.0

var tool := "select"  # select, build, sidewalk, hallway, bulldoze
var build_id := ""
var hover := Vector2i.ZERO
var view_mode := "auto"  # auto, full, cutaway

var camera: Camera3D
var sun: DirectionalLight3D
var env: Environment
var people: PeopleView
var scenery: Scenery

# camera rig (current and target values, smoothed)
var cam_target := Vector3.ZERO
var cam_yaw := deg_to_rad(20.0)
var cam_pitch := deg_to_rad(52.0)
var cam_dist := 70.0
var _t_target := Vector3.ZERO
var _t_yaw := 0.0
var _t_pitch := 0.0
var _t_dist := 70.0

var _bld_root: Node3D
var _bld_nodes := {}  # uid -> Node3D
var _bld_sig := {}  # uid -> signature string
var _badges := {}  # uid -> Label3D
var _paths: MeshInstance3D
var _litter: MultiMeshInstance3D
var _grid: MeshInstance3D
var _ghost: Node3D
var _ghost_id := ""
var _ghost_ok := true
var _ghost_dirty := false
var _tile_cursor: MeshInstance3D
var _drag_box: MeshInstance3D
var _sel_ring: MeshInstance3D
var _sel_box: Node3D
var _cutaway_now := false
var _painting := false
var _bulldozing := false
var _drag_start := Vector2i.ZERO
var _rotating := false
var _panning := false
var _refresh_t := 0.0


func _ready() -> void:
	_setup_environment()
	camera = Camera3D.new()
	camera.fov = 50.0
	camera.near = 0.3
	camera.far = 1200.0
	add_child(camera)
	camera.make_current()
	scenery = Scenery.new()
	add_child(scenery)
	_bld_root = Node3D.new()
	add_child(_bld_root)
	_paths = MeshInstance3D.new()
	_paths.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_paths)
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
	_t_dist = 120.0
	cam_dist = 120.0
	cam_pitch = deg_to_rad(32.0)
	_t_pitch = cam_pitch
	cam_target = _t_target
	scenery.build()
	_rebuild_paths()
	_t_yaw = cam_yaw
	_apply_camera()


func _setup_environment() -> void:
	var we := WorldEnvironment.new()
	env = Environment.new()
	var sky := Sky.new()
	var psm := PanoramaSkyMaterial.new()
	psm.panorama = load("res://assets/sky/sky_2k.hdr")
	sky.sky_material = psm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.5
	env.ambient_light_sky_contribution = 0.85
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 0.95
	env.tonemap_white = 6.0
	env.ssao_enabled = true
	env.ssao_radius = 1.6
	env.ssao_intensity = 1.6
	env.glow_enabled = true
	env.glow_intensity = 0.2
	env.glow_bloom = 0.04
	env.fog_enabled = true
	env.fog_light_color = Color(0.72, 0.8, 0.9)
	env.fog_density = 0.0007
	env.fog_aerial_perspective = 0.25
	env.fog_sky_affect = 0.3
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.2
	env.adjustment_contrast = 1.1
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 240.0
	sun.shadow_blur = 1.2
	sun.light_energy = 1.25
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
	_grid.position = Vector3(Game.W * T * 0.5, 0.08, Game.H * T * 0.5)
	_grid.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_grid.visible = false
	add_child(_grid)
	_tile_cursor = Models.box(self, Vector3(T, 0.12, T), Vector3.ZERO, Models.color_mat(Color(1, 1, 1, 0.35), 0.5))
	_tile_cursor.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_tile_cursor.visible = false
	_drag_box = Models.box(self, Vector3(T, 1.0, T), Vector3.ZERO, Models.color_mat(Color(1, 0.2, 0.1, 0.3), 0.5))
	_drag_box.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_drag_box.visible = false
	_sel_ring = MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.55
	tm.outer_radius = 0.7
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
	_painting = false
	_bulldozing = false
	_grid.visible = tool != "select"
	tool_changed.emit(tool, build_id)


func focus(px: Vector2) -> void:
	_t_target = Models.px_to_world(px)
	_t_dist = minf(_t_dist, 35.0)


func building_node(uid: int) -> Node3D:
	return _bld_nodes.get(uid)


func cycle_view_mode() -> void:
	view_mode = {"auto": "full", "full": "cutaway", "cutaway": "auto"}[view_mode]
	_sync_buildings()
	view_mode_changed.emit(view_mode)


# =====================================================================
#  Frame update
# =====================================================================

func _process(delta: float) -> void:
	if not Game.running:
		_t_yaw += delta * 0.05
	_camera_input(delta)
	_apply_camera(delta)
	_update_sun()
	hover = _mouse_tile()
	_update_tool_preview()
	if _sel_ring.visible or Game.selected is Person:
		_update_selection()
	var cut := _want_cutaway()
	if cut != _cutaway_now:
		_sync_buildings()
	_refresh_t += delta
	if _refresh_t > 0.5 and Game.running:
		_refresh_t = 0.0
		_refresh_litter()
		_refresh_badges()


func _want_cutaway() -> bool:
	match view_mode:
		"full":
			return false
		"cutaway":
			return true
	return cam_dist < CUTAWAY_DIST


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
	cam_target = cam_target.lerp(_t_target, k)
	cam_yaw = lerp_angle(cam_yaw, _t_yaw, k)
	cam_pitch = lerpf(cam_pitch, _t_pitch, k)
	cam_dist = lerpf(cam_dist, _t_dist, k)
	var off := Vector3(0, sin(cam_pitch), cos(cam_pitch)) * cam_dist
	off = off.rotated(Vector3.UP, cam_yaw)
	camera.position = cam_target + off
	camera.look_at(cam_target, Vector3.UP)


func _update_sun() -> void:
	var m := float(Game.minute) if Game.running else 690.0
	var day_t := clampf((m - 420.0) / (1080.0 - 420.0), 0, 1)  # 7:00 -> 18:00
	var elev := sin(day_t * PI) * 62.0 + 8.0
	var azim := lerpf(-75.0, 75.0, day_t)
	sun.rotation_degrees = Vector3(-elev, azim + 200.0, 0)
	var warm := 1.0 - clampf((elev - 8.0) / 35.0, 0, 1)
	sun.light_color = Color(1.0, 0.96, 0.9).lerp(Color(1.0, 0.68, 0.42), warm)
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


func _mouse_ground() -> Vector3:
	var mp := get_viewport().get_mouse_position()
	var from := camera.project_ray_origin(mp)
	var dir := camera.project_ray_normal(mp)
	var hit = Plane(Vector3.UP, 0).intersects_ray(from, dir)
	return hit if hit != null else Vector3.ZERO


func _mouse_tile() -> Vector2i:
	var g := _mouse_ground()
	return Vector2i(floori(g.x / T), floori(g.z / T))


func _unhandled_input(event: InputEvent) -> void:
	if not Game.running:
		return
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		match mb.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				if mb.pressed:
					_t_dist = clampf(_t_dist * 0.88, 8.0, 190.0)
			MOUSE_BUTTON_WHEEL_DOWN:
				if mb.pressed:
					_t_dist = clampf(_t_dist / 0.88, 8.0, 190.0)
			MOUSE_BUTTON_MIDDLE:
				_panning = mb.pressed
			MOUSE_BUTTON_RIGHT:
				if mb.pressed:
					_rotating = true
					_rot_moved = 0.0
				else:
					_rotating = false
					if _rot_moved < 6.0:
						if tool != "select":
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
			_t_pitch = clampf(_t_pitch + mm.relative.y * 0.004, deg_to_rad(18), deg_to_rad(85))
		if _panning:
			var right := Vector3.RIGHT.rotated(Vector3.UP, cam_yaw)
			var fwd := Vector3.FORWARD.rotated(Vector3.UP, cam_yaw)
			_t_target -= (right * mm.relative.x - fwd * mm.relative.y) * cam_dist * 0.0016
		if _painting and (tool == "sidewalk" or tool == "hallway"):
			if Game.place_path(_mouse_tile(), 1 if tool == "sidewalk" else 2):
				_rebuild_paths()
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


var _rot_moved := 0.0


func _build_origin() -> Vector2i:
	var sz: Vector2i = Data.BUILDINGS[build_id]["size"]
	return hover - Vector2i((sz.x - 1) / 2, (sz.y - 1) / 2)


func _on_left_press() -> void:
	match tool:
		"select":
			_pick()
		"build":
			var why := Game.can_place(build_id, _build_origin())
			if why != "":
				Game.notify.emit(why, "bad")
				return
			var b := Game.place_building(build_id, _build_origin())
			if b and not b.is_decor() and not b.connected:
				Game.notify.emit("%s isn't connected to a path yet." % b.display_name(), "info")
			if not Input.is_key_pressed(KEY_SHIFT) and not Data.is_decor(build_id):
				set_tool("select")
				Game.select(b)
		"sidewalk", "hallway":
			_painting = true
			if Game.place_path(hover, 1 if tool == "sidewalk" else 2):
				_rebuild_paths()
		"bulldoze":
			_drag_start = hover
			_bulldozing = true


func _on_left_release() -> void:
	if _painting:
		_painting = false
		Game._rebuild_nav()
		Game.map_changed.emit()
	if tool == "bulldoze" and _bulldozing:
		_bulldozing = false
		var r := _drag_rect()
		var any := false
		for y in range(r.position.y, r.end.y):
			for x in range(r.position.x, r.end.x):
				if Game.bulldoze(Vector2i(x, y)):
					any = true
		if any:
			Game._rebuild_nav()
			Game.map_changed.emit()


func _drag_rect() -> Rect2i:
	var a := _drag_start
	var b := hover
	var p := Vector2i(mini(a.x, b.x), mini(a.y, b.y))
	return Rect2i(p, Vector2i(maxi(a.x, b.x), maxi(a.y, b.y)) - p + Vector2i.ONE)


func _pick() -> void:
	var g := _mouse_ground()
	var best = null
	var bd := 1.4
	for p in Game.people:
		if not p.present:
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
	Game.select(Game.building_at(hover))


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
	_t_target = Vector3(Game.GATE.x * T, 0, Game.H * T * 0.72)
	_t_dist = 75.0
	_t_pitch = deg_to_rad(48)
	_t_yaw = deg_to_rad(15)
	_on_map_changed()


func _on_map_changed() -> void:
	_rebuild_paths()
	_sync_buildings()
	scenery.refresh_campus()
	_refresh_litter()
	_refresh_badges()


func _signature(b: Building, cut: bool) -> String:
	var s := "%s|%d|%d" % [cut, int(b.condition / 25.0), b.custom_name.hash()]
	if b.is_decor():
		return s
	for j in b.size.y:
		s += "%d%d" % [int(BuildingFactory._edge_open(b.pos + Vector2i(-1, j))), int(BuildingFactory._edge_open(b.pos + Vector2i(b.size.x, j)))]
	for i in b.size.x:
		s += "%d%d" % [int(BuildingFactory._edge_open(b.pos + Vector2i(i, -1))), int(BuildingFactory._edge_open(b.pos + Vector2i(i, b.size.y)))]
	return s


func _sync_buildings() -> void:
	_cutaway_now = _want_cutaway()
	var alive := {}
	for b in Game.buildings:
		alive[b.uid] = true
		var sig := _signature(b, _cutaway_now)
		if _bld_sig.get(b.uid, "") == sig:
			continue
		if _bld_nodes.has(b.uid):
			_bld_nodes[b.uid].free()
		var n := BuildingFactory.build(b, not _cutaway_now)
		_bld_root.add_child(n)
		_bld_nodes[b.uid] = n
		_bld_sig[b.uid] = sig
	for uid in _bld_nodes.keys():
		if not alive.has(uid):
			_bld_nodes[uid].queue_free()
			_bld_nodes.erase(uid)
			_bld_sig.erase(uid)
	_update_selection()


func _rebuild_paths() -> void:
	var am := ArrayMesh.new()
	var mats := {1: Models.pbr("concrete_pavement", 0.5), 2: Models.pbr("terrazzo_tiles", 0.35, Color(1.75, 1.68, 1.55)), 3: Models.pbr("concrete_pavement", 0.5, Color(0.8, 0.8, 0.8))}
	for kind in [1, 2, 3]:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		var any := false
		var y := 0.05 if kind == 2 else 0.04
		for ty in Game.H:
			for tx in Game.W:
				if Game.grid_path[ty * Game.W + tx] != kind:
					continue
				any = true
				var x0 := tx * T
				var z0 := ty * T
				var q := [Vector3(x0, y, z0), Vector3(x0 + T, y, z0), Vector3(x0 + T, y, z0 + T), Vector3(x0, y, z0 + T)]
				for i in [0, 1, 2, 0, 2, 3]:
					st.set_normal(Vector3.UP)
					st.set_uv(Vector2(q[i].x, q[i].z) / T)
					st.add_vertex(q[i])
		if any:
			st.generate_tangents()
			st.commit(am)
			am.surface_set_material(am.get_surface_count() - 1, mats[kind])
	_paths.mesh = am


func _refresh_litter() -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var bm := BoxMesh.new()
	bm.size = Vector3(0.42, 0.1, 0.3)
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.9
	bm.material = mat
	mm.mesh = bm
	var xfs: Array = []
	var cols: Array = []
	for t in Game.litter:
		var rng := RandomNumberGenerator.new()
		rng.seed = hash(t)
		for i in int(Game.litter[t]):
			var p := Vector3((t.x + rng.randf_range(0.1, 0.9)) * T, 0.08, (t.y + rng.randf_range(0.1, 0.9)) * T)
			xfs.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU), p))
			cols.append([Color(0.95, 0.95, 0.92), Color(0.85, 0.2, 0.15), Color(0.2, 0.45, 0.9), Color(0.95, 0.75, 0.2)][i % 4])
	mm.instance_count = xfs.size()
	for i in xfs.size():
		mm.set_instance_transform(i, xfs[i])
		mm.set_instance_color(i, cols[i])
	_litter.multimesh = mm


func _refresh_badges() -> void:
	var alive := {}
	for b in Game.buildings:
		if b.is_decor():
			continue
		var text := ""
		if not b.connected:
			text = "NO PATH"
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
		l.position = Vector3((b.pos.x + b.size.x * 0.5) * T, 4.6, (b.pos.y + b.size.y * 0.5) * T)
	for uid in _badges.keys():
		if not alive.has(uid):
			_badges[uid].queue_free()
			_badges.erase(uid)


# =====================================================================
#  Previews & selection
# =====================================================================

func _update_tool_preview() -> void:
	_tile_cursor.visible = tool in ["sidewalk", "hallway"]
	if _tile_cursor.visible:
		_tile_cursor.position = Models.tile_to_world(hover) + Vector3(0, 0.06, 0)
	_drag_box.visible = tool == "bulldoze"
	if _drag_box.visible:
		var r := _drag_rect() if _bulldozing else Rect2i(hover, Vector2i.ONE)
		_drag_box.scale = Vector3(r.size.x, 1, r.size.y)
		_drag_box.position = Vector3((r.position.x + r.size.x * 0.5) * T, 0.5, (r.position.y + r.size.y * 0.5) * T)
	if tool != "build":
		if _ghost:
			_ghost.queue_free()
			_ghost = null
			_ghost_id = ""
		return
	var o := _build_origin()
	if _ghost_id != build_id:
		if _ghost:
			_ghost.queue_free()
		var fake := Building.new()
		fake.uid = -1
		fake.id = build_id
		fake.pos = Vector2i(-1000, -1000)
		fake.size = Data.BUILDINGS[build_id]["size"]
		_ghost = BuildingFactory.build(fake, false)
		add_child(_ghost)
		Models.shadows_off(_ghost)
		_ghost_id = build_id
		_ghost_dirty = true
	var ok := Game.can_place(build_id, o) == ""
	if ok != _ghost_ok or _ghost_dirty:
		_ghost_dirty = false
		_ghost_ok = ok
		var m := Models.color_mat(Color(0.35, 1.0, 0.45, 0.55) if ok else Color(1.0, 0.3, 0.25, 0.55), 0.5)
		Models.override_all(_ghost, m)
	_ghost.position = Vector3(o.x * T, 0.02, o.y * T)


func _update_selection() -> void:
	var sel = Game.selected
	_sel_ring.visible = false
	for c in _sel_box.get_children():
		c.queue_free()
	if sel is Person:
		var vp = people.view_position(sel.uid)
		if vp != null:
			_sel_ring.visible = true
			_sel_ring.position = Vector3(vp.x, 0.08, vp.z)
	elif sel is Building:
		var b: Building = sel
		var w := b.size.x * T
		var h := b.size.y * T
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.albedo_color = Color(1, 0.85, 0.2)
		var base := Vector3(b.pos.x * T, 0.1, b.pos.y * T)
		Models.box(_sel_box, Vector3(w + 0.3, 0.12, 0.15), base + Vector3(w * 0.5, 0, 0), m)
		Models.box(_sel_box, Vector3(w + 0.3, 0.12, 0.15), base + Vector3(w * 0.5, 0, h), m)
		Models.box(_sel_box, Vector3(0.15, 0.12, h + 0.3), base + Vector3(0, 0, h * 0.5), m)
		Models.box(_sel_box, Vector3(0.15, 0.12, h + 0.3), base + Vector3(w, 0, h * 0.5), m)

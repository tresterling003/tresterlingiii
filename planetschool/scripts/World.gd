extends Node2D
## Draws the campus and handles map input: camera, building placement,
## path painting, bulldozing and selecting people/buildings.

signal tool_changed(tool: String, build_id: String)

const T := Game.TILE

var tool := "select"  # select, build, sidewalk, hallway, bulldoze
var build_id := ""
var hover := Vector2i.ZERO
var camera: Camera2D
var _painting := false
var _drag_start := Vector2i.ZERO
var _bulldozing := false
var _panning := false
var _font: Font


func _ready() -> void:
	_font = ThemeDB.fallback_font
	camera = Camera2D.new()
	camera.position = Vector2(Game.W * T * 0.5, Game.H * T * 0.62)
	camera.zoom = Vector2(0.9, 0.9)
	add_child(camera)
	camera.make_current()


func set_tool(t: String, id := "") -> void:
	tool = t
	build_id = id
	_painting = false
	_bulldozing = false
	tool_changed.emit(tool, build_id)


func focus(world_pos: Vector2) -> void:
	camera.position = world_pos


func _process(delta: float) -> void:
	var dir := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		dir.x -= 1
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		dir.x += 1
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		dir.y -= 1
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		dir.y += 1
	if dir != Vector2.ZERO and not _text_focused():
		camera.position += dir.normalized() * 700.0 * delta / camera.zoom.x
	camera.position = camera.position.clamp(Vector2(-200, -200), Vector2(Game.W * T + 200, Game.H * T + 300))
	hover = _mouse_tile()
	queue_redraw()


func _text_focused() -> bool:
	var f := get_viewport().gui_get_focus_owner()
	return f is LineEdit or f is TextEdit


func _mouse_tile() -> Vector2i:
	var m := get_global_mouse_position()
	return Vector2i(floori(m.x / T), floori(m.y / T))


func _build_origin() -> Vector2i:
	var sz: Vector2i = Data.BUILDINGS[build_id]["size"]
	return hover - Vector2i((sz.x - 1) / 2, (sz.y - 1) / 2)


func _unhandled_input(event: InputEvent) -> void:
	if not Game.running:
		return
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_zoom_at(1.12)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_zoom_at(1.0 / 1.12)
		elif mb.button_index == MOUSE_BUTTON_MIDDLE:
			_panning = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
			if tool != "select":
				set_tool("select")
			else:
				Game.select(null)
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				_on_left_press()
			else:
				_on_left_release()
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if _panning or (mm.button_mask & MOUSE_BUTTON_MASK_RIGHT):
			camera.position -= mm.relative / camera.zoom.x
		if _painting and (tool == "sidewalk" or tool == "hallway"):
			_paint_path(_mouse_tile())
	elif event is InputEventKey and event.pressed and not event.echo:
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


func _zoom_at(f: float) -> void:
	var before := get_global_mouse_position()
	var z := clampf(camera.zoom.x * f, 0.35, 2.5)
	camera.zoom = Vector2(z, z)
	var after := get_global_mouse_position()
	camera.position += before - after


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
			if b and b.is_decor() == false and not b.connected:
				Game.notify.emit("%s isn't connected to a path yet." % b.display_name(), "info")
			if not Input.is_key_pressed(KEY_SHIFT) and not Data.is_decor(build_id):
				set_tool("select")
				Game.select(b)
		"sidewalk", "hallway":
			_painting = true
			_paint_path(hover)
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
	return Rect2i(p, (Vector2i(maxi(a.x, b.x), maxi(a.y, b.y)) - p) + Vector2i.ONE)


func _paint_path(t: Vector2i) -> void:
	Game.place_path(t, 1 if tool == "sidewalk" else 2)


func _pick() -> void:
	var m := get_global_mouse_position()
	var best: Person = null
	var bd := 12.0 / camera.zoom.x
	for p in Game.people:
		if not p.present:
			continue
		var d: float = (p.pos + p.jitter).distance_to(m)
		if d < bd:
			bd = d
			best = p
	if best:
		Game.select(best)
		return
	Game.select(Game.building_at(hover))


# =====================================================================
#  Drawing
# =====================================================================

func _draw() -> void:
	if Game.grid_path.size() != Game.W * Game.H:
		return
	var map_px := Vector2(Game.W * T, Game.H * T)
	# Ground and surroundings
	draw_rect(Rect2(Vector2(-2000, -2000), map_px + Vector2(4000, 4000)), Color(0.16, 0.26, 0.16))
	draw_rect(Rect2(Vector2.ZERO, map_px), Color(0.33, 0.55, 0.3))
	draw_rect(Rect2(Vector2(-2000, Game.GATE.y * T + T), Vector2(map_px.x + 4000, 3 * T)), Color(0.22, 0.22, 0.24))
	for x in range(-60, Game.W + 60, 3):
		draw_rect(Rect2(Vector2(x * T, Game.GATE.y * T + T * 2.45), Vector2(T * 1.4, 4)), Color(0.95, 0.85, 0.3))
	draw_rect(Rect2(Vector2.ZERO, map_px), Color(0.2, 0.35, 0.18), false, 4.0)
	if tool != "select":
		var gc := Color(1, 1, 1, 0.07)
		for x in Game.W + 1:
			draw_line(Vector2(x * T, 0), Vector2(x * T, map_px.y), gc)
		for y in Game.H + 1:
			draw_line(Vector2(0, y * T), Vector2(map_px.x, y * T), gc)

	# Paths
	for y in Game.H:
		for x in Game.W:
			var k := Game.grid_path[y * Game.W + x]
			if k == 0:
				continue
			var r := Rect2(x * T, y * T, T, T)
			match k:
				1:
					draw_rect(r, Data.PATHS["sidewalk"]["color"])
					draw_rect(r, Color(0, 0, 0, 0.06), false, 1.0)
				2:
					draw_rect(r, Data.PATHS["hallway"]["color"])
					draw_rect(r.grow(-T * 0.3), Color(1, 1, 1, 0.06))
				3:
					draw_rect(r, Color(0.5, 0.48, 0.45))

	# Litter
	for t in Game.litter:
		var n: int = Game.litter[t]
		var rng := RandomNumberGenerator.new()
		rng.seed = hash(t)
		for i in n:
			var p := Vector2(t) * T + Vector2(rng.randf_range(4, T - 4), rng.randf_range(4, T - 4))
			draw_rect(Rect2(p, Vector2(4, 3)), [Color(0.95, 0.95, 0.9), Color(0.85, 0.3, 0.2), Color(0.3, 0.5, 0.9)][i % 3])

	# Buildings
	for b in Game.buildings:
		_draw_building(b)

	# Gate
	var gx := (Game.GATE.x - 1) * T
	var gy := Game.GATE.y * T
	draw_rect(Rect2(gx - 6, gy - 4, 6, T + 4), Color(0.45, 0.3, 0.2))
	draw_rect(Rect2(gx + 3 * T, gy - 4, 6, T + 4), Color(0.45, 0.3, 0.2))
	draw_string(_font, Vector2(gx - 60, gy + T * 1.9), "%s  -  BUS LOOP" % Game.school_name.to_upper(),
		HORIZONTAL_ALIGNMENT_CENTER, 3 * T + 120, 13, Color(1, 1, 1, 0.85))

	# People
	for p in Game.people:
		if not p.present:
			continue
		var pos: Vector2 = p.pos + p.jitter
		if p.is_student():
			draw_circle(pos, 5.5, Color(0.08, 0.08, 0.1))
			draw_circle(pos, 4.2, p.color)
			if p.sick:
				draw_circle(pos + Vector2(4, -5), 2.2, Color(0.4, 1, 0.3))
			elif p.happiness < 30:
				draw_circle(pos + Vector2(4, -5), 2.2, Color(1, 0.2, 0.2))
		else:
			draw_rect(Rect2(pos - Vector2(6, 6), Vector2(12, 12)), Color.WHITE)
			draw_rect(Rect2(pos - Vector2(4.5, 4.5), Vector2(9, 9)), p.color)

	# Selection
	var sel = Game.selected
	if sel is Person and sel.present:
		var sp: Vector2 = sel.pos + sel.jitter
		draw_arc(sp, 11, 0, TAU, 24, Color(1, 1, 0.3), 2.0)
		if not sel.path.is_empty():
			var pts := PackedVector2Array([sp])
			for t in sel.path:
				pts.append(Game.tile_center(t))
			draw_polyline(pts, Color(1, 1, 0.3, 0.5), 2.0)
	elif sel is Building:
		draw_rect(Rect2(Vector2(sel.pos) * T, Vector2(sel.size) * T).grow(3), Color(1, 1, 0.3), false, 3.0)

	_draw_ghost()
	_draw_daylight(map_px)


func _draw_building(b: Building) -> void:
	var d := b.def()
	var r := Rect2(Vector2(b.pos) * T, Vector2(b.size) * T)
	var c: Color = d["color"]
	if b.is_decor() or b.capacity() == 0:
		_draw_decor(b, r, c)
		return
	match b.id:
		"football_field":
			draw_rect(r, Color(0.55, 0.3, 0.25))
			var f := r.grow(-T * 0.6)
			draw_rect(f, c)
			for i in 11:
				var x := f.position.x + f.size.x * i / 10.0
				draw_line(Vector2(x, f.position.y), Vector2(x, f.end.y), Color(1, 1, 1, 0.7), 1.5)
			draw_rect(Rect2(f.position, Vector2(f.size.x / 10.0, f.size.y)), Color(0.1, 0.25, 0.6, 0.6))
			draw_rect(Rect2(f.end - Vector2(f.size.x / 10.0, f.size.y), Vector2(f.size.x / 10.0, f.size.y)), Color(0.6, 0.15, 0.15, 0.6))
		"basketball_court":
			draw_rect(r, c)
			draw_rect(r.grow(-4), Color.WHITE, false, 1.5)
			draw_line(Vector2(r.get_center().x, r.position.y + 4), Vector2(r.get_center().x, r.end.y - 4), Color.WHITE, 1.5)
			draw_arc(r.get_center(), T * 0.6, 0, TAU, 24, Color.WHITE, 1.5)
		"pool":
			draw_rect(r, Color(0.85, 0.85, 0.8))
			var w := r.grow(-T * 0.5)
			draw_rect(w, c)
			for i in range(1, 6):
				var y := w.position.y + w.size.y * i / 6.0
				draw_line(Vector2(w.position.x, y), Vector2(w.end.x, y), Color(1, 1, 1, 0.6), 1.0)
		_:
			draw_rect(r, c.darkened(0.35))
			var inner := r.grow(-3)
			draw_rect(inner, c.lightened(0.25))
			_draw_interior(b, inner, c)
			draw_rect(r, c.darkened(0.5), false, 2.0)
	# graffiti
	if b.condition < 70:
		var rng := RandomNumberGenerator.new()
		rng.seed = b.uid
		var marks := int((70 - b.condition) / 10) + 1
		for i in marks:
			var p := r.position + Vector2(rng.randf_range(4, r.size.x - 20), rng.randf_range(4, r.size.y - 8))
			draw_line(p, p + Vector2(10, -4), Color(0.9, 0.1, 0.8), 2.0)
			draw_line(p + Vector2(10, -4), p + Vector2(16, 4), Color(0.1, 0.9, 0.3), 2.0)
	if b.id in ["restroom", "cafeteria"] and b.cleanliness < 45:
		draw_rect(r.grow(-6), Color(0.45, 0.35, 0.1, 0.35))
	# label
	var fs := 12 if b.size.x >= 4 else 10
	draw_string(_font, r.position + Vector2(0, r.size.y * 0.5 + 4), b.display_name(), HORIZONTAL_ALIGNMENT_CENTER,
		r.size.x, fs, Color(0.05, 0.05, 0.08))
	# status badges
	var badge := ""
	if not b.connected:
		badge = "NO PATH"
	elif not b.has_staff_assigned():
		badge = "NO STAFF"
	if badge != "":
		var br := Rect2(r.position + Vector2(r.size.x * 0.5 - 30, -10), Vector2(60, 16))
		draw_rect(br, Color(0.85, 0.15, 0.1) if badge == "NO PATH" else Color(0.95, 0.65, 0.1))
		draw_string(_font, br.position + Vector2(0, 12), badge, HORIZONTAL_ALIGNMENT_CENTER, br.size.x, 10, Color.WHITE)


func _draw_interior(b: Building, r: Rect2, c: Color) -> void:
	var dark := c.darkened(0.25)
	if b.subject() != "" and b.id != "gymnasium" and b.id != "theater":
		# desks
		for y in range(1, b.size.y):
			for x in range(0, b.size.x * 2):
				var p := r.position + Vector2(8 + x * (r.size.x - 16) / (b.size.x * 2), y * T - 6)
				if p.y < r.end.y - 18:
					draw_rect(Rect2(p, Vector2(7, 5)), dark)
		draw_rect(Rect2(r.position + Vector2(6, 3), Vector2(r.size.x - 12, 4)), Color(0.15, 0.25, 0.2))
		return
	match b.id:
		"gymnasium":
			draw_rect(r.grow(-T * 0.5), Color(0.9, 0.75, 0.5))
			draw_arc(r.get_center(), T * 0.9, 0, TAU, 28, Color(0.6, 0.2, 0.15), 2.0)
			draw_line(Vector2(r.get_center().x, r.position.y + T * 0.5), Vector2(r.get_center().x, r.end.y - T * 0.5), Color(0.6, 0.2, 0.15), 2.0)
		"theater":
			draw_rect(Rect2(r.position + Vector2(T * 0.5, 4), Vector2(r.size.x - T, T)), Color(0.35, 0.05, 0.08))
			for y in range(2, b.size.y):
				draw_line(Vector2(r.position.x + 10, r.position.y + y * T), Vector2(r.end.x - 10, r.position.y + y * T), dark, 4.0)
		"cafeteria":
			for y in range(1, b.size.y):
				for x in range(1, b.size.x, 2):
					draw_rect(Rect2(r.position + Vector2(x * T - 4, y * T - 10), Vector2(T + 8, 9)), dark)
			draw_rect(Rect2(r.position + Vector2(4, 3), Vector2(r.size.x - 8, 7)), Color(0.7, 0.7, 0.75))
		"library":
			for y in range(0, b.size.y):
				draw_rect(Rect2(r.position + Vector2(6, y * T + 6), Vector2(r.size.x * 0.4, 5)), Color(0.35, 0.2, 0.1))
		"restroom":
			for x in b.size.x * 2:
				draw_rect(Rect2(r.position + Vector2(5 + x * 15, 4), Vector2(10, 12)), Color(0.95, 0.95, 1))
		"lockers":
			for x in b.size.x * 4:
				draw_rect(Rect2(r.position + Vector2(2 + x * 7.5, 2), Vector2(6, r.size.y - 4)), dark, false, 1.0)


func _draw_decor(b: Building, r: Rect2, c: Color) -> void:
	var ctr := r.get_center()
	match b.id:
		"tree":
			draw_circle(ctr + Vector2(2, 3), 13, Color(0, 0, 0, 0.25))
			draw_circle(ctr, 13, c)
			draw_circle(ctr + Vector2(-4, -4), 6, c.lightened(0.2))
		"flowers":
			for i in 6:
				draw_circle(ctr + Vector2(cos(i * 1.1) * 8, sin(i * 1.7) * 8), 3.5, [c, Color(1, 0.85, 0.2), Color(0.7, 0.4, 0.95)][i % 3])
		"bench":
			draw_rect(Rect2(r.position + Vector2(4, 10), Vector2(T - 8, 12)), c)
			draw_rect(Rect2(r.position + Vector2(4, 8), Vector2(T - 8, 3)), c.darkened(0.3))
		"trash_can":
			draw_circle(ctr, 8, c)
			draw_circle(ctr, 5, c.darkened(0.4))
		"bulletin_board":
			draw_rect(r.grow(-5), c)
			draw_rect(Rect2(r.position + Vector2(8, 9), Vector2(7, 6)), Color(1, 1, 0.6))
			draw_rect(Rect2(r.position + Vector2(17, 13), Vector2(7, 8)), Color(0.6, 0.85, 1))
		"lamp":
			draw_circle(ctr, 10, Color(1, 0.95, 0.6, 0.25))
			draw_circle(ctr, 4, c)
		"fountain":
			draw_circle(ctr, T * 0.9, Color(0.75, 0.75, 0.72))
			draw_circle(ctr, T * 0.75, c)
			draw_circle(ctr, 6, Color(0.9, 0.95, 1))
		"mascot_statue":
			draw_rect(r.grow(-8), Color(0.6, 0.6, 0.6))
			draw_circle(ctr, 14, c)
			draw_colored_polygon(PackedVector2Array([ctr + Vector2(-20, 0), ctr + Vector2(0, -10), ctr + Vector2(20, 0), ctr + Vector2(0, 4)]), c.darkened(0.2))
		"security_camera":
			draw_rect(r.grow(-9), c)
			draw_circle(ctr + Vector2(4, -4), 2.5, Color(1, 0.1, 0.1))
		"solar_panels":
			draw_rect(r.grow(-2), Color(0.6, 0.6, 0.6))
			for y in 2:
				for x in 3:
					draw_rect(Rect2(r.position + Vector2(4 + x * T, 4 + y * T), Vector2(T - 6, T - 6)), c)
		"vending":
			draw_rect(r.grow(-3), c)
			draw_rect(Rect2(r.position + Vector2(6, 6), Vector2(14, 14)), Color(0.85, 0.95, 1))
		_:
			draw_rect(r.grow(-4), c)


func _draw_ghost() -> void:
	match tool:
		"build":
			if build_id == "":
				return
			var o := _build_origin()
			var sz: Vector2i = Data.BUILDINGS[build_id]["size"]
			var ok := Game.can_place(build_id, o) == ""
			var r := Rect2(Vector2(o) * T, Vector2(sz) * T)
			draw_rect(r, Color(0.3, 1, 0.4, 0.35) if ok else Color(1, 0.25, 0.2, 0.35))
			draw_rect(r, Color(1, 1, 1, 0.8), false, 2.0)
			var d: Dictionary = Data.BUILDINGS[build_id]
			draw_string(_font, r.position + Vector2(0, -6), "%s  $%s" % [d["name"], Game.format_money(d["cost"])],
				HORIZONTAL_ALIGNMENT_CENTER, r.size.x, 13, Color.WHITE)
			if d.has("radius"):
				draw_arc(r.get_center(), d["radius"] * T, 0, TAU, 48, Color(1, 1, 1, 0.4), 1.5)
		"sidewalk", "hallway":
			draw_rect(Rect2(Vector2(hover) * T, Vector2(T, T)), Color(1, 1, 1, 0.35))
		"bulldoze":
			var r2 := Rect2(Vector2(hover) * T, Vector2(T, T))
			if _bulldozing:
				var dr := _drag_rect()
				r2 = Rect2(Vector2(dr.position) * T, Vector2(dr.size) * T)
			draw_rect(r2, Color(1, 0.2, 0.1, 0.35))
			draw_rect(r2, Color(1, 0.3, 0.2), false, 2.0)


func _draw_daylight(map_px: Vector2) -> void:
	var m := Game.minute
	var tint := Color(0, 0, 0, 0)
	if m < 500:
		tint = Color(1.0, 0.75, 0.5, 0.12 * (500 - m) / 50.0)
	elif m > 930:
		tint = Color(1.0, 0.5, 0.2, minf(0.22, 0.22 * (m - 930) / 90.0))
	if Game.day_off:
		tint = Color(0.85, 0.9, 1.0, 0.25)
	if tint.a > 0:
		draw_rect(Rect2(Vector2(-2000, -2000), map_px + Vector2(4000, 4000)), tint)

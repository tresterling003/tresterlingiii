extends CanvasLayer
## All interface built in code: main menu, HUD, build menu, info panel,
## management windows (staff, students, finance, curriculum, policies,
## report card) and notifications.

var world  # World node, set by Main

var root: Control
var hud: Control
var menu: Control
var top_labels := {}
var speed_buttons := {}
var build_list: VBoxContainer
var build_cat := "Classrooms"
var tool_buttons := {}
var info_panel: PanelContainer
var info_box: VBoxContainer
var notif_box: VBoxContainer
var window_layer: CenterContainer
var window_panel: PanelContainer
var window_name := ""
var follow_selected := false

var _info_updaters: Array = []
var _window_updaters: Array = []
var _tick := 0.0

const C_PANEL := Color(0.09, 0.11, 0.16, 0.94)
const C_ACCENT := Color(0.98, 0.72, 0.2)
const C_GOOD := Color(0.45, 0.9, 0.5)
const C_BAD := Color(1.0, 0.45, 0.4)
const C_TEXT := Color(0.93, 0.94, 0.97)
const C_DIM := Color(0.65, 0.68, 0.75)


func _ready() -> void:
	layer = 10
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = _make_theme()
	add_child(root)
	_build_hud()
	_build_menu()
	Game.notify.connect(_on_notify)
	Game.selection_changed.connect(_on_selection)
	Game.game_started.connect(_on_game_started)
	Game.scenario_won.connect(_on_scenario_won)
	world.tool_changed.connect(func(_t, _id): _refresh_build_list())


func _make_theme() -> Theme:
	var th := Theme.new()
	th.default_font_size = 14
	var panel := StyleBoxFlat.new()
	panel.bg_color = C_PANEL
	panel.set_corner_radius_all(8)
	panel.set_content_margin_all(10)
	panel.border_color = Color(1, 1, 1, 0.08)
	panel.set_border_width_all(1)
	th.set_stylebox("panel", "PanelContainer", panel)
	var btn := StyleBoxFlat.new()
	btn.bg_color = Color(0.2, 0.24, 0.33)
	btn.set_corner_radius_all(5)
	btn.content_margin_left = 8
	btn.content_margin_right = 8
	btn.content_margin_top = 4
	btn.content_margin_bottom = 4
	var hov := btn.duplicate()
	hov.bg_color = Color(0.28, 0.33, 0.45)
	var prs := btn.duplicate()
	prs.bg_color = C_ACCENT.darkened(0.25)
	var dis := btn.duplicate()
	dis.bg_color = Color(0.15, 0.16, 0.2)
	th.set_stylebox("normal", "Button", btn)
	th.set_stylebox("hover", "Button", hov)
	th.set_stylebox("pressed", "Button", prs)
	th.set_stylebox("hover_pressed", "Button", prs)
	th.set_stylebox("disabled", "Button", dis)
	th.set_color("font_color", "Button", C_TEXT)
	th.set_color("font_pressed_color", "Button", Color.BLACK)
	th.set_color("font_hover_pressed_color", "Button", Color.BLACK)
	th.set_color("font_disabled_color", "Button", Color(0.45, 0.47, 0.52))
	th.set_color("font_color", "Label", C_TEXT)
	return th


# =====================================================================
#  Widgets
# =====================================================================

func _label(text: String, size := 14, color := C_TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l


func _wrap_label(text: String, size := 13, color := C_DIM) -> Label:
	var l := _label(text, size, color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size.x = 200
	return l


func _live_label(getter: Callable, updaters: Array, size := 14, color := C_TEXT) -> Label:
	var l := _label(str(getter.call()), size, color)
	updaters.append(func(): l.text = str(getter.call()))
	return l


func _button(text: String, cb: Callable, tip := "") -> Button:
	var b := Button.new()
	b.text = text
	b.tooltip_text = tip
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(cb)
	return b


func _bar(getter: Callable, updaters: Array, color: Color, width := 150) -> ProgressBar:
	var pb := ProgressBar.new()
	pb.min_value = 0
	pb.max_value = 100
	pb.show_percentage = false
	pb.custom_minimum_size = Vector2(width, 12)
	pb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	fill.set_corner_radius_all(3)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(1, 1, 1, 0.08)
	bg.set_corner_radius_all(3)
	pb.add_theme_stylebox_override("fill", fill)
	pb.add_theme_stylebox_override("background", bg)
	pb.value = getter.call()
	updaters.append(func():
		var v: float = getter.call()
		pb.value = v
		fill.bg_color = color if v >= 35 else C_BAD)
	return pb


func _bar_row(name_: String, getter: Callable, updaters: Array, color := C_GOOD) -> HBoxContainer:
	var h := HBoxContainer.new()
	var l := _label(name_, 13, C_DIM)
	l.custom_minimum_size.x = 100
	h.add_child(l)
	h.add_child(_bar(getter, updaters, color))
	var v := _live_label(func(): return str(int(getter.call())), updaters, 12, C_DIM)
	v.custom_minimum_size.x = 30
	h.add_child(v)
	return h


func _hsep() -> HSeparator:
	return HSeparator.new()


# =====================================================================
#  HUD
# =====================================================================

func _build_hud() -> void:
	hud = Control.new()
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.visible = false
	root.add_child(hud)

	# ---- top bar ----
	var top := PanelContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 6
	top.offset_right = -6
	top.offset_top = 6
	hud.add_child(top)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	top.add_child(row)
	for key in ["name", "money", "date", "time", "students", "rating"]:
		var l := _label("", 15, C_ACCENT if key in ["name", "rating"] else C_TEXT)
		top_labels[key] = l
		row.add_child(l)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(spacer)
	for s in [0, 1, 2, 4, 8]:
		var b := _button("||" if s == 0 else "%dx" % s, func(): Game.set_speed(s) if s > 0 else Game.toggle_pause(),
			"Pause (Space)" if s == 0 else "Speed")
		b.toggle_mode = true
		speed_buttons[s] = b
		row.add_child(b)

	# ---- management dock (bottom right) ----
	var dock := PanelContainer.new()
	dock.anchor_left = 1
	dock.anchor_right = 1
	dock.anchor_top = 1
	dock.anchor_bottom = 1
	dock.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	dock.grow_vertical = Control.GROW_DIRECTION_BEGIN
	dock.offset_right = -6
	dock.offset_bottom = -6
	hud.add_child(dock)
	var drow := HBoxContainer.new()
	dock.add_child(drow)
	for w in [["Staff", "staff"], ["Students", "students"], ["Finance", "finance"], ["Curriculum", "curriculum"],
			["Policies", "policies"], ["Report Card", "report"], ["Menu", "pause"]]:
		var wid: String = w[1]
		var wb := _button(w[0], func(): _toggle_window(wid))
		wb.custom_minimum_size.y = 34
		drow.add_child(wb)

	# ---- left build panel ----
	var left := PanelContainer.new()
	left.anchor_top = 0
	left.anchor_bottom = 1
	left.offset_left = 6
	left.offset_top = 62
	left.offset_right = 270
	left.offset_bottom = -6
	hud.add_child(left)
	var lv := VBoxContainer.new()
	left.add_child(lv)
	lv.add_child(_label("BUILD", 16, C_ACCENT))
	var tools := GridContainer.new()
	tools.columns = 2
	lv.add_child(tools)
	for t in [["Select", "select", "Click people and buildings (Esc)"], ["Bulldoze", "bulldoze", "Drag to demolish, 50% refund (X)"],
			["Sidewalk $10", "sidewalk", "Click & drag to paint outdoor paths"], ["Hallway $25", "hallway", "Click & drag to paint indoor hallways"]]:
		var tid: String = t[1]
		var b := _button(t[0], func(): world.set_tool(tid), t[2])
		b.toggle_mode = true
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tool_buttons[tid] = b
		tools.add_child(b)
	lv.add_child(_hsep())
	var cats := GridContainer.new()
	cats.columns = 2
	lv.add_child(cats)
	for c in Data.CATEGORIES:
		var cat: String = c
		var b := _button(cat, func():
			build_cat = cat
			_refresh_build_list())
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cats.add_child(b)
	lv.add_child(_hsep())
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	lv.add_child(scroll)
	build_list = VBoxContainer.new()
	build_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(build_list)
	var vb := _button("View: Auto cutaway", func(): world.cycle_view_mode(), "Auto hides roofs when you zoom in (V)")
	world.view_mode_changed.connect(func(m): vb.text = "View: " + {"auto": "Auto cutaway", "full": "Roofs on", "cutaway": "Cutaway"}[m])
	lv.add_child(vb)
	lv.add_child(_wrap_label("WASD pan, Q/E or right-drag rotate, wheel zoom, middle-drag pan. Shift+click places several. Right-click / Esc cancels.", 11))

	# ---- right info panel ----
	info_panel = PanelContainer.new()
	info_panel.anchor_left = 1
	info_panel.anchor_right = 1
	info_panel.offset_left = -330
	info_panel.offset_right = -6
	info_panel.offset_top = 62
	info_panel.visible = false
	hud.add_child(info_panel)
	var iscroll := ScrollContainer.new()
	iscroll.custom_minimum_size = Vector2(310, 520)
	iscroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	info_panel.add_child(iscroll)
	info_box = VBoxContainer.new()
	info_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	iscroll.add_child(info_box)

	# ---- notifications ----
	notif_box = VBoxContainer.new()
	notif_box.anchor_left = 0
	notif_box.anchor_top = 1
	notif_box.anchor_bottom = 1
	notif_box.offset_left = 285
	notif_box.offset_right = 760
	notif_box.offset_bottom = -10
	notif_box.offset_top = -260
	notif_box.alignment = BoxContainer.ALIGNMENT_END
	notif_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(notif_box)

	# ---- window layer ----
	window_layer = CenterContainer.new()
	window_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	window_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(window_layer)

	_refresh_build_list()


func _refresh_build_list() -> void:
	if build_list == null:
		return
	for c in build_list.get_children():
		c.queue_free()
	for id in Data.BUILDINGS:
		var d: Dictionary = Data.BUILDINGS[id]
		if d["cat"] != build_cat:
			continue
		var locked: bool = d.has("unlock") and not Game.research_done.has(d["unlock"])
		var bid: String = id
		var txt := "%s   $%s" % [d["name"], Game.format_money(d["cost"])]
		if locked:
			txt = "%s  (locked)" % d["name"]
		var b := _button(txt, func(): world.set_tool("build", bid),
			d["desc"] + ("\nUnlock via Curriculum: " + Data.RESEARCH[d["unlock"]]["name"] if locked else "")
			+ "\nUpkeep: $%d/day" % d["upkeep"])
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.disabled = locked
		b.toggle_mode = true
		b.button_pressed = world.tool == "build" and world.build_id == id
		build_list.add_child(b)
	for t in tool_buttons:
		tool_buttons[t].button_pressed = world.tool == t


func _process(delta: float) -> void:
	if not Game.running:
		return
	_tick += delta
	if follow_selected and Game.selected is Person and Game.selected.present:
		world.focus(Game.selected.pos)
	if _tick < 0.2:
		return
	_tick = 0.0
	_update_top()
	for u in _info_updaters:
		u.call()
	for u in _window_updaters:
		u.call()


func _update_top() -> void:
	top_labels["name"].text = Game.school_name
	top_labels["money"].text = "$" + Game.format_money(Game.money)
	top_labels["money"].add_theme_color_override("font_color", C_BAD if Game.money < 0 else C_GOOD)
	top_labels["date"].text = Game.date_text()
	top_labels["time"].text = "%s  -  %s" % [Game.clock_text(), Game.phase_label()]
	top_labels["students"].text = "Students %d / %d seats" % [Game.students().size(), Game.seat_capacity()]
	top_labels["rating"].text = "Rating %s (%d)" % [Game.letter_grade(), int(Game.rating["overall"])]
	for s in speed_buttons:
		var on: bool = Game.paused if s == 0 else (not Game.paused and Game.speed == s)
		speed_buttons[s].set_pressed_no_signal(on)


func _on_notify(text: String, kind: String) -> void:
	if notif_box == null:
		return
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.set_corner_radius_all(6)
	sb.set_content_margin_all(6)
	match kind:
		"good": sb.bg_color = Color(0.12, 0.35, 0.18, 0.92)
		"bad": sb.bg_color = Color(0.45, 0.12, 0.12, 0.92)
		"money": sb.bg_color = Color(0.3, 0.28, 0.1, 0.92)
		"event": sb.bg_color = Color(0.35, 0.18, 0.5, 0.95)
		_: sb.bg_color = Color(0.12, 0.15, 0.22, 0.92)
	p.add_theme_stylebox_override("panel", sb)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := _wrap_label(text, 13, C_TEXT)
	p.add_child(l)
	notif_box.add_child(p)
	while notif_box.get_child_count() > 5:
		notif_box.get_child(0).free()
	var tw := p.create_tween()
	tw.tween_interval(9.0 if kind == "event" else 6.0)
	tw.tween_property(p, "modulate:a", 0.0, 1.0)
	tw.tween_callback(p.queue_free)


# =====================================================================
#  Info panel
# =====================================================================

func _on_selection(obj) -> void:
	follow_selected = false
	for c in info_box.get_children():
		c.queue_free()
	_info_updaters.clear()
	if obj == null:
		info_panel.visible = false
		return
	info_panel.visible = true
	var head := HBoxContainer.new()
	info_box.add_child(head)
	if obj is Person:
		var t := _label(obj.name, 17, C_ACCENT)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		head.add_child(t)
	else:
		var t2 := _label(obj.display_name(), 17, C_ACCENT)
		t2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		head.add_child(t2)
	head.add_child(_button("X", func(): Game.select(null)))
	if obj is Person:
		if obj.is_student():
			_info_student(obj)
		else:
			_info_staff(obj)
	else:
		_info_building(obj)


func _info_student(p: Person) -> void:
	var u := _info_updaters
	info_box.add_child(_label("%s  -  %s" % [p.role_name(), p.personality], 13, C_DIM))
	info_box.add_child(_live_label(func(): return p.state_text if p.present else "At home", u, 13))
	info_box.add_child(_live_label(func(): return "GPA %.2f   %s" % [p.gpa, "(sick)" if p.sick else ""], u, 15, C_ACCENT))
	var fb := _button("Follow", func(): follow_selected = not follow_selected)
	info_box.add_child(fb)
	info_box.add_child(_hsep())
	info_box.add_child(_bar_row("Happiness", func(): return p.happiness, u))
	info_box.add_child(_bar_row("Calm", func(): return 100 - p.stress, u, Color(0.5, 0.7, 1.0)))
	for k in ["hunger", "bladder", "energy", "social", "fun"]:
		var need: String = k
		var label: String = {"hunger": "Fed", "bladder": "Bladder", "energy": "Energy", "social": "Social", "fun": "Fun"}[need]
		info_box.add_child(_bar_row(label, func(): return p.needs[need], u, Color(0.95, 0.8, 0.35)))
	info_box.add_child(_hsep())
	info_box.add_child(_label("Schedule", 14, C_ACCENT))
	for i in p.schedule.size():
		var idx: int = i
		info_box.add_child(_live_label(func():
			var cur := "  <- now" if Game.period_index() == idx else ""
			return "P%d  %s%s" % [idx + 1, p.schedule[idx], cur], u, 13))
	info_box.add_child(_hsep())
	info_box.add_child(_label("Thoughts", 14, C_ACCENT))
	var tb := VBoxContainer.new()
	info_box.add_child(tb)
	var refresh_thoughts := func():
		for c in tb.get_children():
			c.queue_free()
		if p.thoughts.is_empty():
			tb.add_child(_wrap_label("Nothing on their mind.", 12))
		for t in p.thoughts:
			tb.add_child(_wrap_label("\"%s\"" % t["text"], 12, C_GOOD if t["good"] else C_BAD))
	refresh_thoughts.call()
	var last := [p.thoughts.size(), p.thoughts[0]["text"] if not p.thoughts.is_empty() else ""]
	u.append(func():
		var key := [p.thoughts.size(), p.thoughts[0]["text"] if not p.thoughts.is_empty() else ""]
		if key != last:
			last[0] = key[0]
			last[1] = key[1]
			refresh_thoughts.call())


func _info_staff(p: Person) -> void:
	var u := _info_updaters
	info_box.add_child(_label(p.role_name(), 13, C_DIM))
	info_box.add_child(_label("Skill: %s" % _stars(p.skill), 14, C_ACCENT))
	info_box.add_child(_live_label(func(): return "Salary $%d/day   -   %d days on staff" % [p.salary, p.days_employed], u, 13))
	info_box.add_child(_live_label(func(): return p.state_text if p.present else "Off duty", u, 13))
	info_box.add_child(_bar_row("Morale", func(): return p.morale, u))
	info_box.add_child(_hsep())
	if p.role in ["janitor", "security"]:
		info_box.add_child(_wrap_label("Roams the whole campus." if p.role == "janitor" else "Patrols the campus and responds to fights.", 12))
	else:
		info_box.add_child(_label("Assignment", 14, C_ACCENT))
		var ob := OptionButton.new()
		ob.focus_mode = Control.FOCUS_NONE
		var options: Array = []
		ob.add_item("-- none --")
		options.append(null)
		for b in Game.buildings:
			if b.required_staff() != p.role:
				continue
			if p.role == "teacher" and b.subject() != p.subject:
				continue
			ob.add_item("%s #%d" % [b.display_name(), b.uid])
			options.append(b)
			if b.uid == p.assigned_uid:
				ob.select(options.size() - 1)
		ob.item_selected.connect(func(i):
			if options[i] != null:
				Game.assign_staff_to(p, options[i])
			else:
				if Game.bld_by_uid.has(p.assigned_uid):
					Game.bld_by_uid[p.assigned_uid].staff_uids.erase(p.uid)
				p.assigned_uid = -1)
		info_box.add_child(ob)
		if options.size() == 1:
			var need := "a %s" % Data.building(Data.subject_room(p.subject))["name"] if p.role == "teacher" else "a building that needs a %s" % p.role_name()
			info_box.add_child(_wrap_label("Build %s for them to work in." % need, 12, C_BAD))
	info_box.add_child(_hsep())
	var h := HBoxContainer.new()
	info_box.add_child(h)
	h.add_child(_button("Give raise (+15%)", func():
		p.salary = int(p.salary * 1.15)
		p.morale = minf(100, p.morale + 20)
		Game.notify.emit("%s got a raise and is feeling appreciated." % p.name, "good")))
	h.add_child(_button("Fire", func(): Game.fire(p)))
	info_box.add_child(_button("Follow", func(): follow_selected = not follow_selected))


func _info_building(b: Building) -> void:
	var u := _info_updaters
	var d := b.def()
	info_box.add_child(_wrap_label(d["desc"], 12))
	info_box.add_child(_label("Upkeep $%d/day" % d["upkeep"], 13, C_DIM))
	if not b.connected:
		info_box.add_child(_wrap_label("Not connected to a path from the main gate! Paint sidewalks or hallways up to it.", 12, C_BAD))
	if b.is_decor():
		if d.get("appeal", 0) > 0:
			info_box.add_child(_label("Appeal +%d to nearby rooms" % d["appeal"], 13))
		_building_footer(b)
		return
	if b.capacity() > 0:
		info_box.add_child(_live_label(func(): return "In use: %d / %d   (visits today: %d)" % [b.occupants, b.capacity(), b.uses_today], u, 13))
	info_box.add_child(_bar_row("Cleanliness", func(): return b.cleanliness, u))
	info_box.add_child(_bar_row("Condition", func(): return b.condition, u, Color(0.6, 0.75, 1.0)))
	info_box.add_child(_live_label(func(): return "Decor appeal: %d" % int(b.appeal), u, 13, C_DIM))
	var role := b.required_staff()
	if role != "":
		info_box.add_child(_hsep())
		info_box.add_child(_label("Staff", 14, C_ACCENT))
		info_box.add_child(_live_label(func():
			if b.staff_uids.is_empty():
				return "Nobody assigned!"
			var s := Game.find_person(b.staff_uids[0])
			if s == null:
				return "Nobody assigned!"
			return "%s  (%s)  %s" % [s.name, _stars(s.skill), "on duty" if b.is_staffed() else "away"], u, 13))
		if b.staff_uids.is_empty():
			var who: String = "%s Teacher" % b.subject() if role == "teacher" else Data.STAFF_ROLES[role]["name"]
			info_box.add_child(_button("Hire a %s" % who, func(): _toggle_window("staff")))
	if b.subject() != "":
		info_box.add_child(_live_label(func():
			var n := 0
			for p in Game.people:
				if p.is_student() and p.present and p.activity == "class" and p.dest_uid == b.uid:
					n += 1
			return "Students in class now: %d" % n, u, 13))
	_building_footer(b)


func _building_footer(b: Building) -> void:
	info_box.add_child(_hsep())
	info_box.add_child(_button("Demolish (+$%s)" % Game.format_money(int(b.def()["cost"] * 0.5)), func(): Game.remove_building(b)))


func _stars(n: int) -> String:
	return "*".repeat(n) + "-".repeat(5 - n)


# =====================================================================
#  Windows
# =====================================================================

func _toggle_window(name_: String) -> void:
	if window_name == name_:
		_close_window()
		return
	_open_window(name_)


func _close_window() -> void:
	if window_panel:
		window_panel.queue_free()
	window_panel = null
	window_name = ""
	_window_updaters.clear()


func _open_window(name_: String, keep_scroll := false) -> void:
	var scroll_pos := 0
	if keep_scroll and window_panel:
		var sc := window_panel.find_child("Scroll", true, false) as ScrollContainer
		if sc:
			scroll_pos = sc.scroll_vertical
	_close_window()
	window_name = name_
	window_panel = PanelContainer.new()
	window_panel.custom_minimum_size = Vector2(720, 560)
	window_layer.add_child(window_panel)
	var v := VBoxContainer.new()
	window_panel.add_child(v)
	var head := HBoxContainer.new()
	v.add_child(head)
	var title := _label("", 20, C_ACCENT)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	head.add_child(_button("Close", _close_window))
	v.add_child(_hsep())
	var scroll := ScrollContainer.new()
	scroll.name = "Scroll"
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(scroll)
	var body := VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 6)
	scroll.add_child(body)
	match name_:
		"staff":
			title.text = "Staff & Hiring"
			_win_staff(body)
		"students":
			title.text = "Student Body"
			_win_students(body)
		"finance":
			title.text = "Finances"
			_win_finance(body)
		"curriculum":
			title.text = "Curriculum Development"
			_win_curriculum(body)
		"policies":
			title.text = "School Policies"
			_win_policies(body)
		"report":
			title.text = "Report Card"
			_win_report(body)
		"pause":
			title.text = "Game Menu"
			window_panel.custom_minimum_size = Vector2(360, 300)
			_win_pause(body)
	if scroll_pos > 0:
		await get_tree().process_frame
		if is_instance_valid(scroll):
			scroll.scroll_vertical = scroll_pos


func _grid(cols: int) -> GridContainer:
	var g := GridContainer.new()
	g.columns = cols
	g.add_theme_constant_override("h_separation", 14)
	g.add_theme_constant_override("v_separation", 4)
	return g


func _win_staff(body: VBoxContainer) -> void:
	var st := Game.staff()
	var payroll := 0
	for p in st:
		payroll += p.salary
	body.add_child(_label("%d staff  -  payroll $%s/day  -  avg morale %d" % [st.size(), Game.format_money(payroll), int(Game.average_staff_morale())], 14, C_DIM))
	# What's missing?
	var missing: Array = []
	for b in Game.buildings:
		if not b.has_staff_assigned():
			missing.append(("%s Teacher" % b.subject()) if b.required_staff() == "teacher" else Data.STAFF_ROLES[b.required_staff()]["name"])
	if not missing.is_empty():
		body.add_child(_wrap_label("Buildings waiting for staff: " + ", ".join(missing), 13, C_BAD))
	var nj := st.filter(func(p): return p.role == "janitor").size()
	var ns := st.filter(func(p): return p.role == "security").size()
	body.add_child(_label("Janitors: %d   Security: %d   (roughly 1 each per 60 students)" % [nj, ns], 13, C_DIM))
	body.add_child(_label("Hire", 16, C_ACCENT))
	body.add_child(_wrap_label("New applicants arrive every school day. Skill matters: great teachers teach faster.", 12))
	var hg := _grid(5)
	body.add_child(hg)
	for h in ["Name", "Role", "Skill", "Salary", ""]:
		hg.add_child(_label(h, 12, C_DIM))
	for p in Game.hire_pool:
		var cand: Person = p
		hg.add_child(_label(cand.name, 13))
		hg.add_child(_label(cand.role_name(), 13))
		hg.add_child(_label(_stars(cand.skill), 13, C_ACCENT))
		hg.add_child(_label("$%d/day" % cand.salary, 13))
		hg.add_child(_button("Hire", func():
			Game.hire(cand)
			_open_window("staff", true)))
	body.add_child(_hsep())
	body.add_child(_label("Current staff", 16, C_ACCENT))
	var g := _grid(6)
	body.add_child(g)
	for h in ["Name", "Role", "Skill", "Morale", "Works at", ""]:
		g.add_child(_label(h, 12, C_DIM))
	for p in st:
		var person: Person = p
		g.add_child(_label(person.name, 13))
		g.add_child(_label(person.role_name(), 13))
		g.add_child(_label(_stars(person.skill), 13, C_ACCENT))
		g.add_child(_live_label(func(): return str(int(person.morale)), _window_updaters, 13))
		var at: Building = Game.bld_by_uid.get(person.assigned_uid)
		var where := at.display_name() if at else ("Campus" if person.role in ["janitor", "security"] else "UNASSIGNED")
		g.add_child(_label(where, 13, C_BAD if where == "UNASSIGNED" else C_TEXT))
		g.add_child(_button("View", func():
			Game.select(person)
			_close_window()))


func _win_students(body: VBoxContainer) -> void:
	var studs := Game.students()
	var u := _window_updaters
	var by_grade := {9: 0, 10: 0, 11: 0, 12: 0}
	for p in studs:
		by_grade[p.grade] += 1
	body.add_child(_label("%d students   (9th: %d   10th: %d   11th: %d   12th: %d)" % [studs.size(), by_grade[9], by_grade[10], by_grade[11], by_grade[12]], 14))
	body.add_child(_live_label(func(): return "Average GPA %.2f   -   Graduates so far: %d" % [Game.average("gpa"), Game.graduates], u, 14, C_ACCENT))
	body.add_child(_bar_row("Happiness", func(): return Game.average("happiness"), u))
	body.add_child(_bar_row("Calm", func(): return 100 - Game.average("stress"), u, Color(0.5, 0.7, 1.0)))
	for k in ["hunger", "bladder", "energy", "social", "fun"]:
		var need: String = k
		body.add_child(_bar_row(need.capitalize(), func(): return Game.average_need(need), u, Color(0.95, 0.8, 0.35)))
	body.add_child(_hsep())
	body.add_child(_label("What students are saying", 16, C_ACCENT))
	var tt := Game.top_thoughts(8)
	if tt.is_empty():
		body.add_child(_wrap_label("Nothing yet - wait for the school day to get going.", 12))
	for t in tt:
		body.add_child(_wrap_label("%d students: \"%s\"" % [t["count"], t["text"]], 13, C_GOOD if t["good"] else C_BAD))
	body.add_child(_hsep())
	body.add_child(_label("Students (least happy first)", 16, C_ACCENT))
	var sorted := studs.duplicate()
	sorted.sort_custom(func(a, b): return a.happiness < b.happiness)
	var g := _grid(6)
	body.add_child(g)
	for h in ["Name", "Grade", "Type", "GPA", "Happy", ""]:
		g.add_child(_label(h, 12, C_DIM))
	for p in sorted.slice(0, 150):
		var s: Person = p
		g.add_child(_label(s.name, 13))
		g.add_child(_label(str(s.grade), 13))
		g.add_child(_label(s.personality, 13))
		g.add_child(_label("%.2f" % s.gpa, 13, C_GOOD if s.gpa >= 3.0 else (C_BAD if s.gpa < 2.0 else C_TEXT)))
		g.add_child(_label(str(int(s.happiness)), 13, C_BAD if s.happiness < 35 else C_TEXT))
		g.add_child(_button("View", func():
			Game.select(s)
			if s.present:
				world.focus(s.pos)
			_close_window()))


func _win_finance(body: VBoxContainer) -> void:
	var u := _window_updaters
	body.add_child(_live_label(func(): return "Bank balance: $%s" % Game.format_money(Game.money), u, 18, C_ACCENT))
	body.add_child(_live_label(func(): return "Outstanding loan: $%s" % Game.format_money(Game.loan), u, 14))
	var payroll := 0
	for p in Game.staff():
		payroll += p.salary
	var upkeep := 0
	for b in Game.buildings:
		upkeep += b.def()["upkeep"]
	var n := Game.students().size()
	var funding := int(n * 22 * (0.5 + Game.rating["overall"] / 100.0))
	body.add_child(_label("Daily estimate", 16, C_ACCENT))
	var g := _grid(2)
	body.add_child(g)
	for row in [["State funding (%d students x rating)" % n, funding], ["Tuition", n * Game.policies["tuition"]],
			["Salaries", -payroll], ["Building upkeep", -upkeep]]:
		g.add_child(_label(row[0], 13))
		g.add_child(_label("$" + Game.format_money(row[1]), 13, C_GOOD if row[1] >= 0 else C_BAD))
	body.add_child(_wrap_label("Plus cafeteria meals, vending, Friday football tickets, events, grants and test score bonuses.", 12))
	body.add_child(_button("Take a $50,000 loan (repay $60,000)", func():
		Game.take_loan()
		_open_window("finance")))
	body.add_child(_hsep())
	body.add_child(_label("Today so far", 16, C_ACCENT))
	var tg := _grid(2)
	body.add_child(tg)
	for k in Game.finance_today:
		tg.add_child(_label(k, 13))
		var v: int = Game.finance_today[k]
		tg.add_child(_label("$" + Game.format_money(v), 13, C_GOOD if v >= 0 else C_BAD))
	body.add_child(_hsep())
	body.add_child(_label("Recent days", 16, C_ACCENT))
	var hg := _grid(4)
	body.add_child(hg)
	for h in ["Day", "Income", "Expenses", "Net"]:
		hg.add_child(_label(h, 12, C_DIM))
	var hist := Game.finance_history.duplicate()
	hist.reverse()
	for e in hist.slice(0, 14):
		var net: int = e["income"] - e["expense"]
		hg.add_child(_label(str(e["day"]), 13))
		hg.add_child(_label("$" + Game.format_money(e["income"]), 13, C_GOOD))
		hg.add_child(_label("$" + Game.format_money(e["expense"]), 13, C_BAD))
		hg.add_child(_label("$" + Game.format_money(net), 13, C_GOOD if net >= 0 else C_BAD))


func _win_curriculum(body: VBoxContainer) -> void:
	var u := _window_updaters
	body.add_child(_wrap_label("Your faculty develops new programs over time. Curriculum points come from the Principal's Office, the Library, and your teachers' skill.", 13))
	body.add_child(_live_label(func():
		if Game.research_current == "":
			return "Not developing anything. Pick a program below!"
		var r: Dictionary = Data.RESEARCH[Game.research_current]
		return "Developing: %s  (%d / %d points)" % [r["name"], int(Game.research_progress), r["cost"]], u, 15, C_ACCENT))
	body.add_child(_hsep())
	for id in Data.RESEARCH:
		var rid: String = id
		var r: Dictionary = Data.RESEARCH[rid]
		var h := HBoxContainer.new()
		body.add_child(h)
		var v := VBoxContainer.new()
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		h.add_child(v)
		v.add_child(_label("%s   (%d pts)" % [r["name"], r["cost"]], 14))
		var req_ok: bool = r["req"] == "" or Game.research_done.has(r["req"])
		var desc: String = r["desc"]
		if not req_ok:
			desc += "  Requires: %s" % Data.RESEARCH[r["req"]]["name"]
		v.add_child(_wrap_label(desc, 12))
		if Game.research_done.has(rid):
			h.add_child(_label("DONE", 14, C_GOOD))
		elif Game.research_current == rid:
			h.add_child(_label("IN PROGRESS", 13, C_ACCENT))
		else:
			var b := _button("Develop", func():
				Game.research_current = rid
				Game.research_progress = 0.0
				_open_window("curriculum", true))
			b.disabled = not req_ok
			h.add_child(b)


func _win_policies(body: VBoxContainer) -> void:
	body.add_child(_wrap_label("Policies shape learning, happiness and safety. Changes take effect immediately.", 13))
	body.add_child(_hsep())
	# tuition
	var tl := _label("", 14)
	body.add_child(tl)
	var ts := HSlider.new()
	ts.min_value = 0
	ts.max_value = 50
	ts.step = 5
	ts.value = Game.policies["tuition"]
	ts.custom_minimum_size.x = 400
	var upd_t := func(v):
		Game.policies["tuition"] = int(v)
		tl.text = "Daily tuition per student: $%d  %s" % [int(v), "(public school - free)" if v == 0 else "(fewer families apply)"]
	upd_t.call(ts.value)
	ts.value_changed.connect(upd_t)
	body.add_child(ts)
	# lunch
	var ll := _label("", 14)
	body.add_child(ll)
	var ls := HSlider.new()
	ls.min_value = 2
	ls.max_value = 10
	ls.step = 1
	ls.value = Game.policies["lunch_price"]
	ls.custom_minimum_size.x = 400
	var upd_l := func(v):
		Game.policies["lunch_price"] = int(v)
		ll.text = "Cafeteria lunch price: $%d  %s" % [int(v), "(students complain at $7+)" if v >= 7 else ""]
	upd_l.call(ls.value)
	ls.value_changed.connect(upd_l)
	body.add_child(ls)
	body.add_child(_hsep())
	body.add_child(_option_row("Phone policy", ["allow", "ban"], ["Phones allowed (happier)", "Phones banned (+10% learning, more rule-breaking)"], "phones"))
	body.add_child(_option_row("Homework load", ["light", "normal", "heavy"], ["Light (-learning, less stress)", "Normal", "Heavy (+learning, more stress)"], "homework"))
	var cb := CheckBox.new()
	cb.text = "School uniforms (-20% misbehavior)"
	cb.button_pressed = Game.policies["uniforms"]
	cb.focus_mode = Control.FOCUS_NONE
	cb.toggled.connect(func(on): Game.policies["uniforms"] = on)
	body.add_child(cb)
	body.add_child(_hsep())
	body.add_child(_label("School name", 14, C_ACCENT))
	var le := LineEdit.new()
	le.text = Game.school_name
	le.text_submitted.connect(func(t):
		Game.school_name = t
		le.release_focus())
	le.text_changed.connect(func(t): Game.school_name = t)
	body.add_child(le)


func _option_row(title: String, keys: Array, labels: Array, policy: String) -> HBoxContainer:
	var h := HBoxContainer.new()
	var l := _label(title, 14)
	l.custom_minimum_size.x = 140
	h.add_child(l)
	var ob := OptionButton.new()
	ob.focus_mode = Control.FOCUS_NONE
	for i in keys.size():
		ob.add_item(labels[i])
		if Game.policies[policy] == keys[i]:
			ob.select(i)
	ob.item_selected.connect(func(i): Game.policies[policy] = keys[i])
	h.add_child(ob)
	return h


func _win_report(body: VBoxContainer) -> void:
	var u := _window_updaters
	Game.compute_ratings()
	body.add_child(_live_label(func(): return "%s  -  Overall %s  (%d / 100)" % [Game.school_name, Game.letter_grade(), int(Game.rating["overall"])], u, 18, C_ACCENT))
	for k in [["academics", "Academics (GPA)"], ["welfare", "Student welfare"], ["attendance", "Attendance"],
			["safety", "Safety"], ["cleanliness", "Cleanliness"], ["facilities", "Facilities"]]:
		var key: String = k[0]
		var h := HBoxContainer.new()
		var l := _label(k[1], 14)
		l.custom_minimum_size.x = 160
		h.add_child(l)
		h.add_child(_bar(func(): return Game.rating[key], u, C_GOOD, 300))
		h.add_child(_live_label(func(): return Game.letter_grade(Game.rating[key]), u, 14, C_ACCENT))
		body.add_child(h)
	body.add_child(_wrap_label("Tips: classrooms need teachers; students need restrooms, lunch and fun; janitors fight litter and graffiti; security and the principal stop fights; decor near classrooms boosts learning.", 12))
	body.add_child(_hsep())
	body.add_child(_label("%s Football: %d W - %d L" % [Game.team_name, Game.wins, Game.losses], 15))
	var scen: Dictionary = Data.SCENARIOS[Game.scenario_id]
	body.add_child(_hsep())
	body.add_child(_label("Scenario: %s" % scen["name"], 16, C_ACCENT))
	body.add_child(_wrap_label(scen["desc"], 13))
	for g in scen["goals"]:
		var goal: Dictionary = g
		body.add_child(_live_label(func():
			var pr := Game.goal_progress(goal)
			var cur: String = ("%.2f" % pr[0]) if goal["type"] == "gpa" else Game.format_money(int(pr[0]))
			return "[%s]  %s   (now: %s)" % ["X" if pr[1] else "  ", pr[2], cur], u, 14))
	if Game.won_scenario:
		body.add_child(_label("SCENARIO COMPLETE!", 16, C_GOOD))


func _win_pause(body: VBoxContainer) -> void:
	body.add_child(_button("Resume", _close_window))
	body.add_child(_button("Save game", func():
		Game.save_game()
		_close_window()))
	var lb := _button("Load game", func():
		_close_window()
		Game.load_game())
	lb.disabled = not Game.has_save()
	body.add_child(lb)
	body.add_child(_button("Quit to main menu", func():
		_close_window()
		Game.running = false
		Game.select(null)
		hud.visible = false
		menu.visible = true
		_refresh_menu()))
	body.add_child(_hsep())
	body.add_child(_wrap_label("Keys: Space pause, 1-4 speed, X bulldoze, V cutaway view, Esc cancel, WASD pan, Q/E rotate, mouse wheel zoom.", 12))


# =====================================================================
#  Main menu
# =====================================================================

var _menu_name: LineEdit
var _menu_load: Button


func _build_menu() -> void:
	menu = ColorRect.new()
	(menu as ColorRect).color = Color(0.03, 0.05, 0.09, 0.35)
	menu.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(menu)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	menu.add_child(cc)
	var mp := PanelContainer.new()
	cc.add_child(mp)
	var v := VBoxContainer.new()
	v.custom_minimum_size.x = 640
	v.add_theme_constant_override("separation", 10)
	mp.add_child(v)
	var title := _label("PlanetSchool", 64, C_ACCENT)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(title)
	var sub := _label("Build it. Staff it. Graduate them.  A high school management sim.", 18, C_DIM)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(sub)
	v.add_child(_hsep())
	var h := HBoxContainer.new()
	v.add_child(h)
	h.add_child(_label("School name:", 16))
	_menu_name = LineEdit.new()
	_menu_name.text = "Sterling High"
	_menu_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(_menu_name)
	for id in Data.SCENARIOS:
		var sid: String = id
		var s: Dictionary = Data.SCENARIOS[sid]
		var p := PanelContainer.new()
		v.add_child(p)
		var row := HBoxContainer.new()
		p.add_child(row)
		var tv := VBoxContainer.new()
		tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(tv)
		tv.add_child(_label("%s   -   starting budget $%s" % [s["name"], Game.format_money(s["money"])], 16, C_ACCENT))
		tv.add_child(_wrap_label(s["desc"], 13))
		var b := _button("Play", func(): _start(sid))
		b.custom_minimum_size = Vector2(90, 40)
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(b)
	_menu_load = _button("Continue saved game", func():
		if Game.load_game():
			menu.visible = false)
	v.add_child(_menu_load)
	v.add_child(_button("Quit", func(): get_tree().quit()))
	_refresh_menu()


func _refresh_menu() -> void:
	_menu_load.disabled = not Game.has_save()


func _start(sid: String) -> void:
	Game.new_game(sid, _menu_name.text)


func _on_game_started() -> void:
	menu.visible = false
	hud.visible = true
	_close_window()
	_on_selection(null)
	_refresh_build_list()


func _on_scenario_won(name_: String) -> void:
	_open_window("report")
	Game.paused = true

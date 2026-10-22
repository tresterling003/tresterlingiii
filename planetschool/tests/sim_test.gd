extends Node
## Headless smoke test: builds a small walled school by hand, then runs the
## Eagle Ridge two-story example for several days and checks people use the
## upper floor, then saves and reloads.

func run_days(n: int) -> void:
	for d in n:
		var start := Game.day
		var guard := 0
		while Game.day == start and guard < 2000:
			guard += 1
			Game._tick()
			for p in Game.people:
				if p.present and not p.path.is_empty():
					Game._move(p, Game.SEC_PER_MIN)
		var h = Game.finance_history.back()
		print("Day %d  $%d  students %d  gpa %.2f  happy %.0f  att %.0f  safety %.0f  overall %.0f %s  inc %d exp %d" % [
			Game.day - 1, Game.money, Game.students().size(), Game.average("gpa"), Game.average("happiness"),
			Game.rating["attendance"], Game.rating["safety"], Game.rating["overall"], Game.letter_grade(), h["income"], h["expense"]])


func _ready() -> void:
	var main = load("res://scenes/Main.tscn").instantiate()
	add_child(main)
	await get_tree().process_frame
	var ui = main.get_node("UI")
	# ---- hand-built school: walls, a doorway and a classroom upstairs ----
	ui._start("fresh_start")
	await get_tree().process_frame
	Game.money = 2000000
	Game.begin_batch()
	for y in range(20, 43):
		Game.set_floor(Vector3i(36, y, 0), 2)
	var math := Game.place_building("math_room", Vector2i(32, 20), false, 0)
	var eng := Game.place_building("english_room", Vector2i(37, 20), false, 0, 0, Data.wall_style(1, 1))
	Game.build_room_walls(math, Data.wall_style(6, 2))
	var st := Game.place_building("stairs", Vector2i(37, 24), false, 0, 2)  # top at south end
	for x in range(36, 40):
		Game.set_floor(Vector3i(x, 28, 1), 2)
	var up := Game.place_building("history_room", Vector2i(36, 29), false, 1)
	Game.end_batch()
	print("math connected ", math.connected, "  english connected ", eng.connected, "  stairs ", st != null, "  upstairs room connected ", up.connected)
	var wall_count := 0
	for e in Game.edges_between(math.pos, math.pos + math.size, 0):
		if Game.get_wall(e) > 0:
			wall_count += 1
	print("math walls ", wall_count, " doorways passable ", Data.wall_passable(Data.wall_style(6, 3)))
	# walling the english room shut must make it unreachable
	for e in Game.edges_between(eng.pos, eng.pos + eng.size, 0):
		Game.set_wall(e, Data.wall_style(1, 1))
	print("english after sealing: connected ", eng.connected)
	# ---- helpers: lay hallway, undo, move/rotate, hire ----
	Game.checkpoint()
	var why := Game.auto_connect(eng)
	print("auto-connect sealed english: '%s' connected %s" % [why, eng.connected])
	Game.undo()
	print("after undo: english connected ", eng.connected)
	var before_money := Game.money
	var n_before := Game.buildings.size()
	Game.checkpoint()
	var lab := Game.place_building("science_lab", Vector2i(10, 10), false, 0, 1)
	print("rotated lab size ", lab.size, " connected ", lab.connected, " spent ", before_money - Game.money)
	Game.checkpoint()
	print("connect far lab: '%s' connected %s" % [Game.auto_connect(lab), lab.connected])
	Game.undo()
	Game.undo()
	print("undo place: buildings %d -> %d  money back %s" % [n_before, Game.buildings.size(), Game.money == before_money])
	var mv := Game.move_building(math, Vector2i(40, 30), 0, 1)
	print("move math: '%s' pos %s size %s connected %s" % [mv, math.pos, math.size, math.connected])
	print("move onto english: '%s'" % Game.move_building(math, Vector2i(37, 20), 0, 0))
	var node := BuildingFactory.build(math)
	print("rotated node basis x ", node.transform.basis.x.snapped(Vector3.ONE * 0.01), " origin ", node.transform.origin)
	node.free()
	print("connect_all ", Game.connect_all(), "  hired ", Game.hire_missing_staff())
	var world = ui.world
	for t in [["build", "cafeteria"], ["floor", ""], ["wall", ""], ["roof", ""], ["bulldoze", ""], ["select", ""]]:
		world.set_tool(t[0], t[1])
		world._process(0.016)
		ui._process(0.3)
		print("hint %s: %s" % [t[0], str(world.hint())])
	world.start_move(math)
	world._process(0.016)
	print("hint move: ", world.hint())
	world.cancel()
	print("todo: ", ui._todo_items().map(func(i): return [i[0], i[1]]))
	# ---- Eagle Ridge: the two-story example ----
	ui._start("eagle_ridge")
	await get_tree().process_frame
	var lv1 := Game.buildings.filter(func(b): return b.level == 1)
	var unreachable := Game.buildings.filter(func(b): return not b.is_decor() and b.capacity() > 0 and not b.connected)
	print("Eagle Ridge: buildings ", Game.buildings.size(), "  upstairs rooms ", lv1.size(), "  unreachable ",
		unreachable.map(func(b): return "%s@%d,%d L%d" % [b.id, b.pos.x, b.pos.y, b.level]))
	print("staff ", Game.staff().size(), " students ", Game.students().size(), " seats ", Game.seat_capacity())
	Game.paused = true
	var upstairs_seen := 0
	for d in 1:
		var start := Game.day
		while Game.day == start:
			Game._tick()
			for p in Game.people:
				if p.present and not p.path.is_empty():
					Game._move(p, Game.SEC_PER_MIN)
			if Game.minute == 620:
				var counts := {}
				for p in Game.students():
					counts[p.state_text.left(18)] = counts.get(p.state_text.left(18), 0) + 1
					if p.present and p.level == 1:
						upstairs_seen += 1
				print("  10:20 upstairs students: ", upstairs_seen)
				var top: Array = counts.keys()
				top.sort_custom(func(a, b): return counts[a] > counts[b])
				print("  10:20 states: ", top.slice(0, 8).map(func(k): return "%s=%d" % [k, counts[k]]))
		var h = Game.finance_history.back()
		print("Day %d  students %d  gpa %.2f  happy %.0f  att %.0f  overall %.0f %s  inc %d exp %d" % [
			Game.day - 1, Game.students().size(), Game.average("gpa"), Game.average("happiness"),
			Game.rating["attendance"], Game.rating["overall"], Game.letter_grade(), h["income"], h["expense"]])
	run_days(5)
	for w in ["staff", "students", "finance", "curriculum", "policies", "report", "pause"]:
		ui._open_window(w)
		await get_tree().process_frame
	ui._close_window()
	Game.select(Game.buildings[0])
	ui._process(1.0)
	Game.select(Game.students()[0])
	ui._process(1.0)
	print("thoughts: ", Game.top_thoughts(5))
	Game.save_game()
	var nb := Game.buildings.size()
	Game.load_game()
	print("after load: buildings ", Game.buildings.size(), "/", nb, " students ", Game.students().size())
	ui._start("riverside")
	await get_tree().process_frame
	run_days(2)
	print("DONE")
	get_tree().quit()

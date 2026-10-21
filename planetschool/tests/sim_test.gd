extends Node

func _ready() -> void:
	var main = load("res://scenes/Main.tscn").instantiate()
	add_child(main)
	await get_tree().process_frame
	var ui = main.get_node("UI")
	ui._start("fresh_start")
	await get_tree().process_frame
	# Spine hallway + cross hallway
	for y in range(12, 43):
		Game.place_path(Vector2i(36, y), 2)
	for x in range(14, 60):
		Game.place_path(Vector2i(x, 26), 2)
		Game.place_path(Vector2i(x, 16), 2)
	Game._rebuild_nav()
	Game.money = 2000000
	var plan = [["math_room", 30, 23], ["math_room", 30, 27], ["english_room", 38, 23], ["english_room", 38, 27],
		["history_room", 42, 23], ["history_room", 42, 27], ["science_lab", 24, 23], ["science_lab", 24, 27],
		["language_room", 46, 23], ["art_studio", 46, 27], ["music_room", 50, 27], ["gymnasium", 14, 27],
		["restroom", 33, 28], ["restroom", 33, 17], ["cafeteria", 37, 9], ["lockers", 31, 25], ["library", 50, 17],
		["principal_office", 37, 17], ["staff_room", 42, 17], ["nurse_office", 46, 17], ["counselor_office", 29, 17],
		["vending", 35, 25], ["trash_can", 35, 27], ["tree", 34, 30], ["mascot_statue", 37, 33], ["student_lounge", 20, 17],
		["football_field", 14, 34]]
	for e in plan:
		var b = Game.place_building(e[0], Vector2i(e[1], e[2]))
		if b == null:
			print("FAILED place ", e, " ", Game.can_place(e[0], Vector2i(e[1], e[2])))
		elif not b.connected:
			print("NOT CONNECTED ", e)
	for x in range(37, 44):
		Game.place_path(Vector2i(x, 14), 2)
	Game.place_path(Vector2i(36, 14), 2)
	Game._rebuild_nav()
	# Hire one of every candidate twice over
	for round_ in 2:
		for c in Game.hire_pool.duplicate():
			Game.hire(c)
		Game._refresh_hire_pool()
	for i in 150:
		Game._add_person(Game._make_student(9 + randi() % 4))
	print("staff ", Game.staff().size(), " students ", Game.students().size(), " seats ", Game.seat_capacity())
	# open every window
	for w in ["staff", "students", "finance", "curriculum", "policies", "report", "pause"]:
		ui._open_window(w)
		await get_tree().process_frame
	ui._close_window()
	Game.research_current = "comp_sci"
	Game.paused = true
	for d in 12:
		var start_day = Game.day
		var guard = 0
		while Game.day == start_day and guard < 2000:
			guard += 1
			Game._tick()
			for p in Game.people:
				if p.present and not p.path.is_empty():
					Game._move(p, Game.SEC_PER_MIN)
			if Game.minute == 620 and d == 1:
				var s = Game.students()[0]
				Game.select(s)
				ui._process(1.0)
				var counts = {}
				for p in Game.students():
					counts[p.state_text] = counts.get(p.state_text, 0) + 1
				print("  10:20 states: ", counts)
				var t = Game.staff()[0]
				Game.select(t)
				ui._process(1.0)
				Game.select(Game.buildings[0])
				ui._process(1.0)
		var h = Game.finance_history.back()
		print("Day %d  $%d  students %d  gpa %.2f  happy %.0f  att %.0f  safety %.0f clean %.0f fac %.0f overall %.0f %s  litter %d  inc %d exp %d" % [
			Game.day - 1, Game.money, Game.students().size(), Game.average("gpa"), Game.average("happiness"),
			Game.rating["attendance"], Game.rating["safety"], Game.rating["cleanliness"], Game.rating["facilities"], Game.rating["overall"], Game.letter_grade(), Game.total_litter(), h["income"], h["expense"]])
	print("thoughts: ", Game.top_thoughts(8))
	print("research done: ", Game.research_done.keys())
	Game.save_game()
	Game.load_game()
	print("after load: ", Game.students().size(), " bld ", Game.buildings.size())
	Game.new_game("riverside", "Riverside High")
	for i in 3 * 600:
		Game._tick()
		for p in Game.people:
			if p.present and not p.path.is_empty():
				Game._move(p, Game.SEC_PER_MIN)
	print("riverside day ", Game.day, " rating ", Game.letter_grade(), " students ", Game.students().size())
	for w in ["staff", "students", "finance", "curriculum", "policies", "report"]:
		ui._open_window(w)
		await get_tree().process_frame
	print("DONE")
	get_tree().quit()

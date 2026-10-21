class_name Scenery
extends Node3D
## Everything around the campus: lawn, street, school bus, neighborhood houses,
## trees, the campus fence and front gate, plus scattered grass tufts.

const T := Models.TILE

var _campus_grass: MultiMeshInstance3D
var _gate_label: Label3D


func build() -> void:
	for c in get_children():
		c.queue_free()
	var cw := Game.W * T
	var ch := Game.H * T
	var center := Vector3(cw * 0.5, 0, ch * 0.5)
	# ground
	var ground := Models.plane(self, Vector2(900, 900), Vector3(center.x, 0, center.z), Models.pbr("leafy_grass", 0.12, Color(0.62, 0.86, 0.42)))
	ground.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var rng := RandomNumberGenerator.new()
	rng.seed = 1234
	_road(cw, ch)
	_bus(Vector3(Game.GATE.x * T - 14, 0, ch + 4.2))
	_fence(cw, ch)
	_gate(ch)
	_neighborhood(cw, ch, rng)
	_outside_grass(cw, ch, rng)
	_campus_grass = MultiMeshInstance3D.new()
	_campus_grass.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_campus_grass)
	refresh_campus()


func refresh_campus() -> void:
	if _gate_label:
		_gate_label.text = Game.school_name.to_upper()
	if _campus_grass == null:
		return
	var m: Array = Models.mesh_of("nature/grass_large")
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = m[0]
	var rng := RandomNumberGenerator.new()
	rng.seed = 77
	var xfs: Array = []
	for i in 2600:
		var t := Vector2i(rng.randi_range(0, Game.W - 1), rng.randi_range(0, Game.H - 2))
		var px := rng.randf()
		var pz := rng.randf()
		if Game.floor_at(Vector3i(t.x, t.y, 0)) > 0 or Game.building_at(t) != null:
			continue
		var xf := Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * rng.randf_range(2.5, 4.0)),
			Vector3((t.x + px) * T, 0, (t.y + pz) * T))
		xfs.append(xf * m[1])
	mm.instance_count = xfs.size()
	for i in xfs.size():
		mm.set_instance_transform(i, xfs[i])
	_campus_grass.multimesh = mm
	if DisplayServer.get_name() != "headless":
		_campus_grass.material_override = Models.green_version(m[0].surface_get_material(0))


func _road(cw: float, ch: float) -> void:
	var z := ch + 6.0
	var x := -160.0
	while x < cw + 160.0:
		Models.spawn(self, "roads/road-straight", Vector3(x, 0.01, z), 8.0, 90)
		x += 8.0
	# sidewalk strips on both sides of the street
	var walk := Models.pbr("concrete_pavement", 0.5)
	Models.box(self, Vector3(cw + 320, 0.12, 2.0), Vector3(cw * 0.5, 0.06, ch + 1.0), walk)
	Models.box(self, Vector3(cw + 320, 0.12, 2.6), Vector3(cw * 0.5, 0.06, ch + 11.3), walk)
	x = -150.0
	while x < cw + 150.0:
		Models.spawn(self, "roads/light-square", Vector3(x, 0.1, ch + 11.0), 7.5, 180)
		x += 24.0


func _bus(p: Vector3) -> void:
	var bus := Node3D.new()
	bus.position = p
	add_child(bus)
	var yellow := Models.color_mat(Color(0.98, 0.72, 0.05), 0.45, 0.2)
	var black := Models.color_mat(Color(0.05, 0.05, 0.06), 0.6)
	var glass := Models.color_mat(Color(0.15, 0.2, 0.25), 0.08, 0.3)
	Models.box(bus, Vector3(10.5, 2.3, 2.5), Vector3(0, 1.55, 0), yellow)
	Models.box(bus, Vector3(1.6, 1.3, 2.4), Vector3(5.9, 1.05, 0), yellow)
	Models.box(bus, Vector3(10.52, 0.12, 2.52), Vector3(0, 1.25, 0), black)
	Models.box(bus, Vector3(8.6, 0.7, 2.54), Vector3(-0.6, 2.15, 0), glass)
	Models.box(bus, Vector3(0.06, 0.9, 2.2), Vector3(5.26, 2.1, 0), glass)
	Models.box(bus, Vector3(10.6, 0.25, 2.6), Vector3(0, 0.45, 0), black)
	for wx in [-3.6, 4.6]:
		for wz in [-1.15, 1.15]:
			var wheel := Models.cylinder(bus, 0.5, 0.35, Vector3(wx, 0.325, wz), black)
			wheel.rotation.x = PI * 0.5
	var stop := Models.box(bus, Vector3(0.05, 0.35, 0.5), Vector3(-1.0, 1.7, -1.3), Models.color_mat(Color(0.8, 0.05, 0.05), 0.5))
	stop.rotation.x = 0
	var lbl := Label3D.new()
	lbl.text = "SCHOOL BUS"
	lbl.font_size = 64
	lbl.pixel_size = 0.008
	lbl.modulate = Color(0.05, 0.05, 0.06)
	lbl.outline_size = 0
	lbl.position = Vector3(0, 2.62, -1.27)
	lbl.rotation.y = PI
	bus.add_child(lbl)


func _fence(cw: float, ch: float) -> void:
	var gx0 := (Game.GATE.x - 1) * T
	var gx1 := (Game.GATE.x + 2) * T
	var x := 2.0
	while x < cw:
		Models.spawn(self, "nature/fence_simple", Vector3(x, 0, 0), 4.0)
		if x + 2.0 <= gx0 or x - 2.0 >= gx1:
			Models.spawn(self, "nature/fence_simple", Vector3(x, 0, ch), 4.0)
		x += 4.0
	var z := 2.0
	while z < ch:
		Models.spawn(self, "nature/fence_simple", Vector3(0, 0, z), 4.0, 90)
		Models.spawn(self, "nature/fence_simple", Vector3(cw, 0, z), 4.0, 90)
		z += 4.0


func _gate(ch: float) -> void:
	var brick := Models.color_mat(Color(0.62, 0.27, 0.2), 0.9)
	var cap := Models.pbr("concrete_pavement", 0.8)
	var gx0 := (Game.GATE.x - 1) * T - 0.6
	var gx1 := (Game.GATE.x + 2) * T + 0.6
	for x in [gx0, gx1]:
		Models.box(self, Vector3(1.1, 3.6, 1.1), Vector3(x, 1.8, ch), brick)
		Models.box(self, Vector3(1.3, 0.25, 1.3), Vector3(x, 3.72, ch), cap)
	Models.box(self, Vector3(gx1 - gx0, 0.7, 0.3), Vector3((gx0 + gx1) * 0.5, 4.1, ch), Models.color_mat(Color(0.12, 0.2, 0.42), 0.6))
	_gate_label = Label3D.new()
	_gate_label.text = Game.school_name.to_upper()
	_gate_label.font_size = 48
	_gate_label.pixel_size = 0.009
	_gate_label.outline_size = 0
	_gate_label.modulate = Color(1, 0.85, 0.3)
	_gate_label.position = Vector3((gx0 + gx1) * 0.5, 4.1, ch + 0.17)
	add_child(_gate_label)
	var back := _gate_label.duplicate() as Label3D
	back.position.z = ch - 0.17
	back.rotation.y = PI
	add_child(back)


func _neighborhood(cw: float, ch: float, rng: RandomNumberGenerator) -> void:
	var houses := "abcdefghijklmnopqrstu"
	# Row of houses across the street, facing the school.
	var x := -110.0
	while x < cw + 110.0:
		var kind := "suburban/building-type-" + houses[rng.randi() % houses.length()]
		Models.place(self, kind, Vector3(x, 0, ch + 22.0), 7.5, 180)
		Models.spawn(self, "suburban/tree-large", Vector3(x + 8.0, 0, ch + 18.0), 6.0, rng.randf() * 360)
		x += 17.0
	# Houses beside and behind the campus.
	for side in [-1, 1]:
		var z := -40.0
		while z < ch - 4.0:
			var hx := -22.0 if side < 0 else cw + 22.0
			var kind := "suburban/building-type-" + houses[rng.randi() % houses.length()]
			Models.place(self, kind, Vector3(hx, 0, z), 7.5, -90 if side < 0 else 90)
			z += 17.0
	x = -40.0
	while x < cw + 40.0:
		var kind := "suburban/building-type-" + houses[rng.randi() % houses.length()]
		Models.place(self, kind, Vector3(x, 0, -24.0), 7.5, 0)
		x += 17.0
	# A belt of trees around everything.
	var trees := ["nature/tree_oak", "nature/tree_default", "nature/tree_pineRoundA", "nature/tree_pineTallA",
		"nature/tree_tall", "nature/tree_simple", "suburban/tree-large"]
	for i in 260:
		var p := Vector3(rng.randf_range(-170, cw + 170), 0, rng.randf_range(-120, ch + 110))
		var inside := p.x > -34 and p.x < cw + 34 and p.z > -36 and p.z < ch + 30
		if inside:
			continue
		Models.spawn(self, trees[rng.randi() % trees.size()], p, rng.randf_range(4.0, 6.5), rng.randf() * 360)
	for i in 50:
		var p := Vector3(rng.randf_range(-12, cw + 12), 0, rng.randf_range(-12, -3))
		if rng.randf() < 0.5:
			p = Vector3(rng.randf_range(-12, -3) if rng.randf() < 0.5 else rng.randf_range(cw + 3, cw + 12), 0, rng.randf_range(0, ch))
		Models.spawn(self, trees[rng.randi() % trees.size()], p, rng.randf_range(3.8, 5.5), rng.randf() * 360)


func _outside_grass(cw: float, ch: float, rng: RandomNumberGenerator) -> void:
	for model in ["nature/grass_large", "nature/grass", "nature/plant_bush"]:
		var m: Array = Models.mesh_of(model)
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = m[0]
		var xfs: Array = []
		var n := 3000 if model != "nature/plant_bush" else 400
		for i in n:
			var p := Vector3(rng.randf_range(-130, cw + 130), 0, rng.randf_range(-90, ch + 90))
			if p.x > -1 and p.x < cw + 1 and p.z > -1 and p.z < ch + 14:
				continue
			var s := rng.randf_range(2.5, 4.5) if model != "nature/plant_bush" else rng.randf_range(3.0, 6.0)
			xfs.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * s), p) * m[1])
		mm.instance_count = xfs.size()
		for i in xfs.size():
			mm.set_instance_transform(i, xfs[i])
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		if DisplayServer.get_name() != "headless":
			mmi.material_override = Models.green_version(m[0].surface_get_material(0))
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mmi)

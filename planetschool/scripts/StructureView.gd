class_name StructureView
extends Node3D
## Renders the player-built structure: floors, walls (solid, windows, doors,
## glass curtain walls, railings, fences) and roofs, one set of meshes per
## level. Walls are built twice - full height and cut down - so the cutaway
## view can switch instantly.

const T := Models.TILE
const LH := Models.LEVEL_H
const WALL_T := 0.22
const CUT_H := 1.3

var floors: Array = []  # per level MeshInstance3D
var walls_full: Array = []
var walls_cut: Array = []
var roofs: Array = []


func _ready() -> void:
	for lv in Game.LEVELS:
		for arr in [floors, walls_full, walls_cut, roofs]:
			var mi := MeshInstance3D.new()
			add_child(mi)
			arr.append(mi)
		floors[lv].cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON


func rebuild() -> void:
	for lv in Game.LEVELS:
		floors[lv].mesh = _build_floors(lv)
		walls_full[lv].mesh = _build_walls(lv, LH)
		walls_cut[lv].mesh = _build_walls(lv, CUT_H)
		roofs[lv].mesh = _build_roofs(lv)


## Which pieces are visible: everything up to `top`; walls of `cut_level` cut down.
func set_view(top: int, cut_level: int) -> void:
	for lv in Game.LEVELS:
		var shown := lv <= top
		floors[lv].visible = shown
		walls_full[lv].visible = shown and lv != cut_level
		walls_cut[lv].visible = shown and lv == cut_level
		roofs[lv].visible = shown and lv < cut_level if cut_level >= 0 else shown


# ---------------------------------------------------------------------
#  Materials
# ---------------------------------------------------------------------

static func floor_material(id: int) -> Material:
	if id == Data.GATE_FLOOR:
		return Models.pbr("concrete_pavement", 0.5, Color(0.85, 0.85, 0.85))
	var f: Dictionary = Data.FLOORS.get(id, Data.FLOORS[2])
	return Models.pbr(f["tex"], f["uv"], f["tint"], 1.0)


static func wall_material(mat: int) -> Material:
	var w: Dictionary = Data.WALL_MATERIALS.get(mat, Data.WALL_MATERIALS[1])
	if w.get("fence", false):
		return Models.color_mat(Color(0.62, 0.64, 0.66, 0.45), 0.5, 0.8)
	return Models.pbr(w["tex"], w.get("uv", 0.5), w.get("color", Color.WHITE), 1.0, 0.6 if w.get("metal", false) else 0.0)


static func frame_material() -> Material:
	return Models.color_mat(Color(0.16, 0.17, 0.19), 0.35, 0.8)


static func roof_material(kind: int) -> Material:
	var r: Dictionary = Data.ROOFS.get(kind, Data.ROOFS[1])
	if r.has("tex"):
		return Models.pbr(r["tex"], 0.4, r.get("tint", Color.WHITE))
	return Models.color_mat(r["color"], 0.3 if r.get("solar", false) else 0.85, 0.5 if r.get("solar", false) else 0.0)


static func slab_material() -> Material:
	return Models.pbr("smooth_concrete_floor", 0.3, Color(0.78, 0.78, 0.78))


# ---------------------------------------------------------------------
#  Floors
# ---------------------------------------------------------------------

func _build_floors(lv: int) -> ArrayMesh:
	var k := Models.Kit.new()
	var y := lv * LH
	for ty in Game.H:
		for tx in Game.W:
			var c := Vector3i(tx, ty, lv)
			var id: int = Game.grid_floor[Game.cidx(c)]
			if id == 0:
				continue
			var x0 := tx * T
			var z0 := ty * T
			var top := y + (0.05 if lv == 0 else 0.04)
			var m := floor_material(id)
			if lv == 0:
				k.quad(m, Vector3(x0, top, z0), Vector3(x0 + T, top, z0), Vector3(x0 + T, top, z0 + T), Vector3(x0, top, z0 + T), Vector3.UP)
			else:
				k.quad(m, Vector3(x0, top, z0), Vector3(x0 + T, top, z0), Vector3(x0 + T, top, z0 + T), Vector3(x0, top, z0 + T), Vector3.UP)
				k.box(slab_material(), Vector3(x0 + T * 0.5, y - 0.16, z0 + T * 0.5), Vector3(T, 0.3, T))
	return k.commit()


# ---------------------------------------------------------------------
#  Walls
# ---------------------------------------------------------------------

func _build_walls(lv: int, h: float) -> ArrayMesh:
	var k := Models.Kit.new()
	for y in Game.H + 1:
		for x in Game.W + 1:
			for dir in 2:
				var e := Vector4i(x, y, lv, dir)
				var style := Game.get_wall(e)
				if style > 0:
					_wall(k, e, style, h)
	return k.commit()


## Transform that maps local wall space (x along the wall from -1..1 m, y up,
## z through the wall) onto edge `e`.
func _edge_xf(e: Vector4i) -> Transform3D:
	var base := Vector3(e.x * T, e.z * LH, e.y * T)
	if e.w == 0:
		return Transform3D(Basis.IDENTITY, base + Vector3(T * 0.5, 0, 0))
	return Transform3D(Basis(Vector3.UP, PI * 0.5), base + Vector3(0, 0, T * 0.5))


func _wall(k: Models.Kit, e: Vector4i, style: int, h: float) -> void:
	var xf := _edge_xf(e)
	var mat_id := Data.wall_mat(style)
	var kind := Data.wall_kind(style)
	var wd: Dictionary = Data.WALL_MATERIALS.get(mat_id, {})
	var m := wall_material(mat_id)
	var fr := frame_material()
	var gl := Models.glass_mat()
	var L := T + WALL_T  # overlap neighbors so corners close
	if wd.get("fence", false):
		var fh := minf(h, 1.9)
		k.box(m, Vector3(0, fh * 0.5, 0), Vector3(T, fh, 0.03), xf)
		k.cylinder(fr, Vector3(-T * 0.5, 0, 0), 0.04, fh + 0.05, 8, xf)
		k.box(fr, Vector3(0, fh, 0), Vector3(T, 0.05, 0.05), xf)
		return
	match kind:
		1:  # solid
			k.box(m, Vector3(0, h * 0.5, 0), Vector3(L, h, WALL_T), xf)
		2:  # window
			var sill := minf(h, 0.95)
			k.box(m, Vector3(0, sill * 0.5, 0), Vector3(L, sill, WALL_T), xf)
			if h > sill:
				var top := minf(h, 2.75)
				k.box(gl, Vector3(0, (sill + top) * 0.5, 0), Vector3(T - 0.3, top - sill, 0.04), xf)
				k.box(fr, Vector3(-T * 0.5 + 0.18, (sill + top) * 0.5, 0), Vector3(0.06, top - sill, 0.1), xf)
				k.box(fr, Vector3(T * 0.5 - 0.18, (sill + top) * 0.5, 0), Vector3(0.06, top - sill, 0.1), xf)
				k.box(fr, Vector3(0, (sill + top) * 0.5, 0), Vector3(0.05, top - sill, 0.08), xf)
				k.box(fr, Vector3(0, sill + 0.03, 0), Vector3(T - 0.3, 0.06, 0.14), xf)
				# pier beside the glass
				k.box(m, Vector3(-T * 0.5 + 0.08, (sill + top) * 0.5, 0), Vector3(0.16 + WALL_T * 0.5, top - sill, WALL_T), xf)
				k.box(m, Vector3(T * 0.5 - 0.08, (sill + top) * 0.5, 0), Vector3(0.16 + WALL_T * 0.5, top - sill, WALL_T), xf)
				if h > top:
					k.box(m, Vector3(0, (top + h) * 0.5, 0), Vector3(L, h - top, WALL_T), xf)
		3:  # doorway
			var jamb := 0.42
			k.box(m, Vector3(-T * 0.5 + jamb * 0.5 - WALL_T * 0.25, h * 0.5, 0), Vector3(jamb + WALL_T * 0.5, h, WALL_T), xf)
			k.box(m, Vector3(T * 0.5 - jamb * 0.5 + WALL_T * 0.25, h * 0.5, 0), Vector3(jamb + WALL_T * 0.5, h, WALL_T), xf)
			k.box(fr, Vector3(-T * 0.5 + jamb, minf(h, 2.3) * 0.5, 0), Vector3(0.05, minf(h, 2.3), WALL_T + 0.04), xf)
			k.box(fr, Vector3(T * 0.5 - jamb, minf(h, 2.3) * 0.5, 0), Vector3(0.05, minf(h, 2.3), WALL_T + 0.04), xf)
			if h > 2.3:
				k.box(m, Vector3(0, (2.3 + h) * 0.5, 0), Vector3(L, h - 2.3, WALL_T), xf)
		4, 5:  # glass curtain wall / glass doors
			var open_h := 2.35 if kind == 5 else 0.0
			if h > open_h:
				k.box(gl, Vector3(0, (open_h + h) * 0.5, 0), Vector3(T, h - open_h, 0.03), xf)
			for mx in [-T * 0.5, 0.0, T * 0.5]:
				if kind == 5 and mx == 0.0:
					continue
				k.box(fr, Vector3(mx, h * 0.5, 0), Vector3(0.07, h, 0.12), xf)
			for ty in [0.05, 1.2, 2.35, h - 0.04]:
				if ty <= h and not (kind == 5 and ty < 2.3):
					k.box(fr, Vector3(0, ty, 0), Vector3(T, 0.07, 0.1), xf)
			if kind == 5:
				# open door leaves swung against the frame
				k.box(gl, Vector3(-T * 0.5 + 0.12, minf(h, 2.3) * 0.5, -0.45), Vector3(0.03, minf(h, 2.3), 0.9), xf)
				k.box(gl, Vector3(T * 0.5 - 0.12, minf(h, 2.3) * 0.5, -0.45), Vector3(0.03, minf(h, 2.3), 0.9), xf)
		6:  # half wall / glass railing
			var rh := minf(h, 1.1)
			k.box(gl, Vector3(0, rh * 0.5, 0), Vector3(T, rh, 0.03), xf)
			k.box(Models.color_mat(Color(0.8, 0.82, 0.85), 0.25, 0.9), Vector3(0, rh, 0), Vector3(T + 0.05, 0.06, 0.08), xf)
			k.box(fr, Vector3(-T * 0.5, rh * 0.5, 0), Vector3(0.05, rh, 0.05), xf)


# ---------------------------------------------------------------------
#  Roofs
# ---------------------------------------------------------------------

func _build_roofs(lv: int) -> ArrayMesh:
	var k := Models.Kit.new()
	var y := (lv + 1) * LH
	var coping := Models.color_mat(Color(0.82, 0.82, 0.8), 0.6)
	for ty in Game.H:
		for tx in Game.W:
			var c := Vector3i(tx, ty, lv)
			var kind := Game.roof_at(c)
			if kind == 0:
				continue
			var x0 := tx * T
			var z0 := ty * T
			var m := roof_material(kind)
			k.box(m, Vector3(x0 + T * 0.5, y + 0.12, z0 + T * 0.5), Vector3(T, 0.24, T))
			if Data.ROOFS[kind].get("solar", false):
				var cell := Models.color_mat(Color(0.06, 0.09, 0.22), 0.15, 0.7)
				for i in 2:
					var panel := Transform3D(Basis(Vector3.RIGHT, deg_to_rad(-12)), Vector3(x0 + T * 0.5, y + 0.45, z0 + 0.5 + i * 1.0))
					k.box(cell, Vector3.ZERO, Vector3(T - 0.2, 0.05, 0.85), panel)
			# parapet where the roof ends
			for n in [[Vector3i(tx, ty - 1, lv), Vector3(x0 + T * 0.5, 0, z0), Vector3(T + 0.3, 0, 0.3)],
					[Vector3i(tx, ty + 1, lv), Vector3(x0 + T * 0.5, 0, z0 + T), Vector3(T + 0.3, 0, 0.3)],
					[Vector3i(tx - 1, ty, lv), Vector3(x0, 0, z0 + T * 0.5), Vector3(0.3, 0, T + 0.3)],
					[Vector3i(tx + 1, ty, lv), Vector3(x0 + T, 0, z0 + T * 0.5), Vector3(0.3, 0, T + 0.3)]]:
				if Game.roof_at(n[0]) == 0:
					var p: Vector3 = n[1]
					var s: Vector3 = n[2]
					k.box(coping, Vector3(p.x, y + 0.45, p.z), Vector3(s.x, 0.9, s.z))
	return k.commit()

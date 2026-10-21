class_name Models
extends RefCounted
## Loads and caches the CC0 Kenney models and Poly Haven materials used by the
## 3D world. All world units are meters; one campus tile is Models.TILE meters.

const TILE := 2.0
const ROOT := "res://assets/models/"
const TEX := "res://assets/textures/"

static var _scenes := {}
static var _mats := {}
static var _meshes := {}


static func scene(path: String) -> PackedScene:
	if not _scenes.has(path):
		_scenes[path] = load(ROOT + path + ".glb")
	return _scenes[path]


## Instance a model, scaled uniformly, positioned and rotated (degrees, Y axis).
static func spawn(parent: Node3D, path: String, pos: Vector3, scale := 1.0, rot_deg := 0.0) -> Node3D:
	var ps := scene(path)
	if ps == null:
		push_warning("Missing model " + path)
		return null
	var n: Node3D = ps.instantiate()
	if path.begins_with("nature/"):
		_greenify(n)
	n.scale = Vector3.ONE * scale
	n.position = pos
	n.rotation.y = deg_to_rad(rot_deg)
	parent.add_child(n)
	return n


## The Nature Kit ships with teal foliage; shift it to natural greens.
static func _greenify(n: Node) -> void:
	if DisplayServer.get_name() == "headless":
		return
	if n is MeshInstance3D:
		var mi := n as MeshInstance3D
		for i in mi.mesh.get_surface_count():
			var m := mi.mesh.surface_get_material(i)
			var g := green_version(m)
			if g != m:
				mi.set_surface_override_material(i, g)
	for c in n.get_children():
		_greenify(c)


static func green_version(m: Material) -> Material:
	if not m is StandardMaterial3D:
		return m
	var key := "green|%d" % m.get_instance_id()
	if _mats.has(key):
		return _mats[key]
	var out: Material = m
	var c: Color = (m as StandardMaterial3D).albedo_color
	if c.h > 0.38 and c.h < 0.6 and c.s > 0.2:
		var nm := (m as StandardMaterial3D).duplicate() as StandardMaterial3D
		nm.albedo_color = Color.from_hsv(0.25 + (c.h - 0.48) * 0.25, clampf(c.s * 1.25, 0.45, 0.7), c.v * 0.62)
		nm.roughness = 0.9
		out = nm
	_mats[key] = out
	return out


## Local AABB of a model at identity transform (cached).
static func aabb_of(path: String) -> AABB:
	var key := "aabb|" + path
	if _meshes.has(key):
		return _meshes[key]
	var inst := scene(path).instantiate()
	var acc: Array = [null]
	_merge_aabb(inst, Transform3D.IDENTITY, acc)
	inst.free()
	var box_: AABB = acc[0] if acc[0] != null else AABB()
	_meshes[key] = box_
	return box_


static func _merge_aabb(n: Node, xf: Transform3D, acc: Array) -> void:
	var t := xf
	if n is Node3D:
		t = xf * (n as Node3D).transform
	if n is MeshInstance3D:
		var a: AABB = t * (n as MeshInstance3D).get_aabb()
		acc[0] = a if acc[0] == null else (acc[0] as AABB).merge(a)
	for c in n.get_children():
		_merge_aabb(c, t, acc)


## Like spawn(), but `pos` is where the model's footprint center ends up.
static func place(parent: Node3D, path: String, pos: Vector3, scale := 1.0, rot_deg := 0.0) -> Node3D:
	var n := spawn(parent, path, pos, scale, rot_deg)
	if n == null:
		return null
	var c := aabb_of(path).get_center() * scale
	c.y = 0
	n.position = pos - c.rotated(Vector3.UP, deg_to_rad(rot_deg))
	return n


## First mesh inside a model (for MultiMesh scattering) and its local transform.
static func mesh_of(path: String) -> Array:
	if _meshes.has(path):
		return _meshes[path]
	var inst := scene(path).instantiate()
	var found: Array = [null, Transform3D.IDENTITY]
	var stack: Array = [[inst, Transform3D.IDENTITY]]
	while not stack.is_empty():
		var e: Array = stack.pop_back()
		var n: Node = e[0]
		var xf: Transform3D = e[1]
		if n is Node3D:
			xf = xf * (n as Node3D).transform
		if n is MeshInstance3D:
			found = [(n as MeshInstance3D).mesh, xf]
			break
		for c in n.get_children():
			stack.append([c, xf])
	inst.free()
	_meshes[path] = found
	return found


static func pbr(name_: String, uv_scale := 0.5, tint := Color.WHITE, rough := 1.0) -> StandardMaterial3D:
	var key := "%s|%s|%s" % [name_, uv_scale, tint]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_texture = load(TEX + name_ + "_diff.jpg")
	m.albedo_color = tint
	m.normal_enabled = true
	m.normal_texture = load(TEX + name_ + "_nor.jpg")
	m.normal_scale = 0.8
	m.roughness_texture = load(TEX + name_ + "_rough.jpg")
	m.roughness = rough
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	m.uv1_scale = Vector3.ONE * uv_scale
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	_mats[key] = m
	return m


static func color_mat(c: Color, rough := 0.8, metal := 0.0, emission := Color.BLACK) -> StandardMaterial3D:
	var key := "c|%s|%s|%s|%s" % [c, rough, metal, emission]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	if c.a < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if emission != Color.BLACK:
		m.emission_enabled = true
		m.emission = emission
		m.emission_energy_multiplier = 1.5
	_mats[key] = m
	return m


## Material that recolors the Kenney Building Kit wall swatch.
static func wall_mat(tint: Color, dirt := 0.0) -> ShaderMaterial:
	var key := "wall|%s|%.1f" % [tint, dirt]
	if _mats.has(key):
		return _mats[key]
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/kenney_tint.gdshader")
	m.set_shader_parameter("albedo_tex", load(ROOT + "building/Textures/colormap.png"))
	m.set_shader_parameter("tint", tint)
	m.set_shader_parameter("dirt", dirt)
	_mats[key] = m
	return m


static func override_all(n: Node, mat: Material) -> void:
	if n is MeshInstance3D:
		(n as MeshInstance3D).material_override = mat
	for c in n.get_children():
		override_all(c, mat)


static func shadows_off(n: Node) -> void:
	if n is GeometryInstance3D:
		(n as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for c in n.get_children():
		shadows_off(c)


static func box(parent: Node3D, size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)
	return mi


static func cylinder(parent: Node3D, r: float, h: float, pos: Vector3, mat: Material, top_r := -1.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = r if top_r < 0 else top_r
	cm.bottom_radius = r
	cm.height = h
	cm.radial_segments = 20
	mi.mesh = cm
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)
	return mi


static func plane(parent: Node3D, size: Vector2, pos: Vector3, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = size
	mi.mesh = pm
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)
	return mi


## Tile coordinates (grid) to world position of the tile's center.
static func tile_to_world(t: Vector2i) -> Vector3:
	return Vector3((t.x + 0.5) * TILE, 0, (t.y + 0.5) * TILE)


## Simulation pixel coordinates (Game.TILE px per tile) to world meters.
static func px_to_world(p: Vector2) -> Vector3:
	return Vector3(p.x / Game.TILE * TILE, 0, p.y / Game.TILE * TILE)


static func world_to_px(w: Vector3) -> Vector2:
	return Vector2(w.x / TILE * Game.TILE, w.z / TILE * Game.TILE)

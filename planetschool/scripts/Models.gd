class_name Models
extends RefCounted
## Loads and caches the CC0 Kenney models and Poly Haven materials used by the
## 3D world. All world units are meters; one campus tile is Models.TILE meters.

const TILE := 2.0
const LEVEL_H := 4.0  # floor-to-floor height in meters
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


static func pbr(name_: String, uv_scale := 0.5, tint := Color.WHITE, rough := 1.0, metal := 0.0) -> StandardMaterial3D:
	var key := "%s|%s|%s|%s" % [name_, uv_scale, tint, metal]
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
	m.metallic = metal
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
	mi.position = pos + Vector3(0, h * 0.5, 0)  # pos is the base center
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


static func glass_mat() -> StandardMaterial3D:
	if _mats.has("glass"):
		return _mats["glass"]
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.62, 0.76, 0.84, 0.3)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.metallic = 0.9
	m.roughness = 0.04
	m.specular = 0.9
	_mats["glass"] = m
	return m


static func prop(name_: String) -> String:
	return "res://assets/props/%s/%s.gltf" % [name_, name_]


## Instance a Poly Haven prop (glTF) with its footprint centered on pos.
static func place_prop(parent: Node3D, name_: String, pos: Vector3, scale := 1.0, rot_deg := 0.0) -> Node3D:
	var path := prop(name_)
	if not _scenes.has(path):
		_scenes[path] = load(path)
	var ps: PackedScene = _scenes[path]
	if ps == null:
		return null
	var n: Node3D = ps.instantiate()
	var key := "aabb|" + path
	if not _meshes.has(key):
		var acc: Array = [null]
		_merge_aabb(n, Transform3D.IDENTITY, acc)
		_meshes[key] = acc[0] if acc[0] != null else AABB()
	var c: Vector3 = (_meshes[key] as AABB).get_center() * scale
	c.y = 0
	n.scale = Vector3.ONE * scale
	n.rotation.y = deg_to_rad(rot_deg)
	n.position = pos - c.rotated(Vector3.UP, deg_to_rad(rot_deg))
	parent.add_child(n)
	return n


# ---------------------------------------------------------------------
#  Procedural mesh kit: boxes and cylinders merged into one ArrayMesh with
#  a surface per material. Used for walls, furniture and stadium pieces.
# ---------------------------------------------------------------------

class Kit:
	var tools := {}  # material -> SurfaceTool
	var mats := {}

	func _st(mat: Material) -> SurfaceTool:
		var key := mat.get_instance_id()
		if not tools.has(key):
			var st := SurfaceTool.new()
			st.begin(Mesh.PRIMITIVE_TRIANGLES)
			tools[key] = st
			mats[key] = mat
		return tools[key]

	func quad(mat: Material, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3) -> void:
		var st := _st(mat)
		for v in [a, b, c, a, c, d]:
			st.set_normal(n)
			st.set_uv(Vector2(v.x + v.y * 0.3, v.z + v.y * 0.7) * 0.5)
			st.add_vertex(v)

	## Axis-aligned box given center and size, optionally rotated about Y around `pivot`.
	func box(mat: Material, center: Vector3, size: Vector3, xf := Transform3D.IDENTITY) -> void:
		var h := size * 0.5
		var p := [Vector3(-h.x, -h.y, -h.z), Vector3(h.x, -h.y, -h.z), Vector3(h.x, h.y, -h.z), Vector3(-h.x, h.y, -h.z),
			Vector3(-h.x, -h.y, h.z), Vector3(h.x, -h.y, h.z), Vector3(h.x, h.y, h.z), Vector3(-h.x, h.y, h.z)]
		for i in 8:
			p[i] = xf * (center + p[i])
		var b := xf.basis
		quad(mat, p[4], p[5], p[6], p[7], b * Vector3.BACK)
		quad(mat, p[1], p[0], p[3], p[2], b * Vector3.FORWARD)
		quad(mat, p[0], p[4], p[7], p[3], b * Vector3.LEFT)
		quad(mat, p[5], p[1], p[2], p[6], b * Vector3.RIGHT)
		quad(mat, p[7], p[6], p[2], p[3], b * Vector3.UP)
		quad(mat, p[0], p[1], p[5], p[4], b * Vector3.DOWN)

	func cylinder(mat: Material, base: Vector3, r: float, h: float, segs := 12, xf := Transform3D.IDENTITY) -> void:
		var st := _st(mat)
		for i in segs:
			var a0 := TAU * i / segs
			var a1 := TAU * (i + 1) / segs
			var d0 := Vector3(cos(a0), 0, sin(a0))
			var d1 := Vector3(cos(a1), 0, sin(a1))
			var v := [base + d0 * r, base + d1 * r, base + d1 * r + Vector3.UP * h, base + d0 * r + Vector3.UP * h]
			for k in [0, 1, 2, 0, 2, 3]:
				st.set_normal(xf.basis * (d0 if k in [0, 3] else d1))
				st.set_uv(Vector2(float(i) / segs, v[k].y))
				st.add_vertex(xf * v[k])
			for cap in [[base + Vector3.UP * h, Vector3.UP], [base, Vector3.DOWN]]:
				var c: Vector3 = cap[0]
				var tri := [c, c + d1 * r, c + d0 * r] if cap[1] == Vector3.UP else [c, c + d0 * r, c + d1 * r]
				for q in tri:
					st.set_normal(xf.basis * cap[1])
					st.set_uv(Vector2(q.x, q.z))
					st.add_vertex(xf * q)

	func commit() -> ArrayMesh:
		var am := ArrayMesh.new()
		for key in tools:
			var st: SurfaceTool = tools[key]
			st.generate_tangents()
			st.commit(am)
			am.surface_set_material(am.get_surface_count() - 1, mats[key])
		return am

	func is_empty() -> bool:
		return tools.is_empty()


static var _kit_meshes := {}


## Cached procedural mesh built by `builder` (a Callable taking a Kit).
static func kit_mesh(key: String, builder: Callable) -> ArrayMesh:
	if not _kit_meshes.has(key):
		var k := Kit.new()
		builder.call(k)
		_kit_meshes[key] = k.commit()
	return _kit_meshes[key]


static func mesh_node(parent: Node3D, mesh: Mesh, pos: Vector3, rot_deg := 0.0, shadows := true) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = pos
	mi.rotation.y = deg_to_rad(rot_deg)
	if not shadows:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


## Many copies of one mesh as a single MultiMesh (transforms in parent space).
static func multi(parent: Node3D, mesh: Mesh, xfs: Array) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = xfs.size()
	for i in xfs.size():
		mm.set_instance_transform(i, xfs[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	parent.add_child(mmi)
	return mmi

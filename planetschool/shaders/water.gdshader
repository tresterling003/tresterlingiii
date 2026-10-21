shader_type spatial;
render_mode cull_disabled, depth_draw_always;

uniform vec3 deep : source_color = vec3(0.02, 0.35, 0.6);
uniform vec3 shallow : source_color = vec3(0.25, 0.75, 0.9);

void vertex() {
	VERTEX.y += sin(VERTEX.x * 1.7 + TIME * 1.3) * 0.03 + cos(VERTEX.z * 2.1 + TIME) * 0.03;
}

void fragment() {
	vec3 w = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float ripple = sin(w.x * 3.0 + TIME * 1.5) * cos(w.z * 2.5 - TIME * 1.1);
	ALBEDO = mix(deep, shallow, 0.5 + ripple * 0.15);
	NORMAL_MAP = normalize(vec3(0.5 + ripple * 0.08, 0.5 - ripple * 0.08, 1.0));
	ROUGHNESS = 0.05;
	METALLIC = 0.1;
	SPECULAR = 0.8;
	ALPHA = 0.82;
}

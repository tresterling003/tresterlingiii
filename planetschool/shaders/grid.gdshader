shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;

uniform float cell = 2.0;
uniform vec4 line_color : source_color = vec4(1.0, 1.0, 1.0, 0.25);

void fragment() {
	vec3 w = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec2 g = abs(fract(w.xz / cell - 0.5) - 0.5) / fwidth(w.xz / cell);
	float l = 1.0 - min(min(g.x, g.y), 1.0);
	ALBEDO = line_color.rgb;
	ALPHA = l * line_color.a;
}

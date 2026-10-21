shader_type spatial;
// Kenney Building Kit uses one colormap atlas. Its blue-grey "wall" swatches
// are recolored with `tint` so every building type gets its own facade color.

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_disable;
uniform vec3 tint : source_color = vec3(0.85, 0.78, 0.7);
uniform float dirt = 0.0;

void fragment() {
	vec3 c = texture(albedo_tex, UV).rgb;
	vec3 s = pow(c, vec3(1.0 / 2.2));
	// wall swatch: cool grey-blue, blue clearly above red
	bool wall = s.b - s.r > 0.05 && s.b >= s.g && s.g >= s.r - 0.01 && s.b < 0.97;
	if (wall) {
		float lum = dot(s, vec3(0.299, 0.587, 0.114));
		c = tint * clamp(pow(lum / 0.68, 2.2), 0.08, 1.25);
	}
	c *= 1.0 - dirt * 0.45;
	ALBEDO = c;
	ROUGHNESS = wall ? 0.92 : 0.55;
	SPECULAR = 0.3;
}

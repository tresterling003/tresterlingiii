# Living Space — visual system

**Style:** cozy retro pixel art. Art is authored as simple vector shapes, then rendered onto one shared pixel grid of 3 world units per pixel (`src/scene/pixel/raster.ts`) and scaled up with nearest-neighbour sampling. Every illustrated element follows the same rules, so new art slots in without clashing.

- **Pixel rules:** outlines are at least 3 world units (1 px), so they never break up. Prefer rects and straight edges for small details (eyes, bubbles, badges). Avoid strokes under 3 units and anything thinner than 1 px.
- **Motion:** 12 fps stepped frames for idle loops, with per-pose frame tables in `Resident.tsx`. UI transitions use `steps()`.
- **Text:** Pixelify Sans at 11 px on the canvas, alpha-thresholded so it has no anti-aliasing; VT323 on the computer screen.

- **One outline:** `#4A3428` (warm dark brown), 3 px at stage scale (2–2.5 px for small details). Round joins and caps.
- **Shading:** a flat base fill, one darker shade, one highlight. No gradients anywhere: the sky is 6 flat bands and glows are 3 stepped rings.
- **Shadows:** soft ellipses in `#2a1a10` at 12–25 % opacity under anything resting on the floor.
- **Palette** (`src/scene/palette.ts`, mirrored in `tailwind.config.ts`):
  - paper `#FBF5E8`
  - wood `#8B5A3C` / hi `#A9714A` / dark `#6A4129`
  - tomato `#D9694F`, honey `#E3B04B`, teal `#4F8C8C`
  - leaf `#6E9E52`, screen glow `#9FE3C9`
  - Room colours (wall, wainscot, floor, rug) are theme variables in `src/scene/theme.ts`.
- **Type:** Pixelify Sans (all UI) and VT323 (computer screen), both self-hosted.
- **UI frames:** square, with notched corners drawn by four one-axis box-shadows (`--frame` in `globals.css`), a hard 9 px drop shadow, a 3 px pixel unit for all borders, and a checkerboard-dither scrim behind panels.
- **Stage:** 1600×900 world units. The wall ends at y=600, and the walkable floor is y 650–860. Props are depth-sorted by their base line; the resident's z-index equals its feet y.
- **Light:** a multiply tint (time of day + weather) over the room, then screen-blended glows: lamp, fairy lights, door glass and monitor. Lighting keyframes are anchored to the real sunrise and sunset and eased with smoothstep.
- **Panels** borrow the look of their object: airmail letter (inbox), red-headed planner sheet (agenda), postcard with the live sky (weather), CRT monitor (computer), handset (phone), sticky note (tasks).

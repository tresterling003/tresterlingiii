# Living Space — visual system

**Style:** storybook vector. Every illustrated element follows the same rules, so new art slots in without clashing.

- **One outline:** `#4A3428` (warm dark brown), 3 px at stage scale (2–2.5 px for small details). Round joins and caps.
- **Shading:** a flat base fill, one darker shade, one highlight. No gradients on objects. Gradients are reserved for light: the sky, glows and the floor falloff.
- **Shadows:** soft ellipses in `#2a1a10` at 12–25 % opacity under anything resting on the floor.
- **Palette** (`src/scene/palette.ts`, mirrored in `tailwind.config.ts`):
  - paper `#FBF5E8`
  - wood `#8B5A3C` / hi `#A9714A` / dark `#6A4129`
  - tomato `#D9694F`, honey `#E3B04B`, teal `#4F8C8C`
  - leaf `#6E9E52`, screen glow `#9FE3C9`
  - Room colours (wall, wainscot, floor, rug) are theme variables in `src/scene/theme.ts`.
- **Type:** Fredoka (display, labels) and Nunito (body), both self-hosted.
- **Stage:** 1600×900 world units. The wall ends at y=600, and the walkable floor is y 650–860. Props are depth-sorted by their base line; the resident's z-index equals its feet y.
- **Light:** a multiply tint (time of day + weather) over the room, then screen-blended glows: lamp, fairy lights, door glass and monitor. Lighting keyframes are anchored to the real sunrise and sunset and eased with smoothstep.
- **Panels** borrow the look of their object: airmail letter (inbox), red-headed planner sheet (agenda), postcard with the live sky (weather), CRT monitor (computer), handset (phone), sticky note (tasks).

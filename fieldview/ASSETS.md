# FIELDVIEW assets and licensing

## What ships with FIELDVIEW

| Asset | Source | License |
|---|---|---|
| Football players: helmet shell and facemask, shoulder-pad jersey, numbers, pants, knee pads, socks, cleats, gloves | Generated procedurally in code (`src/render/playerModel.ts`) | Part of this project. No third-party assets |
| Skeleton and all animation (stances, idle, walk, jog, sprint, acceleration and deceleration, turning, snap, post-snap first steps) | Procedural skeletal animation in code (`src/anim/`) | Part of this project. No motion-capture data |
| Field (HS markings, hashes, numbers, goal posts, stands) | Generated in code (`src/render/field.ts`) | Part of this project |
| Grass texture, number textures, sky | Generated at runtime on a canvas | Part of this project |
| Lighting environment | `RoomEnvironment` from the three.js examples (procedural, with no image files) | MIT (three.js) |
| Libraries: three.js, React, zod | npm | MIT |

FIELDVIEW contains no downloaded models, textures, fonts or motion-capture files. It does not bundle Mixamo or other characters because their terms limit redistribution, and the license would not have been clear. Everything ships inside the build, so the app runs offline.

## Current visual limitations

The built-in athletes are made from shaped segments that each pose rigidly. They are not one continuously skinned mesh. Silhouettes, stances, helmets, pads, numbers and movement all read clearly as football players at projector distance. Up close they look stylized, not photoreal:

- The joints are rigid segments, with no skin deformation or cloth wrinkles.
- There are no team logos or helmet decals, and the face is simplified.
- Hands are mitts. There are no fingers.

The animation is procedural, driven by the simulation timeline. It is not motion capture, so it reads as athletic but not as a specific real athlete's mannerisms.

## Upgrade path: load licensed athletes (GLB/glTF)

In **Settings → Athlete model**, click **Load GLB…**. The file is stored in the browser (IndexedDB), so it also works offline, and it stays loaded until you choose **Use built-in**.

### Asset contract

- The file is binary glTF (`.glb`): a skinned humanoid that is Y-up, faces +Z, and is in a rest pose (T-pose or A-pose). Scale doesn't matter, because the app normalizes height automatically.
- The bone names must be recognizable humanoid names. These conventions are detected automatically:
  - Mixamo: `mixamorig:Hips`, `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `LeftArm`, `LeftForeArm`, `LeftHand`, `Spine2`, `Neck`, `Head`
  - Generic: `Hips`/`pelvis`, `thigh_l`, `calf_l`, `foot_l`, `upperarm_l`, `lowerarm_l`, `hand_l`, `spine_02`/`chest`, `neck`, `head`
  - Rigify, Blender style: `thigh.L`, `shin.L`, `upper_arm.L`, `forearm.L`, …
- Optional uniform tinting: give materials names that contain `jersey`/`shirt`, `pants`, `helmet`, `sock` or `cleat`/`shoe`. These are tinted with the team colors from Settings.
- Jersey numbers are not drawn on GLB athletes yet. Bake them into the texture, or use the built-in athletes when numbers matter.

### How retargeting works

`src/render/glbPlayer.ts` takes every limb bone and rotates it so that it points from its joint toward the next joint of the solved FIELDVIEW pose (hip→knee, knee→ankle, shoulder→elbow, and so on). The hips, spine, neck, head, feet and hands copy the solved orientations relative to their rest pose.

Because one pose solver drives both the built-in and the GLB athletes, replay, scrubbing and sync behave the same with either. If the model's leg proportions differ a lot from the built-in skeleton, its planted feet can slide slightly. The fix is to scale the model or adjust `DIM` in `src/anim/skeleton.ts`.

### Where to get suitable models

- **Commission or buy a football player rig** with redistribution rights for your program. This is best: real pads, helmet and uniform.
- **Quaternius** "Universal Base Characters" and similar (CC0) are good humanoid bases. Add gear in Blender.
- **Mixamo** characters can be used inside your own program under Adobe's terms. Check those terms before you share files outside your staff.

Keep a record of each model's license next to the file you load.

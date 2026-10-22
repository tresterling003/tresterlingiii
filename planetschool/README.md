# PlanetSchool

A 3D high school management sim built in **Godot 4.3** (GDScript). Planet Zoo, but the residents are teenagers:
design and build **any kind of school you want** - one big modern indoor building, an open-air campus of separate
buildings, or a mix - then hire staff, keep students happy and learning, and graduate them.

- **Build anything, piece by piece**: paint floors (polished concrete, terrazzo, hardwood, tile, sidewalks...),
  draw walls along the grid (tan/red/dark brick, painted drywall, modern facade panels, metal) as solid walls,
  windows, doorways, **glass curtain walls**, glass entrance doors or glass railings, then put roofs on top
  (gravel, white membrane, **solar**, green roof). Nothing is generated for you.
- **Multiple floors**: build up to three stories. Staircases and glass elevators connect floors and students
  really walk up them to get to class. Leave holes in upper floors for double-height gyms, lobbies and atriums.
- **People pathfind around your walls** and only pass through doorways, so layout matters.
- **2026 rooms**: smart boards, Chromebooks, STEM labs, Computer Science & AI lab, Robotics & Makerspace,
  Media Center with podcast booth, Student Commons, eSports Arena, Natatorium, Performing Arts Center,
  Athletic Weight Room, and a full **Football Stadium** with home stands, press box, video board and light towers.
- **Realistic look**: photo-scanned furniture and PBR materials from Poly Haven, an HDRI sky with a moving sun,
  shadows, screen-space reflections, ambient occlusion and indirect lighting, plus animated, diverse students.
  Zoom in and the roofs and upper floors cut away so you can watch classes in session.

All art is free CC0 content - see [`assets/CREDITS.md`](assets/CREDITS.md).

## Running it

There is a lighter browser build, but the full game (shadows, reflections, ambient occlusion, every prop and
up to 320 animated people on screen) runs in Godot on your computer.

### On Windows

1. Download **Godot 4.3** from <https://godotengine.org/download/archive/4.3-stable/> - pick
   **Windows, Standard** (not .NET). It's a zip with a single `.exe`; unzip it anywhere (e.g. your Desktop).
   No installer is needed.
2. Download the game: <https://github.com/tresterling003/tresterlingiii/archive/refs/heads/claude/planetschool-godot.zip>
   (or on GitHub switch to the `claude/planetschool-godot` branch and choose **Code > Download ZIP**).
   Unzip it.
3. Run the Godot `.exe`. In the Project Manager click **Import**, browse into the unzipped folder, open
   `planetschool`, select `project.godot`, then **Import & Edit**.
4. The first time, Godot imports all the textures and models - give it a few minutes until the progress bar
   at the bottom finishes.
5. Press **F5** (or the play button at the top right) to play. Next time, just open Godot and double-click
   PlanetSchool in the project list.

On other systems the steps are the same with that platform's Godot 4.3 download.

The game uses the Forward+ renderer (needs a Vulkan-capable GPU). On an older machine, start Godot with
`--rendering-driver opengl3` - it will run with simpler lighting.

### Example schools

| Scenario | What it is |
| --- | --- |
| **Eagle Ridge High (Texas)** | A finished modern 2-story mega school inspired by big Texas high schools: 110 m main corridor on both floors, glass entrance lobby with a grand staircase, gym, natatorium, arts center, commons atrium, ~30 classrooms and labs, stadium and parking. Built from the same pieces you use - edit or bulldoze anything. |
| **Fresh Start** | An empty lot. Build whatever school you like. |
| **Rescue Riverside High** | A run-down open-air campus of separate brick buildings to turn around. |
| **Sports Powerhouse** | Build a stadium and win games. |
| **Sandbox** | $5M and everything unlocked. |

## How to play

- **School To-Do** (right side, when nothing is selected): the next steps for a working school. Its buttons
  pick up the right room for you, lay hallways to rooms nobody can reach, and hire every missing teacher and
  staff member in one click.
- **Placing**: the item stays in your hand so you can place several; a tooltip by the cursor shows the price,
  and if a spot is red it says why. **R** rotates any room. **Right-click** or **Esc** puts it away and
  **Ctrl+Z** undoes your last build or bulldoze (with a refund). Click a room to **Move** it for free,
  **Lay hallway to it**, **Add walls**, hire its teacher or demolish it.
- **Build** (left panel): the **Construction** tab has floors, walls, roofs, stairs and elevators. Drag to paint
  floors and roofs; drag along grid lines to draw walls (drag diagonally to draw a box). Pick a wall material from
  the dropdown and a type (solid, window, doorway, glass curtain wall, glass doors, railing). Use **Up/Down**
  (or Page Up/Page Down) to switch floors. Place rooms from the other tabs; tick **Auto walls** if you want a
  quick standalone building. Every room needs a walkable route from the bus loop through doorways.
- **Hire staff** (Staff window): every classroom needs a teacher of the matching subject. Cafeterias need
  Lunch Staff, the Nurse's and Counselor's offices need their specialists, and the Football Field needs a Coach.
  Janitors clean litter, dirty restrooms and graffiti. Security guards stop fights.
- **Students** each have a grade (9-12), personality (Athlete, Nerd, Artist, Musician, Socialite, Rebel,
  Gamer), a six-period schedule, GPA, stress and five needs: hunger, bladder, energy, social and fun.
  Click any student to see their needs, schedule and thoughts.
- **The school day** runs from the 7:30 bus arrival through six 50-minute periods, lunch and passing periods,
  to after-school clubs and dismissal. Students who can't find a class, restroom or lunch get unhappy,
  miss school and eventually transfer out.
- **Curriculum** (research): develop AP Courses, Computer Science, Robotics, Drama, eSports, a Swim
  Program, Green Campus and more to unlock buildings and bonuses.
- **Policies**: tuition, lunch price, phone ban, homework load and uniforms.
- **Report Card**: your A+ to F rating is built from academics, welfare, attendance, safety, cleanliness and
  facilities. A better rating brings more state funding and more enrollment applications.
- **Events**: Friday night football, Homecoming, Prom, standardized tests, graduation, snow days, flu
  outbreaks, food fights, health inspections, School Board visits, teacher walkouts and more.

### Scenarios

| Scenario | Goal |
| --- | --- |
| Fresh Start | Grow an empty lot to 120 students with a B rating |
| Rescue Riverside High | Turn a dirty, failing school into an A school with a 3.0 average GPA |
| Sports Powerhouse | Win 8 home football games and bank $250,000 |
| Sandbox | $5M and every curriculum unlocked |

### Controls

| Input | Action |
| --- | --- |
| WASD / arrows, left-drag (select tool), middle-drag | Pan |
| Q / E, right-drag | Rotate and tilt camera |
| Mouse wheel | Zoom (roofs and upper floors hide automatically when close) |
| Page Up / Page Down, ] / [ | Go up / down a floor |
| R | Rotate the room or stairs you're placing or moving |
| Ctrl + Z | Undo the last build / bulldoze |
| V | Cycle view: auto cutaway / whole building / cutaway |
| Left click | Select / place / paint |
| Right click / Esc | Put the tool away |
| F | Point the camera at the selected room |
| Delete | Demolish the selected room |
| X | Bulldoze tool (drag a box; filter rooms, walls, floors or roofs) |
| Space | Pause |
| 1-4 | Speed 1x / 2x / 4x / 8x |

## Code layout

| File | Purpose |
| --- | --- |
| `scripts/Data.gd` | Autoload with all definitions: buildings, staff roles, curriculum, scenarios, names |
| `scripts/Game.gd` | Autoload simulation: multi-level grid, walls on tile edges, wall-aware 3D pathfinding, clock, student and staff AI, economy, ratings, events, save/load |
| `scripts/SchoolTemplates.gd` | The example schools, built with the normal construction API |
| `scripts/StructureView.gd` | Renders player-built floors, walls (windows, doors, glass) and roofs per level |
| `scripts/Person.gd`, `scripts/Building.gd` | Data classes for people and placed structures |
| `scripts/World3D.gd` | 3D world: camera rig, sky and sun, paths, litter, placement previews, picking |
| `scripts/BuildingFactory.gd` | Room floors and modern furnished interiors, stadium, stairs and elevators |
| `scripts/PeopleView.gd` | Animated characters with per-person looks: seating, walking, floors and stairs, sports laps, fights |
| `scripts/Scenery.gd` | Lawn, street, school bus, neighborhood houses, trees, fence and front gate |
| `scripts/Models.gd` | Model loading, scaling and material helpers |
| `shaders/` | Wall recolor, water and build-grid shaders |
| `scripts/UI.gd` | Main menu, HUD, build menu, info panel and management windows, all built in code |
| `tests/SimTest.tscn` | Headless smoke test: walls/doors/stairs pathing, Eagle Ridge for 6 days, save/load, Riverside |

Run the smoke test with `godot --headless --path planetschool res://tests/SimTest.tscn`.

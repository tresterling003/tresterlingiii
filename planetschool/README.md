# PlanetSchool

A high school management sim built in **Godot 4.3** (GDScript, no external assets). Planet Zoo, but the
residents are teenagers: build the campus, hire the staff, keep students happy and learning, and graduate them.

## Running it

1. Install [Godot 4.3+](https://godotengine.org/download) (standard build, not .NET).
2. Open Godot, choose **Import**, and select `planetschool/project.godot`.
3. Press **F5** (Run Project).

## How to play

- **Build** (left panel): paint **Hallways/Sidewalks** from the bus-loop gate, then place classrooms,
  facilities, sports & arts venues, admin buildings and decor. Everything must connect to the gate by path.
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
| Sandbox | $2M and every curriculum unlocked |

### Controls

| Input | Action |
| --- | --- |
| WASD / arrows, right-drag, middle-drag | Pan |
| Mouse wheel | Zoom |
| Left click | Select / place / paint |
| Shift + click | Place several of the same building |
| Right click / Esc | Cancel tool |
| X | Bulldoze tool (drag a box) |
| Space | Pause |
| 1-4 | Speed 1x / 2x / 4x / 8x |

## Code layout

| File | Purpose |
| --- | --- |
| `scripts/Data.gd` | Autoload with all definitions: buildings, staff roles, curriculum, scenarios, names |
| `scripts/Game.gd` | Autoload simulation: grid, pathfinding, clock, student and staff AI, economy, ratings, events, save/load |
| `scripts/Person.gd`, `scripts/Building.gd` | Data classes for people and placed structures |
| `scripts/World.gd` | Draws the campus and handles camera and map input |
| `scripts/UI.gd` | Main menu, HUD, build menu, info panel and management windows, all built in code |
| `tests/SimTest.tscn` | Headless smoke test: builds a school and simulates 12 days |

Run the smoke test with `godot --headless --path planetschool res://tests/SimTest.tscn`.

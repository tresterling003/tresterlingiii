extends Node
## Static game definitions: rooms and objects, construction pieces (floors,
## walls, roofs), staff roles, curriculum research, scenarios and name pools.
## Everything here is read-only at runtime.

const CATEGORIES := ["Classrooms", "Facilities", "Sports & Arts", "Admin", "Outdoor & Decor"]

const CORE_SUBJECTS := ["Math", "English", "Science", "History"]
const BASE_ELECTIVES := ["Art", "Music", "PE", "Spanish"]

const PERSONALITIES := ["Athlete", "Nerd", "Artist", "Musician", "Socialite", "Rebel", "Gamer"]

const LEVEL_NAMES := ["Ground floor", "2nd floor", "3rd floor"]

# ---------------------------------------------------------------------------
#  Construction pieces. Everything is player-built; nothing is automatic.
# ---------------------------------------------------------------------------

# Walkable floor surfaces. outdoor=true ones are only allowed on the ground.
const FLOORS := {
	1: {"name": "Concrete Sidewalk", "tex": "concrete_pavement", "uv": 0.5, "tint": Color(1, 1, 1), "cost": 10, "outdoor": true},
	2: {"name": "Polished Concrete", "tex": "smooth_concrete_floor", "uv": 0.25, "tint": Color(1.0, 1.08, 1.2), "cost": 30},
	3: {"name": "Terrazzo", "tex": "terrazzo_tiles", "uv": 0.35, "tint": Color(1.75, 1.68, 1.55), "cost": 35},
	4: {"name": "Classic Checker Tile", "tex": "floor_tiles_06", "uv": 0.5, "tint": Color(1, 1, 1), "cost": 20},
	5: {"name": "Hardwood", "tex": "wood_floor", "uv": 0.3, "tint": Color(1, 1, 1), "cost": 40},
	6: {"name": "White Oak", "tex": "white_oak_veneer", "uv": 0.3, "tint": Color(1, 1, 1), "cost": 40},
	7: {"name": "White Tile", "tex": "long_white_tiles", "uv": 0.5, "tint": Color(1, 1, 1), "cost": 25},
	8: {"name": "Asphalt", "tex": "clean_asphalt", "uv": 0.2, "tint": Color(1, 1, 1), "cost": 8, "outdoor": true},
	9: {"name": "Rubber Track", "tex": "rubberized_track", "uv": 0.4, "tint": Color(1, 1, 1), "cost": 20, "outdoor": true},
}
const GATE_FLOOR := 99

# Wall materials. "tex" is a Poly Haven texture; tintable ones use "color".
const WALL_MATERIALS := {
	1: {"name": "Painted Drywall - White", "tex": "painted_plaster_wall", "color": Color(0.95, 0.95, 0.93), "cost": 60},
	2: {"name": "Painted Drywall - School Blue", "tex": "painted_plaster_wall", "color": Color(0.25, 0.42, 0.72), "cost": 60},
	3: {"name": "Painted Drywall - Eagle Gold", "tex": "painted_plaster_wall", "color": Color(0.95, 0.72, 0.25), "cost": 60},
	4: {"name": "Painted Drywall - Sage", "tex": "painted_plaster_wall", "color": Color(0.62, 0.72, 0.6), "cost": 60},
	5: {"name": "Painted Drywall - Charcoal", "tex": "painted_plaster_wall", "color": Color(0.25, 0.26, 0.28), "cost": 60},
	6: {"name": "Tan Texas Brick", "tex": "brick_wall_003", "uv": 0.5, "color": Color(1.45, 1.32, 1.12), "cost": 120},
	7: {"name": "Red Brick", "tex": "exterior_wall_cladding_02", "uv": 0.5, "cost": 120},
	8: {"name": "Dark Brick", "tex": "brick_wall_10", "uv": 0.5, "cost": 130},
	9: {"name": "Modern Facade Panel", "tex": "rectangular_facade_tiles", "uv": 0.25, "cost": 150},
	10: {"name": "Metal Panel - Navy", "tex": "box_profile_metal_sheet", "color": Color(0.12, 0.18, 0.32), "metal": true, "uv": 0.5, "cost": 110},
	11: {"name": "Metal Panel - Silver", "tex": "box_profile_metal_sheet", "color": Color(0.7, 0.72, 0.75), "metal": true, "uv": 0.5, "cost": 110},
	12: {"name": "Chain-link Fence", "fence": true, "cost": 25},
}

# What the wall segment is: affects looks, cost multiplier and whether people pass.
const WALL_TYPES := {
	1: {"name": "Solid", "mult": 1.0, "passable": false},
	2: {"name": "Window", "mult": 1.4, "passable": false},
	3: {"name": "Doorway", "mult": 1.2, "passable": true},
	4: {"name": "Glass Curtain Wall", "mult": 1.8, "passable": false},
	5: {"name": "Glass Doors", "mult": 2.0, "passable": true},
	6: {"name": "Half Wall / Railing", "mult": 0.6, "passable": false},
}

const ROOFS := {
	1: {"name": "Flat Roof (gravel)", "tex": "gravel_floor_02", "tint": Color(0.85, 0.85, 0.85), "cost": 40},
	2: {"name": "White Membrane Roof", "color": Color(0.88, 0.89, 0.9), "cost": 45},
	3: {"name": "Solar Panel Roof", "color": Color(0.1, 0.14, 0.3), "solar": true, "cost": 150},
	4: {"name": "Green Roof", "tex": "leafy_grass", "tint": Color(0.62, 0.86, 0.42), "cost": 90},
}

# ---------------------------------------------------------------------------
#  Rooms and objects
# ---------------------------------------------------------------------------
# serves: which student need the room restores (or "class" / "study" etc.)
# staff: staff role required for the room to operate
# subject: subject taught (classrooms)
const BUILDINGS := {
	# ---------------- Classrooms ----------------
	"math_room": {"name": "Math Classroom", "cat": "Classrooms", "size": Vector2i(4, 3), "cost": 9000, "upkeep": 40,
		"color": Color(0.36, 0.55, 0.85), "cap": 24, "subject": "Math", "staff": "teacher",
		"desc": "Smart board, Chromebooks, flexible seating. Needs a Math teacher."},
	"english_room": {"name": "English Classroom", "cat": "Classrooms", "size": Vector2i(4, 3), "cost": 9000, "upkeep": 40,
		"color": Color(0.85, 0.45, 0.4), "cap": 24, "subject": "English", "staff": "teacher",
		"desc": "Literature and writing. Needs an English teacher."},
	"history_room": {"name": "History Classroom", "cat": "Classrooms", "size": Vector2i(4, 3), "cost": 9000, "upkeep": 40,
		"color": Color(0.72, 0.58, 0.36), "cap": 24, "subject": "History", "staff": "teacher",
		"desc": "World history, civics and government. Needs a History teacher."},
	"science_lab": {"name": "STEM Science Lab", "cat": "Classrooms", "size": Vector2i(5, 3), "cost": 16000, "upkeep": 70,
		"color": Color(0.35, 0.75, 0.55), "cap": 24, "subject": "Science", "staff": "teacher",
		"desc": "Lab benches, microscopes, fume hood. Needs a Science teacher."},
	"language_room": {"name": "World Languages", "cat": "Classrooms", "size": Vector2i(4, 3), "cost": 9000, "upkeep": 40,
		"color": Color(0.95, 0.7, 0.3), "cap": 24, "subject": "Spanish", "staff": "teacher",
		"desc": "Spanish elective. Needs a Spanish teacher."},
	"computer_lab": {"name": "Computer Science Lab", "cat": "Classrooms", "size": Vector2i(5, 3), "cost": 22000, "upkeep": 90,
		"color": Color(0.3, 0.35, 0.45), "cap": 24, "subject": "CompSci", "staff": "teacher", "unlock": "comp_sci",
		"desc": "Coding, AI literacy and cybersecurity. Needs a CompSci teacher."},
	"robotics_lab": {"name": "Robotics & Makerspace", "cat": "Classrooms", "size": Vector2i(5, 4), "cost": 34000, "upkeep": 120,
		"color": Color(0.55, 0.6, 0.65), "cap": 20, "subject": "Engineering", "staff": "teacher", "unlock": "robotics",
		"desc": "3D printers, laser cutters, competition robots. Big reputation boost."},
	# ---------------- Facilities ----------------
	"restroom": {"name": "Restroom", "cat": "Facilities", "size": Vector2i(3, 2), "cost": 5000, "upkeep": 15,
		"color": Color(0.7, 0.85, 0.95), "cap": 14, "serves": "bladder",
		"desc": "Students need these. Gets dirty; janitors clean it."},
	"cafeteria": {"name": "Cafeteria", "cat": "Facilities", "size": Vector2i(7, 5), "cost": 32000, "upkeep": 80,
		"color": Color(0.95, 0.85, 0.55), "cap": 90, "serves": "hunger", "staff": "lunch",
		"desc": "Serving lines and dining. Needs Lunch Staff. Earns the lunch price per meal."},
	"commons": {"name": "Student Commons", "cat": "Facilities", "size": Vector2i(6, 5), "cost": 26000, "upkeep": 50,
		"color": Color(0.85, 0.75, 0.6), "cap": 60, "serves": "social",
		"desc": "Big open hangout with lounge seating and charging bars. Social, fun and study."},
	"vending": {"name": "Smart Vending", "cat": "Facilities", "size": Vector2i(1, 1), "cost": 2500, "upkeep": 3,
		"color": Color(0.85, 0.2, 0.25), "cap": 1, "serves": "snack",
		"desc": "Cashless snacks for $2. Creates litter without recycling stations nearby."},
	"lockers": {"name": "Lockers", "cat": "Facilities", "size": Vector2i(3, 1), "cost": 2000, "upkeep": 2,
		"color": Color(0.25, 0.42, 0.78), "cap": 6, "serves": "locker",
		"desc": "Students hang out here between classes."},
	"library": {"name": "Media Center", "cat": "Facilities", "size": Vector2i(6, 4), "cost": 26000, "upkeep": 60,
		"color": Color(0.55, 0.38, 0.25), "cap": 40, "serves": "study",
		"desc": "Library + study pods + podcast booth. Study hall for students without a class."},
	"student_lounge": {"name": "Student Lounge", "cat": "Facilities", "size": Vector2i(5, 4), "cost": 12000, "upkeep": 30,
		"color": Color(0.85, 0.5, 0.75), "cap": 30, "serves": "social",
		"desc": "Hangout spot. Restores social and fun."},
	"nurse_office": {"name": "Health Center", "cat": "Facilities", "size": Vector2i(3, 3), "cost": 9000, "upkeep": 25,
		"color": Color(0.95, 0.95, 0.95), "cap": 4, "serves": "health", "staff": "nurse",
		"desc": "Treats sick students. Needs a Nurse."},
	"counselor_office": {"name": "Counseling Center", "cat": "Facilities", "size": Vector2i(3, 3), "cost": 9000, "upkeep": 25,
		"color": Color(0.6, 0.8, 0.7), "cap": 3, "serves": "counsel", "staff": "counselor",
		"desc": "Mental health and college counseling. Needs a Counselor."},
	# ---------------- Sports & Arts ----------------
	"gymnasium": {"name": "Gymnasium", "cat": "Sports & Arts", "size": Vector2i(8, 6), "cost": 45000, "upkeep": 110,
		"color": Color(0.85, 0.65, 0.4), "cap": 60, "subject": "PE", "staff": "teacher", "serves": "sport",
		"desc": "PE, basketball and volleyball, hosts Prom. Needs a PE teacher."},
	"weight_room": {"name": "Athletic Weight Room", "cat": "Sports & Arts", "size": Vector2i(5, 4), "cost": 30000, "upkeep": 60,
		"color": Color(0.35, 0.35, 0.4), "cap": 24, "serves": "sport",
		"desc": "Training center for athletes. Boosts football wins."},
	"art_studio": {"name": "Art Studio", "cat": "Sports & Arts", "size": Vector2i(4, 3), "cost": 11000, "upkeep": 45,
		"color": Color(0.9, 0.55, 0.3), "cap": 24, "subject": "Art", "staff": "teacher", "serves": "art",
		"desc": "Art elective and after-school art club. Needs an Art teacher."},
	"music_room": {"name": "Band Hall", "cat": "Sports & Arts", "size": Vector2i(5, 4), "cost": 14000, "upkeep": 50,
		"color": Color(0.6, 0.4, 0.8), "cap": 40, "subject": "Music", "staff": "teacher", "serves": "music",
		"desc": "Music elective and marching band. Needs a Music teacher."},
	"basketball_court": {"name": "Outdoor Court", "cat": "Sports & Arts", "size": Vector2i(5, 4), "cost": 8000, "upkeep": 10,
		"color": Color(0.8, 0.45, 0.3), "cap": 12, "serves": "sport", "outdoor": true,
		"desc": "Outdoor court for pickup games."},
	"football_field": {"name": "Football Stadium", "cat": "Sports & Arts", "size": Vector2i(14, 10), "cost": 120000, "upkeep": 200,
		"color": Color(0.25, 0.6, 0.25), "cap": 80, "serves": "sport", "staff": "coach", "outdoor": true,
		"desc": "Turf field, home stands, press box and video board. Friday night lights sell tickets. Needs a Coach."},
	"theater": {"name": "Performing Arts Center", "cat": "Sports & Arts", "size": Vector2i(7, 6), "cost": 60000, "upkeep": 100,
		"color": Color(0.55, 0.15, 0.2), "cap": 50, "subject": "Drama", "staff": "teacher", "serves": "art", "unlock": "drama",
		"desc": "Theater with stage lighting. Drama elective and the school musical."},
	"pool": {"name": "Natatorium", "cat": "Sports & Arts", "size": Vector2i(8, 6), "cost": 80000, "upkeep": 160,
		"color": Color(0.3, 0.7, 0.95), "cap": 30, "serves": "sport", "unlock": "aquatics",
		"desc": "Competition pool. Huge fun boost for athletes."},
	"esports_arena": {"name": "eSports Arena", "cat": "Sports & Arts", "size": Vector2i(5, 4), "cost": 28000, "upkeep": 70,
		"color": Color(0.35, 0.2, 0.55), "cap": 20, "serves": "game", "unlock": "esports",
		"desc": "Gaming PCs, RGB and a caster desk. Gamers love it."},
	# ---------------- Admin ----------------
	"principal_office": {"name": "Main Office", "cat": "Admin", "size": Vector2i(5, 3), "cost": 16000, "upkeep": 50,
		"color": Color(0.5, 0.5, 0.55), "cap": 4, "serves": "discipline",
		"desc": "Principal + front desk. Required for a good rating. Reduces misbehavior; generates curriculum points."},
	"staff_room": {"name": "Teachers' Lounge", "cat": "Admin", "size": Vector2i(4, 3), "cost": 10000, "upkeep": 25,
		"color": Color(0.65, 0.55, 0.45), "cap": 12, "serves": "staff",
		"desc": "Staff recharge morale here at lunch. Unhappy staff quit."},
	"stairs": {"name": "Staircase", "cat": "Admin", "size": Vector2i(2, 4), "cost": 15000, "upkeep": 5,
		"color": Color(0.7, 0.7, 0.72), "cap": 40, "span": 2,
		"desc": "Connects this floor to the one above. Press R to rotate."},
	"elevator": {"name": "Elevator", "cat": "Admin", "size": Vector2i(2, 2), "cost": 28000, "upkeep": 15,
		"color": Color(0.6, 0.65, 0.7), "cap": 8, "span": 2,
		"desc": "Glass elevator connecting this floor to the one above."},
	"security_camera": {"name": "Security Camera", "cat": "Admin", "size": Vector2i(1, 1), "cost": 1200, "upkeep": 4,
		"color": Color(0.2, 0.2, 0.2), "cap": 0, "unlock": "cameras", "radius": 7,
		"desc": "Reduces vandalism and fights nearby."},
	"solar_panels": {"name": "Solar Array", "cat": "Admin", "size": Vector2i(3, 2), "cost": 9000, "upkeep": -40, "unlock": "green",
		"color": Color(0.15, 0.25, 0.5), "cap": 0, "outdoor": true,
		"desc": "Generates power: earns $40/day instead of costing upkeep."},
	# ---------------- Outdoor & Decor ----------------
	"parking_lot": {"name": "Parking Lot", "cat": "Outdoor & Decor", "size": Vector2i(6, 4), "cost": 6000, "upkeep": 5,
		"color": Color(0.25, 0.25, 0.27), "cap": 0, "outdoor": true, "appeal": 0,
		"desc": "Student and staff parking. Staff morale +."},
	"tree": {"name": "Shade Tree", "cat": "Outdoor & Decor", "size": Vector2i(1, 1), "cost": 300, "upkeep": 0, "color": Color(0.15, 0.45, 0.15), "cap": 0,
		"appeal": 4, "outdoor": true, "desc": "Makes the campus nicer."},
	"flowers": {"name": "Landscaping Bed", "cat": "Outdoor & Decor", "size": Vector2i(1, 1), "cost": 200, "upkeep": 0, "color": Color(0.9, 0.4, 0.6), "cap": 0,
		"appeal": 3, "outdoor": true, "desc": "Native shrubs and flowers."},
	"planter": {"name": "Indoor Planter", "cat": "Outdoor & Decor", "size": Vector2i(1, 1), "cost": 250, "upkeep": 1, "color": Color(0.3, 0.6, 0.3), "cap": 0,
		"appeal": 3, "desc": "Biophilic design: plants indoors make everyone calmer."},
	"bench": {"name": "Bench", "cat": "Outdoor & Decor", "size": Vector2i(1, 1), "cost": 250, "upkeep": 0, "color": Color(0.55, 0.35, 0.2), "cap": 2,
		"appeal": 2, "serves": "rest", "desc": "A place to sit and chat."},
	"trash_can": {"name": "Recycling Station", "cat": "Outdoor & Decor", "size": Vector2i(1, 1), "cost": 150, "upkeep": 1, "color": Color(0.3, 0.4, 0.3), "cap": 0,
		"appeal": 0, "radius": 4, "desc": "Students nearby throw litter away properly."},
	"bulletin_board": {"name": "Digital Display", "cat": "Outdoor & Decor", "size": Vector2i(1, 1), "cost": 600, "upkeep": 2, "color": Color(0.1, 0.1, 0.12), "cap": 0,
		"appeal": 2, "radius": 5, "desc": "Announcements and club promos. Small learning boost nearby."},
	"trophy_case": {"name": "Trophy Case", "cat": "Outdoor & Decor", "size": Vector2i(2, 1), "cost": 1500, "upkeep": 0, "color": Color(0.8, 0.7, 0.3), "cap": 0,
		"appeal": 6, "desc": "Show off championships. School spirit!"},
	"lamp": {"name": "LED Light Pole", "cat": "Outdoor & Decor", "size": Vector2i(1, 1), "cost": 300, "upkeep": 1, "color": Color(0.95, 0.9, 0.5), "cap": 0,
		"appeal": 1, "outdoor": true, "desc": "Lights the walkways."},
	"fountain": {"name": "Fountain", "cat": "Outdoor & Decor", "size": Vector2i(2, 2), "cost": 2500, "upkeep": 5, "color": Color(0.5, 0.75, 0.95), "cap": 0,
		"appeal": 10, "desc": "A grand centerpiece."},
	"mascot_statue": {"name": "Mascot Statue", "cat": "Outdoor & Decor", "size": Vector2i(2, 2), "cost": 3000, "upkeep": 0, "color": Color(0.8, 0.7, 0.2), "cap": 0,
		"appeal": 12, "desc": "School spirit! Boosts happiness nearby."},
	"flagpole": {"name": "Flagpoles", "cat": "Outdoor & Decor", "size": Vector2i(1, 1), "cost": 800, "upkeep": 0, "color": Color(0.8, 0.8, 0.8), "cap": 0,
		"appeal": 3, "outdoor": true, "desc": "US and Texas flags."},
	"marquee": {"name": "LED Marquee Sign", "cat": "Outdoor & Decor", "size": Vector2i(3, 1), "cost": 5000, "upkeep": 4, "color": Color(0.2, 0.2, 0.25), "cap": 0,
		"appeal": 5, "outdoor": true, "desc": "Big school sign with a scrolling LED board."},
}

const STAFF_ROLES := {
	"teacher": {"name": "Teacher", "base_salary": 160, "color": Color(0.2, 0.3, 0.8)},
	"janitor": {"name": "Custodian", "base_salary": 95, "color": Color(0.4, 0.4, 0.4)},
	"security": {"name": "Campus Officer", "base_salary": 120, "color": Color(0.1, 0.1, 0.15)},
	"nurse": {"name": "Nurse", "base_salary": 140, "color": Color(0.95, 0.4, 0.45)},
	"counselor": {"name": "Counselor", "base_salary": 140, "color": Color(0.3, 0.7, 0.6)},
	"lunch": {"name": "Nutrition Staff", "base_salary": 85, "color": Color(0.95, 0.75, 0.3)},
	"coach": {"name": "Coach", "base_salary": 135, "color": Color(0.85, 0.3, 0.1)},
}

const RESEARCH := {
	"ap_courses": {"name": "AP & Dual Credit", "cost": 20, "desc": "+15% learning in all core classes.", "req": ""},
	"comp_sci": {"name": "Computer Science & AI", "cost": 25, "desc": "Unlocks the Computer Science Lab and CompSci elective.", "req": ""},
	"cameras": {"name": "Campus Safety Tech", "cost": 20, "desc": "Unlocks Security Cameras.", "req": ""},
	"drama": {"name": "Fine Arts Academy", "cost": 30, "desc": "Unlocks the Performing Arts Center and Drama elective.", "req": ""},
	"tutoring": {"name": "AI Tutoring", "cost": 30, "desc": "Media Centers teach 2x as well during study hall.", "req": "ap_courses"},
	"robotics": {"name": "Robotics & Engineering", "cost": 45, "desc": "Unlocks the Robotics & Makerspace and Engineering elective.", "req": "comp_sci"},
	"esports": {"name": "eSports League", "cost": 35, "desc": "Unlocks the eSports Arena.", "req": "comp_sci"},
	"green": {"name": "Net-Zero Campus", "cost": 35, "desc": "Unlocks Solar Arrays.", "req": ""},
	"aquatics": {"name": "Swim & Dive", "cost": 50, "desc": "Unlocks the Natatorium.", "req": ""},
	"mentoring": {"name": "Teacher Mentoring", "cost": 40, "desc": "Teachers gain skill over time.", "req": "ap_courses"},
	"healthy_lunch": {"name": "Farm-to-Table Lunch", "cost": 25, "desc": "Cafeteria meals restore energy too.", "req": ""},
	"sel": {"name": "Social-Emotional Learning", "cost": 45, "desc": "Student stress builds 30% slower.", "req": "healthy_lunch"},
}

const SCENARIOS := {
	"eagle_ridge": {"name": "Eagle Ridge High (Texas)", "money": 400000, "prebuilt": "mega",
		"desc": "A brand-new 2-story Texas mega high school with a stadium, natatorium and arts center - built from the same pieces you can use. Grow it to 600 students with an A rating.",
		"goals": [{"type": "students", "value": 600}, {"type": "rating", "value": 85}, {"type": "wins", "value": 6}]},
	"fresh_start": {"name": "Fresh Start", "money": 250000, "prebuilt": "",
		"desc": "An empty lot. Build any school you can imagine - one big indoor building, an open-air campus, or both. Reach 120 students with a B rating.",
		"goals": [{"type": "students", "value": 120}, {"type": "rating", "value": 70}]},
	"riverside": {"name": "Rescue Riverside High", "money": 80000, "prebuilt": "riverside",
		"desc": "An old open-air campus of separate buildings: dirty, unsafe, and failing. Raise the rating to an A and average GPA to 3.0.",
		"goals": [{"type": "rating", "value": 85}, {"type": "gpa", "value": 3.0}]},
	"powerhouse": {"name": "Sports Powerhouse", "money": 300000, "prebuilt": "",
		"desc": "The town wants a champion. Build a Football Stadium, win 8 home games and bank $300,000.",
		"goals": [{"type": "wins", "value": 8}, {"type": "money", "value": 300000}]},
	"sandbox": {"name": "Sandbox", "money": 5000000, "prebuilt": "",
		"desc": "Unlimited creativity. Huge budget, all curriculum unlocked.", "goals": []},
}

const FIRST_NAMES := ["Aiden", "Maya", "Jordan", "Sofia", "Liam", "Ava", "Noah", "Zoe", "Ethan", "Chloe", "Mason", "Isabella",
	"Lucas", "Mia", "Jayden", "Harper", "Elijah", "Aaliyah", "Logan", "Emily", "Carter", "Layla", "Owen", "Riley",
	"Diego", "Priya", "Kai", "Nia", "Mateo", "Hana", "Omar", "Grace", "Leo", "Jasmine", "Caleb", "Lily", "Andre",
	"Sky", "Marcus", "Ella", "Tyler", "Ruby", "Xavier", "Ivy", "Malik", "Nora", "Ryan", "Camila", "Devon", "Sage",
	"Hunter", "Quinn", "Brandon", "Avery", "Isaiah", "Mila", "Gabriel", "Luna", "Tre", "Kennedy"]
const LAST_NAMES := ["Johnson", "Garcia", "Smith", "Nguyen", "Williams", "Patel", "Brown", "Kim", "Martinez", "Davis",
	"Lopez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Lee", "Harris", "Clark", "Lewis",
	"Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Hill", "Green", "Adams", "Baker", "Rivera",
	"Campbell", "Mitchell", "Carter", "Roberts", "Okafor", "Chen", "Sterling"]

const TEAM_NAMES := ["Eagles", "Tigers", "Bulldogs", "Wildcats", "Panthers", "Spartans", "Falcons", "Hornets",
	"Mustangs", "Rams", "Cougars", "Knights"]


func random_name() -> String:
	return "%s %s" % [FIRST_NAMES.pick_random(), LAST_NAMES.pick_random()]


func building(id: String) -> Dictionary:
	return BUILDINGS.get(id, {})


func is_decor(id: String) -> bool:
	return BUILDINGS.has(id) and BUILDINGS[id]["cat"] == "Outdoor & Decor" and id != "parking_lot"


func subject_room(subject: String) -> String:
	for id in BUILDINGS:
		if BUILDINGS[id].get("subject", "") == subject:
			return id
	return ""


func wall_style(mat: int, kind: int) -> int:
	return mat * 8 + kind


func wall_mat(style: int) -> int:
	return style / 8


func wall_kind(style: int) -> int:
	return style % 8


func wall_passable(style: int) -> bool:
	if style == 0:
		return true
	return WALL_TYPES.get(wall_kind(style), {}).get("passable", false)


func wall_cost(style: int) -> int:
	var m: Dictionary = WALL_MATERIALS.get(wall_mat(style), {})
	var t: Dictionary = WALL_TYPES.get(wall_kind(style), {})
	return int(m.get("cost", 50) * t.get("mult", 1.0))

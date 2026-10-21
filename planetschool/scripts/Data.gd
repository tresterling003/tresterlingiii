extends Node
## Static game definitions: buildables, staff roles, curriculum research,
## scenarios and name pools. Everything here is read-only at runtime.

const CATEGORIES := ["Classrooms", "Facilities", "Sports & Arts", "Admin", "Decor"]

const CORE_SUBJECTS := ["Math", "English", "Science", "History"]
const BASE_ELECTIVES := ["Art", "Music", "PE", "Spanish"]

const PERSONALITIES := ["Athlete", "Nerd", "Artist", "Musician", "Socialite", "Rebel", "Gamer"]

# serves: which student need the building restores (or "class" / "study" etc.)
# staff: staff role required for the building to operate
# subject: subject taught (classrooms)
const BUILDINGS := {
	# ---------------- Classrooms ----------------
	"math_room": {"name": "Math Room", "cat": "Classrooms", "size": Vector2i(4, 3), "cost": 8000, "upkeep": 40,
		"color": Color(0.36, 0.55, 0.85), "cap": 24, "subject": "Math", "staff": "teacher",
		"desc": "Algebra, geometry and calculus. Needs a Math teacher."},
	"english_room": {"name": "English Room", "cat": "Classrooms", "size": Vector2i(4, 3), "cost": 8000, "upkeep": 40,
		"color": Color(0.85, 0.45, 0.4), "cap": 24, "subject": "English", "staff": "teacher",
		"desc": "Literature and essays. Needs an English teacher."},
	"history_room": {"name": "History Room", "cat": "Classrooms", "size": Vector2i(4, 3), "cost": 8000, "upkeep": 40,
		"color": Color(0.72, 0.58, 0.36), "cap": 24, "subject": "History", "staff": "teacher",
		"desc": "World history and civics. Needs a History teacher."},
	"science_lab": {"name": "Science Lab", "cat": "Classrooms", "size": Vector2i(5, 3), "cost": 14000, "upkeep": 70,
		"color": Color(0.35, 0.75, 0.55), "cap": 24, "subject": "Science", "staff": "teacher",
		"desc": "Biology, chemistry and physics. Needs a Science teacher."},
	"language_room": {"name": "Spanish Room", "cat": "Classrooms", "size": Vector2i(4, 3), "cost": 8000, "upkeep": 40,
		"color": Color(0.95, 0.7, 0.3), "cap": 24, "subject": "Spanish", "staff": "teacher",
		"desc": "Foreign language elective. Needs a Spanish teacher."},
	"computer_lab": {"name": "Computer Lab", "cat": "Classrooms", "size": Vector2i(5, 3), "cost": 20000, "upkeep": 90,
		"color": Color(0.3, 0.35, 0.45), "cap": 24, "subject": "CompSci", "staff": "teacher", "unlock": "comp_sci",
		"desc": "Coding elective. Needs a CompSci teacher."},
	"robotics_lab": {"name": "Robotics Lab", "cat": "Classrooms", "size": Vector2i(5, 4), "cost": 32000, "upkeep": 120,
		"color": Color(0.55, 0.6, 0.65), "cap": 20, "subject": "Engineering", "staff": "teacher", "unlock": "robotics",
		"desc": "Engineering elective. Big boost to reputation."},
	# ---------------- Facilities ----------------
	"restroom": {"name": "Restroom", "cat": "Facilities", "size": Vector2i(3, 2), "cost": 4000, "upkeep": 15,
		"color": Color(0.7, 0.85, 0.95), "cap": 8, "serves": "bladder",
		"desc": "Students need these. Gets dirty; janitors clean it."},
	"cafeteria": {"name": "Cafeteria", "cat": "Facilities", "size": Vector2i(7, 5), "cost": 30000, "upkeep": 80,
		"color": Color(0.95, 0.85, 0.55), "cap": 90, "serves": "hunger", "staff": "lunch",
		"desc": "Lunch! Needs Lunch Staff. Earns the lunch price per meal."},
	"vending": {"name": "Vending Machine", "cat": "Facilities", "size": Vector2i(1, 1), "cost": 1500, "upkeep": 3,
		"color": Color(0.85, 0.2, 0.25), "cap": 1, "serves": "snack",
		"desc": "Snacks for $2. Creates litter without trash cans nearby."},
	"lockers": {"name": "Lockers", "cat": "Facilities", "size": Vector2i(3, 1), "cost": 2000, "upkeep": 2,
		"color": Color(0.4, 0.5, 0.75), "cap": 6, "serves": "locker",
		"desc": "Students hang out here between classes."},
	"library": {"name": "Library", "cat": "Facilities", "size": Vector2i(6, 4), "cost": 22000, "upkeep": 60,
		"color": Color(0.55, 0.38, 0.25), "cap": 40, "serves": "study",
		"desc": "Study hall for students without a class. Generates curriculum points."},
	"student_lounge": {"name": "Student Lounge", "cat": "Facilities", "size": Vector2i(5, 4), "cost": 12000, "upkeep": 30,
		"color": Color(0.85, 0.5, 0.75), "cap": 30, "serves": "social",
		"desc": "Hangout spot. Restores social and fun."},
	"nurse_office": {"name": "Nurse's Office", "cat": "Facilities", "size": Vector2i(3, 3), "cost": 9000, "upkeep": 25,
		"color": Color(0.95, 0.95, 0.95), "cap": 4, "serves": "health", "staff": "nurse",
		"desc": "Treats sick students. Needs a Nurse."},
	"counselor_office": {"name": "Counselor's Office", "cat": "Facilities", "size": Vector2i(3, 3), "cost": 9000, "upkeep": 25,
		"color": Color(0.6, 0.8, 0.7), "cap": 3, "serves": "counsel", "staff": "counselor",
		"desc": "Helps stressed and unhappy students. Needs a Counselor."},
	# ---------------- Sports & Arts ----------------
	"gymnasium": {"name": "Gymnasium", "cat": "Sports & Arts", "size": Vector2i(8, 6), "cost": 40000, "upkeep": 110,
		"color": Color(0.85, 0.65, 0.4), "cap": 60, "subject": "PE", "staff": "teacher", "serves": "sport",
		"desc": "PE classes, after-school sports, and hosts Prom. Needs a PE teacher."},
	"art_studio": {"name": "Art Studio", "cat": "Sports & Arts", "size": Vector2i(4, 3), "cost": 10000, "upkeep": 45,
		"color": Color(0.9, 0.55, 0.3), "cap": 24, "subject": "Art", "staff": "teacher", "serves": "art",
		"desc": "Art elective and after-school art club. Needs an Art teacher."},
	"music_room": {"name": "Band Room", "cat": "Sports & Arts", "size": Vector2i(4, 4), "cost": 12000, "upkeep": 50,
		"color": Color(0.6, 0.4, 0.8), "cap": 30, "subject": "Music", "staff": "teacher", "serves": "music",
		"desc": "Music elective and marching band. Needs a Music teacher."},
	"basketball_court": {"name": "Basketball Court", "cat": "Sports & Arts", "size": Vector2i(5, 4), "cost": 8000, "upkeep": 10,
		"color": Color(0.8, 0.45, 0.3), "cap": 12, "serves": "sport",
		"desc": "Outdoor court for pickup games."},
	"football_field": {"name": "Football Field", "cat": "Sports & Arts", "size": Vector2i(12, 7), "cost": 60000, "upkeep": 120,
		"color": Color(0.25, 0.6, 0.25), "cap": 60, "serves": "sport", "staff": "coach",
		"desc": "Friday night lights! Hosts home games that sell tickets. Needs a Coach."},
	"theater": {"name": "Theater", "cat": "Sports & Arts", "size": Vector2i(7, 5), "cost": 45000, "upkeep": 100,
		"color": Color(0.55, 0.15, 0.2), "cap": 40, "subject": "Drama", "staff": "teacher", "serves": "art", "unlock": "drama",
		"desc": "Drama elective and the school play. Needs a Drama teacher."},
	"pool": {"name": "Aquatic Center", "cat": "Sports & Arts", "size": Vector2i(7, 5), "cost": 70000, "upkeep": 160,
		"color": Color(0.3, 0.7, 0.95), "cap": 30, "serves": "sport", "unlock": "aquatics",
		"desc": "Swim team practice. Huge fun boost for athletes."},
	"esports_arena": {"name": "eSports Arena", "cat": "Sports & Arts", "size": Vector2i(5, 4), "cost": 25000, "upkeep": 70,
		"color": Color(0.35, 0.2, 0.55), "cap": 20, "serves": "game", "unlock": "esports",
		"desc": "Competitive gaming club. Gamers love it."},
	# ---------------- Admin ----------------
	"principal_office": {"name": "Principal's Office", "cat": "Admin", "size": Vector2i(4, 3), "cost": 15000, "upkeep": 50,
		"color": Color(0.5, 0.5, 0.55), "cap": 4, "serves": "discipline",
		"desc": "Required for a good rating. Reduces misbehavior and generates curriculum points."},
	"staff_room": {"name": "Teachers' Lounge", "cat": "Admin", "size": Vector2i(4, 3), "cost": 10000, "upkeep": 25,
		"color": Color(0.65, 0.55, 0.45), "cap": 12, "serves": "staff",
		"desc": "Staff recharge morale here at lunch. Unhappy staff quit."},
	"security_camera": {"name": "Security Camera", "cat": "Admin", "size": Vector2i(1, 1), "cost": 1200, "upkeep": 4,
		"color": Color(0.2, 0.2, 0.2), "cap": 0, "unlock": "cameras", "radius": 7,
		"desc": "Reduces vandalism and fights nearby."},
	"solar_panels": {"name": "Solar Array", "cat": "Admin", "size": Vector2i(3, 2), "cost": 9000, "upkeep": -40, "unlock": "green",
		"color": Color(0.15, 0.25, 0.5), "cap": 0,
		"desc": "Generates power: earns $40/day instead of costing upkeep."},
	# ---------------- Decor ----------------
	"tree": {"name": "Oak Tree", "cat": "Decor", "size": Vector2i(1, 1), "cost": 200, "upkeep": 0, "color": Color(0.15, 0.45, 0.15), "cap": 0,
		"appeal": 4, "desc": "Makes the campus nicer."},
	"flowers": {"name": "Flower Bed", "cat": "Decor", "size": Vector2i(1, 1), "cost": 100, "upkeep": 0, "color": Color(0.9, 0.4, 0.6), "cap": 0,
		"appeal": 3, "desc": "Pretty flowers."},
	"bench": {"name": "Bench", "cat": "Decor", "size": Vector2i(1, 1), "cost": 250, "upkeep": 0, "color": Color(0.55, 0.35, 0.2), "cap": 2,
		"appeal": 2, "serves": "rest", "desc": "A place to sit and chat."},
	"trash_can": {"name": "Trash Can", "cat": "Decor", "size": Vector2i(1, 1), "cost": 150, "upkeep": 1, "color": Color(0.3, 0.4, 0.3), "cap": 0,
		"appeal": 0, "radius": 4, "desc": "Students nearby throw litter away properly."},
	"bulletin_board": {"name": "Bulletin Board", "cat": "Decor", "size": Vector2i(1, 1), "cost": 300, "upkeep": 0, "color": Color(0.8, 0.65, 0.4), "cap": 0,
		"appeal": 2, "radius": 5, "desc": "Club posters and announcements. Small learning boost nearby."},
	"lamp": {"name": "Lamp Post", "cat": "Decor", "size": Vector2i(1, 1), "cost": 150, "upkeep": 1, "color": Color(0.95, 0.9, 0.5), "cap": 0,
		"appeal": 1, "desc": "Lights the walkways."},
	"fountain": {"name": "Fountain", "cat": "Decor", "size": Vector2i(2, 2), "cost": 2500, "upkeep": 5, "color": Color(0.5, 0.75, 0.95), "cap": 0,
		"appeal": 10, "desc": "A grand centerpiece."},
	"mascot_statue": {"name": "Mascot Statue", "cat": "Decor", "size": Vector2i(2, 2), "cost": 3000, "upkeep": 0, "color": Color(0.8, 0.7, 0.2), "cap": 0,
		"appeal": 12, "desc": "School spirit! Boosts happiness nearby."},
}

const PATHS := {
	"sidewalk": {"name": "Sidewalk", "cost": 10, "color": Color(0.78, 0.76, 0.7)},
	"hallway": {"name": "Hallway", "cost": 25, "color": Color(0.62, 0.6, 0.66)},
}

const STAFF_ROLES := {
	"teacher": {"name": "Teacher", "base_salary": 140, "color": Color(0.2, 0.3, 0.8)},
	"janitor": {"name": "Janitor", "base_salary": 90, "color": Color(0.4, 0.4, 0.4)},
	"security": {"name": "Security Guard", "base_salary": 110, "color": Color(0.1, 0.1, 0.15)},
	"nurse": {"name": "Nurse", "base_salary": 130, "color": Color(0.95, 0.4, 0.45)},
	"counselor": {"name": "Counselor", "base_salary": 130, "color": Color(0.3, 0.7, 0.6)},
	"lunch": {"name": "Lunch Staff", "base_salary": 80, "color": Color(0.95, 0.75, 0.3)},
	"coach": {"name": "Coach", "base_salary": 120, "color": Color(0.85, 0.3, 0.1)},
}

const RESEARCH := {
	"ap_courses": {"name": "AP Courses", "cost": 20, "desc": "+15% learning in all core classes.", "req": ""},
	"comp_sci": {"name": "Computer Science", "cost": 25, "desc": "Unlocks the Computer Lab and CompSci elective.", "req": ""},
	"cameras": {"name": "Campus Security", "cost": 20, "desc": "Unlocks Security Cameras.", "req": ""},
	"drama": {"name": "Drama Program", "cost": 30, "desc": "Unlocks the Theater and Drama elective.", "req": ""},
	"tutoring": {"name": "Peer Tutoring", "cost": 30, "desc": "Libraries teach 2x as well during study hall.", "req": "ap_courses"},
	"robotics": {"name": "Robotics & Engineering", "cost": 45, "desc": "Unlocks the Robotics Lab and Engineering elective.", "req": "comp_sci"},
	"esports": {"name": "eSports League", "cost": 35, "desc": "Unlocks the eSports Arena.", "req": "comp_sci"},
	"green": {"name": "Green Campus", "cost": 35, "desc": "Unlocks Solar Arrays.", "req": ""},
	"aquatics": {"name": "Swim Program", "cost": 50, "desc": "Unlocks the Aquatic Center.", "req": ""},
	"mentoring": {"name": "Teacher Mentoring", "cost": 40, "desc": "Teachers gain skill over time.", "req": "ap_courses"},
	"healthy_lunch": {"name": "Healthy Lunch Program", "cost": 25, "desc": "Cafeteria meals restore energy too.", "req": ""},
	"sel": {"name": "Social-Emotional Learning", "cost": 45, "desc": "Student stress builds 30% slower.", "req": "healthy_lunch"},
}

const SCENARIOS := {
	"fresh_start": {"name": "Fresh Start", "money": 150000, "prebuilt": false,
		"desc": "An empty lot and a district budget. Open a high school and grow it to 120 students with at least a B rating.",
		"goals": [{"type": "students", "value": 120}, {"type": "rating", "value": 70}]},
	"riverside": {"name": "Rescue Riverside High", "money": 60000, "prebuilt": true,
		"desc": "Riverside High is falling apart: dirty, unsafe, and failing. Raise the rating to an A and average GPA to 3.0.",
		"goals": [{"type": "rating", "value": 85}, {"type": "gpa", "value": 3.0}]},
	"powerhouse": {"name": "Sports Powerhouse", "money": 200000, "prebuilt": false,
		"desc": "The town wants a champion. Build a Football Field, win 8 home games and bank $250,000.",
		"goals": [{"type": "wins", "value": 8}, {"type": "money", "value": 250000}]},
	"sandbox": {"name": "Sandbox", "money": 2000000, "prebuilt": false,
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
	return BUILDINGS.has(id) and BUILDINGS[id]["cat"] == "Decor"


func subject_room(subject: String) -> String:
	for id in BUILDINGS:
		if BUILDINGS[id].get("subject", "") == subject:
			return id
	return ""

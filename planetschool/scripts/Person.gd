class_name Person
extends RefCounted
## A student or staff member. Students have needs, grades and a schedule;
## staff have a role, skill, salary and morale.

var uid: int
var role := "student"  # "student" or a key of Data.STAFF_ROLES
var name := ""
var present := false  # on campus right now
var pos := Vector2.ZERO  # pixel position on the level plane
var level := 0  # which floor the person is on
var path: Array = []  # remaining Vector3i cells (x, y, level) to walk
var dest_uid := -1  # building we're heading to / inside
var activity := ""  # what we will do / are doing at dest
var busy := 0  # minutes left on the current activity
var state_text := "At home"
var thoughts: Array = []  # most recent first: {"text", "good"}
var color := Color.WHITE
var jitter := Vector2.ZERO  # draw offset so crowds don't stack
var arrive_minute := 0

# ---- student ----
var grade := 9
var gpa := 2.5
var learning_today := 0.0
var classes_today := 0
var classes_missed := 0
var personality := "Nerd"
var schedule: Array = []  # 6 subject names, one per period
var needs := {"hunger": 80.0, "bladder": 90.0, "energy": 90.0, "social": 70.0, "fun": 70.0}
var stress := 20.0
var happiness := 70.0
var sick := false
var unhappy_days := 0
var after_school_left := 0  # activities remaining after school
var attended_period := -1
var ate_lunch := false
var class_uid := -1  # room assigned for class_period
var class_period := -1
var missed_logged := -1

# ---- staff ----
var skill := 3  # 1..5
var salary := 100
var subject := ""  # teachers only
var morale := 80.0
var assigned_uid := -1  # building the staff member works at
var days_employed := 0
var had_break := false


func is_student() -> bool:
	return role == "student"


func tile() -> Vector2i:
	return Vector2i(floori(pos.x / Game.TILE), floori(pos.y / Game.TILE))


func cell() -> Vector3i:
	var t := tile()
	return Vector3i(t.x, t.y, level)


func is_walking() -> bool:
	return not path.is_empty()


func role_name() -> String:
	if is_student():
		return "Grade %d Student" % grade
	var n: String = Data.STAFF_ROLES[role]["name"]
	if role == "teacher":
		return "%s Teacher" % subject
	return n


func think(text: String, good := false) -> void:
	if not thoughts.is_empty() and thoughts[0]["text"] == text:
		return
	thoughts.push_front({"text": text, "good": good})
	if thoughts.size() > 6:
		thoughts.pop_back()


func lowest_need() -> String:
	var low := ""
	var v := 999.0
	for k in needs:
		if needs[k] < v:
			v = needs[k]
			low = k
	return low


func recalc_happiness() -> void:
	var s := 0.0
	for k in needs:
		s += needs[k]
	var avg := s / needs.size()
	var target := avg * 0.75 + (100.0 - stress) * 0.25
	if sick:
		target -= 20
	happiness = lerpf(happiness, clampf(target, 0, 100), 0.05)


func to_dict() -> Dictionary:
	var d := {"uid": uid, "role": role, "name": name}
	if is_student():
		d.merge({"grade": grade, "gpa": gpa, "pers": personality, "sched": schedule, "stress": stress,
			"happy": happiness, "ud": unhappy_days})
	else:
		d.merge({"skill": skill, "salary": salary, "subject": subject, "morale": morale,
			"assigned": assigned_uid, "days": days_employed})
	return d


static func from_dict(d: Dictionary) -> Person:
	var p := Person.new()
	p.uid = int(d["uid"])
	p.role = d["role"]
	p.name = d["name"]
	if p.is_student():
		p.grade = int(d["grade"])
		p.gpa = float(d["gpa"])
		p.personality = d["pers"]
		p.schedule = Array(d["sched"])
		p.stress = float(d["stress"])
		p.happiness = float(d["happy"])
		p.unhappy_days = int(d.get("ud", 0))
		p.color = Game.grade_color(p.grade)
	else:
		p.skill = int(d["skill"])
		p.salary = int(d["salary"])
		p.subject = d["subject"]
		p.morale = float(d["morale"])
		p.assigned_uid = int(d["assigned"])
		p.days_employed = int(d.get("days", 0))
		p.color = Data.STAFF_ROLES[p.role]["color"]
	return p

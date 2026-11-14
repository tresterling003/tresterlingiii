import "server-only";
import { withUser, type Tx } from "./db";
import { addDays } from "./dates";
import type { DayScore } from "./types";
import type { Exercise, ExerciseLog, HabitSettings, ProgramResponse, ProgressResponse, Session, Template, TodayResponse } from "./solo-types";
export type * from "./solo-types";

async function templates(tx: Tx): Promise<Template[]> {
  const ts = await tx.query<Omit<Template, "exercises">>(
    "select id, name, kind, est_minutes, position from workout_templates order by position, created_at",
  );
  const ex = await tx.query<Exercise & { template_id: string }>(
    "select id, template_id, position, name, sets, reps, weight, minutes, notes from template_exercises order by position",
  );
  return ts.map((t) => ({ ...t, exercises: ex.filter((e) => e.template_id === t.id).map(({ template_id: _, ...e }) => e) }));
}

async function schedule(tx: Tx): Promise<(string | null)[]> {
  const rows = await tx.query<{ weekday: number; template_id: string | null }>("select weekday, template_id from program_days");
  return [1, 2, 3, 4, 5, 6, 7].map((d) => rows.find((r) => r.weekday === d)?.template_id ?? null);
}

export async function getProgram(uid: string): Promise<ProgramResponse> {
  return withUser(uid, async (tx) => ({ templates: await templates(tx), schedule: await schedule(tx) }));
}

export async function getToday(uid: string): Promise<TodayResponse> {
  return withUser(uid, async (tx) => {
    const { today } = (await tx.one<{ today: string }>("select rival_user_today($1)::text as today", [uid]))!;
    const weekday = ((new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
    const weekStart = addDays(today, -(weekday - 1));
    const all = await templates(tx);
    const sched = await schedule(tx);
    const scheduled = all.find((t) => t.id === sched[weekday - 1]) ?? null;
    const sess = await tx.query<Omit<Session, "logs">>(
      `select id, template_id, template_name, session_date, scheduled, duration_min, completed_at
       from workout_sessions where session_date between $1 and $2 order by created_at`,
      [addDays(today, -1), today],
    );
    const logs = await tx.query<ExerciseLog & { session_id: string }>(
      "select session_id, exercise_id, exercise_name as name, done, sets_done, reps, weight from exercise_logs where session_id = any($1::uuid[]) order by position",
      [sess.map((s) => s.id)],
    );
    const last = await tx.query<{ name: string; weight: number | null; reps: string | null; date: string }>(
      `select distinct on (lower(l.exercise_name)) l.exercise_name as name, l.weight, l.reps, s.session_date as date
       from exercise_logs l join workout_sessions s on s.id = l.session_id
       where l.done and s.session_date < $1
       order by lower(l.exercise_name), s.session_date desc`,
      [today],
    );
    const hs = (await tx.one<HabitSettings>("select water_enabled, water_target, protein_enabled, protein_target from habit_settings")) ??
      { water_enabled: true, water_target: 8, protein_enabled: true, protein_target: 150 };
    const hl = (await tx.one<{ water: number; protein: number }>("select water, protein from habit_logs where day = $1", [today])) ??
      { water: 0, protein: 0 };
    // Last week + this week, for "beat last week", plus 4 more weeks for streaks.
    const days = await tx.query<DayScore>("select * from my_day_scores($1, $2, null)", [addDays(weekStart, -35), today]);
    return {
      today, weekday, weekStart, scheduled,
      templates: all.map(({ id, name, kind }) => ({ id, name, kind })),
      sessions: sess.map((s) => ({ ...s, logs: logs.filter((l) => l.session_id === s.id).map(({ session_id: _, ...l }) => l) })),
      lastUsed: Object.fromEntries(last.map((l) => [l.name.toLowerCase(), { weight: l.weight, reps: l.reps, date: l.date }])),
      habits: { settings: hs, today: hl },
      days,
      hasProgram: all.length > 0,
    };
  });
}

export async function getProgress(uid: string): Promise<ProgressResponse> {
  return withUser(uid, async (tx) => {
    const weeks = await tx.query<ProgressResponse["weeks"][number]>("select week_start::text, points, active_days, bonus from my_weeks(52)");
    const prs = await tx.query<ProgressResponse["prs"][number]>(
      `select distinct on (lower(l.exercise_name)) l.exercise_name as name, l.weight, l.reps, s.session_date::text as date
       from exercise_logs l join workout_sessions s on s.id = l.session_id
       where l.done and l.weight is not null and l.weight > 0 and s.completed_at is not null
       order by lower(l.exercise_name), l.weight desc, s.session_date asc`,
    );
    const sessions = await tx.query<ProgressResponse["sessions"][number]>(
      `select s.id, s.template_name, s.session_date::text, s.duration_min,
              (select count(*)::int from exercise_logs l where l.session_id = s.id and l.done) as done,
              (select count(*)::int from exercise_logs l where l.session_id = s.id) as total
       from workout_sessions s where s.completed_at is not null order by s.session_date desc, s.completed_at desc limit 20`,
    );
    return { weeks, lifetime: Math.round(weeks.reduce((a, w) => a + w.points, 0) * 10) / 10, prs: prs.sort((a, b) => a.name.localeCompare(b.name)), sessions };
  });
}

/** Personal records set in a session versus everything before it. */
export async function newPrs(tx: Tx, sessionId: string) {
  return tx.query<{ name: string; weight: number; previous: number | null }>(
    `select l.exercise_name as name, l.weight,
            (select max(p.weight) from exercise_logs p join workout_sessions ps on ps.id = p.session_id
             where p.user_id = l.user_id and lower(p.exercise_name) = lower(l.exercise_name) and p.done
               and ps.completed_at is not null and ps.id <> l.session_id) as previous
     from exercise_logs l where l.session_id = $1 and l.done and l.weight > 0`,
    [sessionId],
  ).then((rows) => rows.filter((r) => r.previous === null ? false : r.weight > r.previous));
}

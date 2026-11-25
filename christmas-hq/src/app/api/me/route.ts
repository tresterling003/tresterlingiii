import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { db, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { About } from "@/lib/schemas";
import { AVATARS, COLORS, DAILY_COIN_CAP, EFFECTS, THEMES } from "@/lib/catalog";
import { AppError } from "@/lib/errors";

export const GET = route(async () => {
  const uid = await requireUser();
  const user = await db.one(
    "select id, email, name, avatar, color, theme, effect, coins, about, budget_cents from users where id = $1",
    [uid],
  );
  if (!user) throw new AppError("unauthenticated", "Please sign in again.", 401);
  const fams = await db.query(
    `select f.id, f.name, f.code,
            coalesce(json_agg(json_build_object('id', u.id, 'name', u.name, 'avatar', u.avatar, 'color', u.color,
              'wishes', (select count(*) from wishes w where w.user_id = u.id)) order by u.name), '[]') as members
       from members me join families f on f.id = me.family_id
       join members m on m.family_id = f.id join users u on u.id = m.user_id
      where me.user_id = $1 group by f.id order by f.created_at`,
    [uid],
  );
  const today = await db.one<{ n: number }>(
    "select coalesce(sum(coins),0)::int as n from plays where user_id = $1 and created_at > date_trunc('day', now())",
    [uid],
  );
  return json({ user, families: fams, coinsToday: today?.n ?? 0, dailyCap: DAILY_COIN_CAP });
});

const Patch = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  avatar: z.enum(AVATARS.map((a) => a.key) as [string, ...string[]]).optional(),
  color: z.enum(Object.keys(COLORS) as [string, ...string[]]).optional(),
  theme: z.enum(THEMES.map((t) => t.key) as [string, ...string[]]).optional(),
  effect: z.enum(EFFECTS.map((e) => e.key) as [string, ...string[]]).optional(),
  about: About.optional(),
  budget_cents: z.number().int().min(0).max(100_000_000).optional(),
});

export const PATCH = route(async (req) => {
  const uid = await requireUser();
  const b = await body(req, Patch);
  await tx(async (db) => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const k of ["name", "avatar", "color", "theme", "effect", "budget_cents"] as const) {
      if (b[k] !== undefined) {
        vals.push(b[k]);
        sets.push(`${k} = $${vals.length}`);
      }
    }
    if (b.about) {
      vals.push(JSON.stringify(b.about));
      sets.push(`about = $${vals.length}::jsonb`);
    }
    if (!sets.length) return;
    vals.push(uid);
    await db.query(`update users set ${sets.join(", ")} where id = $${vals.length}`, vals);
  });
  return json({ ok: true });
});

export const dynamic = "force-dynamic";

import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { DAILY_COIN_CAP, GAMES, type GameKey } from "@/lib/catalog";
import { AppError } from "@/lib/errors";

const Schema = z.object({
  game: z.enum(Object.keys(GAMES) as [GameKey, ...GameKey[]]),
  score: z.number().int().min(0),
  ms: z.number().int().min(0),
});

/** Records a finished game and awards coins, within per-game and daily caps. */
export const POST = route(async (req) => {
  const uid = await requireUser();
  const b = await body(req, Schema);
  const g = GAMES[b.game];
  if (b.score > g.maxScore || b.ms < g.minMs || b.ms > g.maxMs) throw new AppError("invalid", "That score couldn't be counted.");
  return json(
    await tx(async (db) => {
      await db.query("select id from users where id = $1 for update", [uid]);
      const recent = await db.one<{ n: number }>(
        "select count(*)::int as n from plays where user_id = $1 and created_at > now() - interval '4 seconds'",
        [uid],
      );
      if ((recent?.n ?? 0) > 0) throw new AppError("rate_limited", "Slow down a little!", 429);
      const today = await db.one<{ n: number }>(
        "select coalesce(sum(coins),0)::int as n from plays where user_id = $1 and created_at > date_trunc('day', now())",
        [uid],
      );
      const left = Math.max(0, DAILY_COIN_CAP - (today?.n ?? 0));
      const coins = Math.max(0, Math.min(g.coins(b.score), g.cap, left));
      await db.query("insert into plays (user_id, game, score, coins) values ($1,$2,$3,$4)", [uid, b.game, b.score, coins]);
      const u = await db.one<{ coins: number }>("update users set coins = coins + $2 where id = $1 returning coins", [uid, coins]);
      const best = await db.one<{ best: number }>("select max(score)::int as best from plays where user_id = $1 and game = $2", [uid, b.game]);
      return { coins, total: u!.coins, best: best?.best ?? b.score, capped: left === 0 || coins < g.coins(b.score), todayLeft: left - coins };
    }),
  );
});

export const dynamic = "force-dynamic";

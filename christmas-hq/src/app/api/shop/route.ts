import { z } from "zod";
import { body, json, route } from "@/lib/api";
import { tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { shopItem } from "@/lib/catalog";
import { AppError, notFound } from "@/lib/errors";

/** Buy an item with coins and equip it. */
export const POST = route(async (req) => {
  const uid = await requireUser();
  const b = await body(req, z.object({ item: z.string().max(60) }));
  const it = shopItem(b.item);
  if (!it) throw notFound("That item");
  return json(
    await tx(async (db) => {
      const have = await db.one("select 1 from owned where user_id = $1 and item = $2", [uid, it.key]);
      if (have || it.price === 0) throw new AppError("owned", "You already have that.", 409);
      const u = await db.one<{ coins: number }>(
        "update users set coins = coins - $2 where id = $1 and coins >= $2 returning coins",
        [uid, it.price],
      );
      if (!u) throw new AppError("poor", "Not enough coins yet. Play a game to earn more!", 402);
      await db.query("insert into owned (user_id, item) values ($1, $2)", [uid, it.key]);
      await db.query(`update users set ${it.kind} = $2 where id = $1`, [uid, it.value]);
      return { coins: u.coins };
    }),
  );
});

export const dynamic = "force-dynamic";

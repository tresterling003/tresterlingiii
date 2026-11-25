import "server-only";
import { Pool, type PoolClient } from "pg";
import { AppError } from "./errors";

const g = globalThis as unknown as { hqPool?: Pool };

function pool(): Pool {
  if (!g.hqPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Missing required environment variable DATABASE_URL");
    g.hqPool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  }
  return g.hqPool;
}

export type Db = {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T | undefined>;
};

function mapErr(e: unknown): unknown {
  const err = e as { code?: string };
  if (err?.code === "23514" || err?.code === "22P02" || err?.code === "22001" || err?.code === "22003")
    return new AppError("invalid", "Some of those values aren't valid.");
  if (err?.code === "23505") return new AppError("conflict", "That already exists.", 409);
  return e;
}

/** Runs work in a single transaction. */
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client: PoolClient = await pool().connect();
  try {
    await client.query("begin");
    // Works through Neon's transaction pooler: the setting lasts only for this transaction.
    await client.query("set local search_path to hq, public");
    const db: Db = {
      query: async (sql, params) => (await client.query(sql, params)).rows,
      one: async (sql, params) => (await client.query(sql, params)).rows[0],
    };
    const out = await fn(db);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw mapErr(e);
  } finally {
    client.release();
  }
}

/** Single statement in its own short transaction (so the hq search_path applies). */
export const db: Db = {
  query: (sql, params) => tx((d) => d.query(sql, params)),
  one: (sql, params) => tx((d) => d.one(sql, params)),
};

import "server-only";
import { Pool, type PoolClient, types } from "pg";
import { requireEnv } from "./env";
import { fromDbError } from "./errors";

// Return DATE columns as 'YYYY-MM-DD' strings (no timezone shifting) and
// NUMERIC as JS numbers (scores are small, one decimal).
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
types.setTypeParser(20, (v) => Number(v));

const globalForPool = globalThis as unknown as { rivalPool?: Pool };

function pool(): Pool {
  if (!globalForPool.rivalPool) {
    globalForPool.rivalPool = new Pool({
      // Connects as the restricted `rival_app` role (no table writes, RLS enforced).
      connectionString: requireEnv("DATABASE_URL"),
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalForPool.rivalPool;
}

export type Tx = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
};

/**
 * Run work in a transaction scoped to one authenticated user. The user id is
 * set as a transaction-local setting that row-level security policies and
 * every database function read. Pass null for anonymous (auth) calls.
 */
export async function withUser<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client: PoolClient = await pool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('rival.user_id', $1, true)", [userId ?? ""]);
    const tx: Tx = {
      async query(sql, params) {
        return (await client.query(sql, params)).rows;
      },
      async one(sql, params) {
        return (await client.query(sql, params)).rows[0];
      },
    };
    const result = await fn(tx);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw fromDbError(e) ?? e;
  } finally {
    client.release();
  }
}

import { Client, Pool } from "pg";
import { randomUUID } from "node:crypto";
import { migrate } from "../db/scripts/migrate";

/**
 * Test harness. Creates a throwaway database, applies the real migrations,
 * and exposes:
 *   owner — superuser connection used ONLY to move the test clock
 *   as(uid) — runs SQL as the restricted rival_app role with that identity,
 *             exactly like the production API layer does
 */
const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";

export async function setupDb(name: string) {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const ownerUrl = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
  await migrate(ownerUrl, undefined, () => {});
  const owner = new Pool({ connectionString: ownerUrl, max: 2 });
  const appUrl = ownerUrl.replace("postgres@", "rival_app@");
  const app = new Pool({ connectionString: appUrl, max: 6 });

  async function as<T = any>(uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    const c = await app.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('rival.user_id', $1, true)", [uid ?? ""]);
      const r = await c.query(sql, params);
      await c.query("commit");
      return r.rows as T[];
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }

  async function setClock(iso: string) {
    await owner.query(
      "insert into test_clock (id, fixed_now) values (true, $1) on conflict (id) do update set fixed_now = excluded.fixed_now",
      [iso],
    );
  }

  let n = 0;
  async function signup(opts: { name?: string; tz?: string; noPledge?: boolean } = {}) {
    n += 1;
    const name = opts.name ?? `Player ${n}`;
    const [row] = await as<{ id: string }>(
      null,
      "select auth_signup($1, $2, $3, $4, $5, $6, $7) as id",
      [`p${n}-${randomUUID().slice(0, 6)}@test.dev`, "x", name, `Team ${name}`, `T${n}`.slice(0, 4).toUpperCase().padEnd(2, "X"), "#C6FF3D", opts.tz ?? "America/Chicago"],
    );
    if (!opts.noPledge) await as(row.id, "select take_pledge()");
    return row.id;
  }

  async function log(uid: string, type: string, date: string, opts: { min?: number; steps?: number; req?: string } = {}) {
    const [r] = await as<{ id: string }>(
      uid,
      "select log_workout($1, $2, $3, $4, $5, null, null) as id",
      [opts.req ?? randomUUID(), type, date, opts.min ?? null, opts.steps ?? null],
    );
    return r.id;
  }

  async function day(uid: string, league: string, date: string) {
    const rows = await as(uid, "select * from league_day_scores($1, $2, $2) where user_id = $3", [league, date, uid]);
    return rows[0];
  }

  async function close() {
    await app.end();
    await owner.end();
  }

  return { owner, as, setClock, signup, log, day, close };
}

export type Db = Awaited<ReturnType<typeof setupDb>>;

export async function expectFail(p: Promise<unknown>, detail: string | RegExp) {
  try {
    await p;
  } catch (e: any) {
    const got = e.detail ?? e.message;
    if (typeof detail === "string" ? got === detail || e.message.includes(detail) : detail.test(got) || detail.test(e.message)) return e;
    throw new Error(`expected failure ${detail}, got: ${e.message} (${e.detail ?? e.code})`);
  }
  throw new Error(`expected failure ${detail}, but it succeeded`);
}

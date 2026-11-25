/**
 * Applies db/migrations/*.sql in order, once each, as the database OWNER.
 * Also ensures the restricted `rival_app` login role exists.
 *
 *   MIGRATION_DATABASE_URL  owner connection (direct, not pooled)
 *   RIVAL_APP_DB_PASSWORD   password for the rival_app role (omit for local trust auth)
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

export async function migrate(url: string, appPassword?: string, log = console.log) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const role = await client.query("select 1 from pg_roles where rolname = 'rival_app'");
    if (role.rowCount === 0) {
      const pw = appPassword ? ` password '${appPassword.replace(/'/g, "''")}'` : "";
      await client.query(`create role rival_app login${pw}`);
      log("created role rival_app");
    } else if (appPassword) {
      await client.query(`alter role rival_app login password '${appPassword.replace(/'/g, "''")}'`);
    }
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    await client.query("revoke all on schema_migrations from public");
    const dir = join(__dirname, "..", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const done = new Set(
      (await client.query("select name from schema_migrations")).rows.map((r) => r.name as string),
    );
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(join(dir, f), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [f]);
        await client.query("commit");
        log(`applied ${f}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error("MIGRATION_DATABASE_URL is required");
    process.exit(1);
  }
  migrate(url, process.env.RIVAL_APP_DB_PASSWORD).then(
    () => console.log("migrations complete"),
    (e) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}

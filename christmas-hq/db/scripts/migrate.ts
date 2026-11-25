/**
 * Applies db/migrations/*.sql in order, once each.
 *   MIGRATION_DATABASE_URL  owner connection (direct, not pooled). Falls back to DATABASE_URL.
 */
import { config } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

config({ path: ".env.local" });
config();

async function migrate(url: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      "create table if not exists hq_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const dir = join(__dirname, "..", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const done = new Set((await client.query("select name from hq_migrations")).rows.map((r) => r.name as string));
    for (const f of files) {
      if (done.has(f)) continue;
      await client.query("begin");
      try {
        await client.query(readFileSync(join(dir, f), "utf8"));
        await client.query("insert into hq_migrations (name) values ($1)", [f]);
        await client.query("commit");
        console.log(`applied ${f}`);
      } catch (e) {
        await client.query("rollback");
        throw new Error(`migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL (or DATABASE_URL) is required");
  process.exit(1);
}
migrate(url).then(
  () => console.log("migrations complete"),
  (e) => {
    console.error(e.message);
    process.exit(1);
  },
);

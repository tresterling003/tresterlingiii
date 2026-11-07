import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Server-side store for alerts pushed by authorised senders (Apple Shortcuts etc).
 *
 * Two implementations: Redis over REST (used automatically when UPSTASH_REDIS_REST_* or
 * KV_REST_API_* is set, e.g. on Vercel) and a JSON file in DATA_DIR (self-hosting / local).
 */
export interface StoredAlert {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  source: string;
  at: number;
}

export interface AlertsStore {
  list(since?: number): Promise<StoredAlert[]>;
  add(a: StoredAlert): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

const MAX = 200;

class FileAlertsStore implements AlertsStore {
  private file = path.resolve(env.dataDir, "alerts.json");
  private queue: Promise<unknown> = Promise.resolve();

  private async read(): Promise<StoredAlert[]> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8")) as StoredAlert[];
    } catch {
      return [];
    }
  }
  private async write(items: StoredAlert[]) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(items), { mode: 0o600 });
    await fs.rename(tmp, this.file);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }
  async list(since = 0) {
    return (await this.read()).filter((a) => a.at > since).sort((a, b) => b.at - a.at);
  }
  add(a: StoredAlert) {
    return this.serial(async () => {
      const items = await this.read();
      items.push(a);
      await this.write(items.sort((x, y) => y.at - x.at).slice(0, MAX));
    });
  }
  remove(id: string) {
    return this.serial(async () => this.write((await this.read()).filter((a) => a.id !== id)));
  }
  clear() {
    return this.serial(async () => this.write([]));
  }
}

/** Redis via the Upstash REST protocol (works on Vercel/serverless). One list, newest first. */
class RedisAlertsStore implements AlertsStore {
  private key = "livingspace:alerts";
  private async cmd<T>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(env.redisUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.redisToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    const json = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || json.error) throw new Error(`Redis: ${json.error ?? res.status}`);
    return json.result as T;
  }
  async list(since = 0) {
    const raw = await this.cmd<string[]>("LRANGE", this.key, 0, MAX - 1);
    return raw.map((r) => JSON.parse(r) as StoredAlert).filter((a) => a.at > since).sort((a, b) => b.at - a.at);
  }
  async add(a: StoredAlert) {
    await this.cmd("LPUSH", this.key, JSON.stringify(a));
    await this.cmd("LTRIM", this.key, 0, MAX - 1);
  }
  async remove(id: string) {
    const raw = await this.cmd<string[]>("LRANGE", this.key, 0, MAX - 1);
    for (const r of raw) if ((JSON.parse(r) as StoredAlert).id === id) await this.cmd("LREM", this.key, 0, r);
  }
  async clear() {
    await this.cmd("DEL", this.key);
  }
}

let store: AlertsStore | null = null;
export function alertsStore(): AlertsStore {
  return (store ??= env.redisUrl && env.redisToken ? new RedisAlertsStore() : new FileAlertsStore());
}

/** Fixed-window rate limit per key (in-memory; good enough for a single-user app). */
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  h.n++;
  return h.n <= limit;
}

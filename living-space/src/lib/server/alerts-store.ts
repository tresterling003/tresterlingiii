import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * Server-side store for alerts pushed by authorised senders (Apple Shortcuts etc).
 *
 * The interface is deliberately tiny so the JSON-file implementation can be swapped for
 * Postgres/Redis/KV when deploying to a serverless host with an ephemeral filesystem.
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

let store: AlertsStore | null = null;
export function alertsStore(): AlertsStore {
  return (store ??= new FileAlertsStore());
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

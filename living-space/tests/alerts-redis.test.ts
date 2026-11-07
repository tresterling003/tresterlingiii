import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.SESSION_SECRET = "x".repeat(40);
process.env.KV_REST_API_URL = "https://redis.example";
process.env.KV_REST_API_TOKEN = "t";
process.env.VERCEL = "1";

describe("alerts on serverless", async () => {
  // Minimal in-memory Upstash REST emulation.
  const list: string[] = [];
  const calls: unknown[][] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const [cmd, , a, b] = JSON.parse(String(init.body)) as [string, string, string | number, string | number];
    calls.push([cmd, a, b]);
    let result: unknown = "OK";
    if (cmd === "LPUSH") result = list.unshift(String(a));
    if (cmd === "LTRIM") list.splice(Number(b) + 1);
    if (cmd === "LRANGE") result = list.slice(Number(a), Number(b) + 1);
    if (cmd === "LREM") list.splice(list.indexOf(String(b)), 1);
    if (cmd === "DEL") list.length = 0;
    return new Response(JSON.stringify({ result }), { status: 200 });
  });
  const { alertsStore } = await import("@/lib/server/alerts-store");
  const { alertsConfigured, alertsStorageReady } = await import("@/lib/server/env");

  it("uses Redis when KV env vars are present, even on an ephemeral filesystem", async () => {
    expect(alertsStorageReady()).toBe(true);
    const s = alertsStore();
    await s.add({ id: "a", title: "One", body: null, url: null, source: "Shortcuts", at: 1 });
    await s.add({ id: "b", title: "Two", body: null, url: null, source: "Shortcuts", at: 2 });
    expect((await s.list()).map((x) => x.id)).toEqual(["b", "a"]);
    expect((await s.list(1)).map((x) => x.id)).toEqual(["b"]);
    await s.remove("a");
    expect((await s.list()).map((x) => x.id)).toEqual(["b"]);
    expect(calls.some((c) => c[0] === "LTRIM")).toBe(true);
  });
  it("is not 'configured' without an ingest token", () => {
    expect(alertsConfigured()).toBe(false);
  });
});

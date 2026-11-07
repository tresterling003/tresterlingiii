import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.SESSION_SECRET = "x".repeat(40);

describe("sealed cookies", async () => {
  const { seal, unseal, safeEqual } = await import("@/lib/server/crypto");
  it("round-trips and rejects tampering or wrong purpose", () => {
    const t = seal({ refreshToken: "secret" }, "p1");
    expect(t).not.toContain("secret");
    expect(unseal<{ refreshToken: string }>(t, "p1")?.refreshToken).toBe("secret");
    expect(unseal(t, "p2")).toBeNull();
    const bad = t.slice(0, -2) + (t.endsWith("A") ? "B" : "A") + t.slice(-1);
    expect(unseal(bad, "p1")).toBeNull();
  });
  it("compares tokens safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("calendar zone math", async () => {
  const { _test } = await import("@/lib/server/google/calendar");
  it("finds local midnight in a zone, across DST", () => {
    expect(new Date(_test.zonedMidnight("2026-07-01", "America/New_York")).toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(new Date(_test.zonedMidnight("2026-12-01", "America/New_York")).toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(new Date(_test.zonedMidnight("2026-11-01", "America/New_York")).toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });
});

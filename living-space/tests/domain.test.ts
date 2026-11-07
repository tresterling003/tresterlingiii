import { describe, expect, it } from "vitest";
import { pileTier, envelopeCount, diffArrivals, EMPTY_SYNC, parseFrom } from "@/domain/mail";
import { eventStatuses, nextEvent, sortEvents, localDateToMs } from "@/domain/calendar";
import { computeLighting, dateKey, dayBounds, phaseFor, isoLocalToMinutes } from "@/domain/time";
import { describeWmo, sceneWeather } from "@/domain/weather";
import { buildSnapshot, shortForecast } from "@/domain/openmeteo";
import { tickVitals, applyAction, DEFAULT_VITALS } from "@/domain/pet";
import { computeCamera, clampX } from "@/scene/useCamera";
import { HOTSPOTS } from "@/scene/layout";
import { sheetModel, shortTime } from "@/scene/Board";
import type { CalendarEvent, MailMessage } from "@/domain/types";

const msg = (id: string, t: number): MailMessage => ({ id, threadId: id, from: "A", fromEmail: "a@x", subject: "s", snippet: "", receivedAt: t, url: "" });

describe("mail pile", () => {
  it("maps counts to the four tiers", () => {
    expect([0, 1, 5, 6, 20, 21, 500].map(pileTier)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
  it("draws a bounded, monotonic number of envelopes", () => {
    let prev = 0;
    for (let n = 0; n < 2000; n += 7) {
      const c = envelopeCount(n);
      expect(c).toBeGreaterThanOrEqual(prev);
      expect(c).toBeLessThanOrEqual(26);
      prev = c;
    }
  });
});

describe("new-mail detection", () => {
  it("treats the first sync as backlog, not deliveries", () => {
    const r = diffArrivals(EMPTY_SYNC, [msg("a", 100), msg("b", 200)]);
    expect(r.arrivals).toEqual([]);
    expect(r.next.initialised).toBe(true);
    expect(r.next.highWater).toBe(200);
  });
  it("detects only genuinely new ids newer than the high-water mark", () => {
    const s1 = diffArrivals(EMPTY_SYNC, [msg("a", 100), msg("b", 200)]).next;
    const r = diffArrivals(s1, [msg("c", 300), msg("a", 100), msg("old-reunread", 50)]);
    expect(r.arrivals.map((m) => m.id)).toEqual(["c"]);
  });
  it("does not re-announce a message after it was read and the list shrank", () => {
    const s1 = diffArrivals(EMPTY_SYNC, [msg("a", 100)]).next;
    const s2 = diffArrivals(s1, []).next;
    expect(diffArrivals(s2, [msg("a", 100)]).arrivals).toEqual([]);
  });
  it("parses From headers", () => {
    expect(parseFrom('"Ana Ruiz" <ana@x.com>')).toEqual({ name: "Ana Ruiz", email: "ana@x.com" });
    expect(parseFrom("bob@x.com")).toEqual({ name: "bob@x.com", email: "bob@x.com" });
  });
});

describe("calendar", () => {
  const base = new Date(2026, 10, 7).getTime();
  const h = (x: number) => base + x * 3_600_000;
  const ev = (id: string, s: number, e: number, allDay = false): CalendarEvent => ({ id, title: id, allDay, start: s, end: e, location: null, description: null, url: null });
  const events = [ev("dinner", h(17), h(19)), ev("gym", h(9), h(10)), ev("holiday", base, h(24), true), ev("shop", h(11.5), h(12.5))];
  it("sorts all-day first then chronologically", () => {
    expect(sortEvents(events).map((e) => e.id)).toEqual(["holiday", "gym", "shop", "dinner"]);
  });
  it("marks past/now/next/upcoming without claiming completion", () => {
    const st = eventStatuses(events, h(12));
    expect(st.get("gym")).toBe("past");
    expect(st.get("shop")).toBe("now");
    expect(st.get("dinner")).toBe("next");
    expect(st.get("holiday")).toBe("all-day");
    expect(nextEvent(events, h(12))?.id).toBe("dinner");
    expect(nextEvent(events, h(20))).toBeNull();
  });
  it("parses all-day dates as local midnight", () => {
    expect(localDateToMs("2026-11-07")).toBe(base);
  });
});

describe("time & lighting", () => {
  it("day bounds span the local day (23/25h around DST handled by Date)", () => {
    const { start, end } = dayBounds(new Date(2026, 2, 8, 15));
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(9);
    expect(dateKey(start)).toBe("2026-03-08");
  });
  it("lighting is dark at night, bright at noon, warm at sunset", () => {
    expect(computeLighting(120).daylight).toBeLessThan(0.1);
    expect(computeLighting(720).daylight).toBeGreaterThan(0.95);
    expect(computeLighting(1065).golden).toBeGreaterThan(0.9);
    expect(computeLighting(1380).lamps).toBeGreaterThan(0.9);
  });
  it("lighting changes gradually (no jumps)", () => {
    for (let m = 1; m < 1440; m++) {
      expect(Math.abs(computeLighting(m).daylight - computeLighting(m - 1).daylight)).toBeLessThan(0.05);
    }
  });
  it("phases", () => {
    expect([300, 480, 840, 1050, 1300].map((m) => phaseFor(m))).toEqual(["night", "morning", "afternoon", "evening", "night"]);
    expect(isoLocalToMinutes("2026-11-07T06:41")).toBe(401);
  });
});

describe("weather", () => {
  it("maps WMO codes to all required scene states", () => {
    expect(describeWmo(0).kind).toBe("sunny");
    expect(describeWmo(2).kind).toBe("partly-cloudy");
    expect(describeWmo(3).kind).toBe("cloudy");
    expect(describeWmo(63).kind).toBe("rain");
    expect(describeWmo(81).kind).toBe("rain");
    expect(describeWmo(95).kind).toBe("thunderstorm");
    expect(describeWmo(73).kind).toBe("snow");
    expect(sceneWeather(0, false)).toBe("clear-night");
    expect(sceneWeather(63, false)).toBe("rain");
  });
  it("builds a snapshot from an Open-Meteo response", () => {
    const snap = buildSnapshot(
      {
        current: { time: "2026-11-07T14:00", temperature_2m: 12.3, apparent_temperature: 10, weather_code: 61, is_day: 1, wind_speed_10m: 9 },
        hourly: { time: ["2026-11-07T13:00", "2026-11-07T14:00", "2026-11-07T15:00"], temperature_2m: [11, 12, 13], weather_code: [61, 61, 63], precipitation_probability: [40, 70, 80] },
        daily: { time: ["2026-11-07"], temperature_2m_max: [14], temperature_2m_min: [6], precipitation_probability_max: [80], sunrise: ["2026-11-07T06:41"], sunset: ["2026-11-07T16:38"] },
      },
      "metric",
      1,
    );
    expect(snap.kind).toBe("rain");
    expect(snap.hourly[0].time).toBe("2026-11-07T14:00");
    expect(snap.high).toBe(14);
    expect(snap.precipChance).toBe(80);
    expect(shortForecast(snap)).toMatch(/likely/);
  });
});

describe("pet", () => {
  it("never drops mood below 40 from neglect alone", () => {
    const v = tickVitals({ mood: 45, energy: 60, updatedAt: 1 }, 1 + 48 * 3_600_000, false);
    expect(v.mood).toBeGreaterThanOrEqual(40);
  });
  it("sleep restores energy, play lifts mood", () => {
    expect(tickVitals({ ...DEFAULT_VITALS, energy: 20, updatedAt: 1 }, 1 + 3_600_000 * 2, true).energy).toBeGreaterThan(50);
    expect(applyAction(DEFAULT_VITALS, "play", 1).mood).toBeGreaterThan(DEFAULT_VITALS.mood);
  });
});

describe("scene layout", () => {
  it("hotspots don't overlap", () => {
    const hs = Object.values(HOTSPOTS);
    for (let i = 0; i < hs.length; i++)
      for (let j = i + 1; j < hs.length; j++) {
        const a = hs[i], b = hs[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.label} vs ${b.label}`).toBe(false);
      }
  });
  it("desktop fits the whole room; portrait phones pan at a readable scale", () => {
    const d = computeCamera(1440, 900);
    expect(d.panX).toBe(false);
    const p = computeCamera(390, 844);
    expect(p.panX).toBe(true);
    expect(p.scale).toBeGreaterThan(0.6);
    expect(clampX(-500, p)).toBeGreaterThan(0);
  });
  it("pixel planner sheet uses compact times and focuses on what's next", () => {
    const base = new Date(2026, 10, 7).getTime();
    const h = (x: number) => base + x * 3_600_000;
    expect(shortTime(h(9))).toBe("9a");
    expect(shortTime(h(17.5))).toBe("5:30p");
    expect(shortTime(h(12))).toBe("12p");
    const ev = (id: string, s: number) => ({ id, title: id, allDay: false, start: h(s), end: h(s + 1), location: null, description: null, url: null });
    const m = sheetModel(h(13.5), [ev("a", 8), ev("b", 10), ev("c", 13), ev("d", 15), ev("e", 18), ev("f", 20), ev("g", 21)], "ready");
    expect(m.rows.map((r) => r.id)).toEqual(["b", "c", "d", "e"]);
    expect(m.rows[1].status).toBe("now");
    expect(m.rows[2].status).toBe("next");
    expect(m.more).toBe(3);
    expect(sheetModel(h(9), [], "ready").empty).toBe(true);
    expect(sheetModel(h(9), null, "error").message).toBe("Not connected");
  });
});

"use client";
import type { CalendarEvent, MailMessage, WeatherSnapshot, WeatherKind } from "@/domain/types";
import { dateKey, dayBounds } from "@/domain/time";
import { world } from "../store";
import { pushActivity, uid } from "../actions";
import { announceDelivery } from "./gmail";
import type { SourceAdapter } from "./types";

/**
 * Demo mode. Every item is marked as SAMPLE in the data and in the UI.
 * Nothing here is ever shown while the app is in live mode.
 */
const SENDERS = [
  ["Juniper Hale", "Saturday hike?", "Thinking of the ridge trail if the weather holds. Bring snacks, I'll bring the thermos."],
  ["Corner Bookshop", "Your hold is ready", "The book you reserved is waiting at the front desk for the next 7 days."],
  ["Marcus Bell", "Notes from Thursday", "Attached are the notes and the two links we talked about. No rush on this."],
  ["Grandma Rose", "Recipe you asked for", "Here's the plum cake recipe. The secret is a pinch of cardamom."],
  ["Studio Weekly", "This week in the studio", "New prints, a pottery evening, and a short essay on slow mornings."],
  ["Ava from Pottery Club", "Kiln schedule", "Firing is moved to Tuesday. Pieces can be collected Friday afternoon."],
  ["Transit Alerts", "Line 4 running normally", "Earlier delays on Line 4 have cleared. Thanks for your patience."],
  ["Theo Park", "Photos from the picnic", "Finally got them off my camera. The one with the kite is my favourite."],
];

let senderIdx = 0;
function sampleMessage(minsAgo: number): MailMessage {
  const [from, subject, snippet] = SENDERS[senderIdx++ % SENDERS.length];
  const id = uid("sample");
  return {
    id,
    threadId: id,
    from,
    fromEmail: `${from.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
    subject,
    snippet,
    receivedAt: Date.now() - minsAgo * 60_000,
    url: "",
  };
}

function sampleDay(): CalendarEvent[] {
  const { start } = dayBounds(new Date());
  const at = (h: number, m = 0) => start.getTime() + (h * 60 + m) * 60_000;
  const ev = (title: string, h: number, m: number, durMin: number, location: string | null = null): CalendarEvent => ({
    id: uid("ev"), title, allDay: false, start: at(h, m), end: at(h, m) + durMin * 60_000, location, description: "Sample event (demo mode).", url: null,
  });
  return [
    { id: uid("ev"), title: "Recycling day", allDay: true, start: start.getTime(), end: start.getTime() + 86_400_000, location: null, description: "Sample all-day event.", url: null },
    ev("Morning stretch", 8, 0, 30),
    ev("Coffee with Juniper", 10, 30, 60, "Lantern Café"),
    ev("Grocery run", 13, 0, 45, "Market Street"),
    ev("Call Grandma", 17, 30, 30),
    ev("Pottery class", 19, 0, 90, "Community Studio"),
  ];
}

export function sampleWeather(kind: WeatherKind): WeatherSnapshot {
  const map: Record<WeatherKind, [number, string, number, number]> = {
    sunny: [0, "Clear sky", 21, 5],
    "partly-cloudy": [2, "Partly cloudy", 18, 15],
    cloudy: [3, "Overcast", 14, 30],
    fog: [45, "Fog", 11, 20],
    rain: [63, "Rain", 12, 85],
    thunderstorm: [95, "Thunderstorm", 19, 90],
    snow: [73, "Snow", -2, 80],
    "clear-night": [0, "Clear sky", 9, 5],
  };
  const [code, description, temp, pop] = map[kind];
  const now = new Date();
  return {
    kind, code, description, isDay: kind !== "clear-night",
    temperature: temp, apparent: temp - 1, high: temp + 4, low: temp - 6, precipChance: pop, windSpeed: 12,
    sunrise: `${dateKey(now)}T06:45`, sunset: `${dateKey(now)}T17:45`,
    hourly: Array.from({ length: 12 }, (_, i) => ({ time: new Date(now.getTime() + i * 3_600_000).toISOString().slice(0, 16), temperature: temp + Math.round(Math.sin(i / 3) * 2), code, precipChance: pop })),
    units: "metric", fetchedAt: Date.now(),
  };
}

export const demo = {
  deliver(n = 1) {
    const s = world.get();
    const fresh = Array.from({ length: n }, () => sampleMessage(0));
    const messages = [...fresh, ...(s.mail.data?.messages ?? [])].slice(0, 40);
    world.set({ mail: { status: "ready", error: null, updatedAt: Date.now(), data: { unreadCount: (s.mail.data?.unreadCount ?? 0) + n, messages, canMarkRead: true, fetchedAt: Date.now() } } });
    announceDelivery(n, fresh[fresh.length - 1].from, true);
  },
  setUnread(n: number) {
    const messages = Array.from({ length: Math.min(n, 30) }, (_, i) => sampleMessage(20 + i * 47));
    world.set({ mail: { status: "ready", error: null, updatedAt: Date.now(), data: { unreadCount: n, messages, canMarkRead: true, fetchedAt: Date.now() } } });
  },
  markRead(id: string) {
    const m = world.get().mail.data;
    if (!m) return;
    world.set({ mail: { ...world.get().mail, data: { ...m, unreadCount: Math.max(0, m.unreadCount - 1), messages: m.messages.filter((x) => x.id !== id) } } });
  },
  setCalendar(kind: "sample" | "empty") {
    world.set({ calendar: { status: "ready", error: null, updatedAt: Date.now(), data: { dateKey: dateKey(new Date()), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, events: kind === "empty" ? [] : sampleDay(), fetchedAt: Date.now() } } });
  },
  addEventSoon() {
    const c = world.get().calendar.data;
    const start = Date.now() + 5 * 60_000;
    const e: CalendarEvent = { id: uid("ev"), title: "Sample: tea break", allDay: false, start, end: start + 20 * 60_000, location: null, description: "Sample event (demo mode).", url: null };
    world.set({ calendar: { ...world.get().calendar, data: { ...(c ?? { dateKey: dateKey(new Date()), timeZone: "", fetchedAt: Date.now() }), events: [...(c?.events ?? []), e] } as never } });
  },
  setWeather(kind: WeatherKind) {
    world.set({ weather: { status: "ready", data: sampleWeather(kind), error: null, updatedAt: Date.now() } });
  },
  computer(title = "Sample: build finished") {
    pushActivity([{ source: "demo", sourceLabel: "Sample app", channel: "computer", title, body: "Demo activity", at: Date.now(), sample: true }]);
  },
  phone(title = "Sample: water the plants") {
    pushActivity([{ source: "demo", sourceLabel: "Sample reminder", channel: "phone", title, body: "Demo alert", at: Date.now(), sample: true }]);
  },
};

export function demoAdapter(): SourceAdapter {
  return {
    id: "demo",
    label: "Sample data",
    channels: ["computer", "phone"],
    start() {
      demo.setUnread(4);
      demo.setCalendar("sample");
      const h = new Date().getHours();
      demo.setWeather(h < 6 || h >= 19 ? "clear-night" : "partly-cloudy");
      // An occasional sample letter so the door feels alive while exploring.
      const id = setInterval(() => !document.hidden && demo.deliver(1), 4 * 60_000);
      return () => clearInterval(id);
    },
    refresh: async () => {
      demo.setCalendar("sample");
    },
  };
}

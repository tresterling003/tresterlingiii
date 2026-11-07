/** Shared, serialisable domain types. Used by both the server routes and the client engine. */

export type WeatherKind =
  | "sunny"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "rain"
  | "thunderstorm"
  | "snow"
  | "clear-night";

export interface WeatherSnapshot {
  kind: WeatherKind;
  code: number;
  description: string;
  isDay: boolean;
  temperature: number;
  apparent: number | null;
  high: number | null;
  low: number | null;
  precipChance: number | null;
  windSpeed: number | null;
  sunrise: string | null; // ISO local
  sunset: string | null;
  hourly: { time: string; temperature: number; code: number; precipChance: number | null }[];
  units: "metric" | "imperial";
  fetchedAt: number;
}

export interface MailMessage {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  receivedAt: number; // epoch ms (Gmail internalDate)
  url: string;
}

export interface MailSnapshot {
  unreadCount: number;
  messages: MailMessage[];
  canMarkRead: boolean;
  fetchedAt: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  allDay: boolean;
  start: number; // epoch ms; for all-day events = local midnight of the start date
  end: number;
  location: string | null;
  description: string | null;
  url: string | null;
}

export interface CalendarSnapshot {
  dateKey: string; // YYYY-MM-DD in the user's local zone
  timeZone: string;
  events: CalendarEvent[];
  fetchedAt: number;
}

/** A thing that happened in a connected source. Routed to the computer and/or phone. */
export interface ActivityItem {
  id: string;
  source: string; // adapter id, e.g. "gmail", "calendar", "shortcuts", "tasks", "demo"
  sourceLabel: string;
  channel: "computer" | "phone";
  title: string;
  body?: string;
  url?: string;
  at: number;
  read: boolean;
  sample?: boolean;
}

export interface Task {
  id: string;
  text: string;
  due: string | null; // YYYY-MM-DD
  done: boolean;
  createdAt: number;
  doneAt: number | null;
}

export interface SavedLocation {
  name: string;
  latitude: number;
  longitude: number;
  source: "search" | "device";
}

/** Date helpers over 'YYYY-MM-DD' strings (calendar dates, no time zone). */
const MS = 86_400_000;

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + n * MS).toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / MS);
}

export function minDate(a: string, b: string) {
  return a < b ? a : b;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dow(iso: string) {
  return DOW[new Date(iso + "T00:00:00Z").getUTCDay()];
}

export function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function rangeLabel(start: string, end: string) {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  if (s.getUTCMonth() === e.getUTCMonth()) return `${MON[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}`;
  return `${shortDate(start)} – ${shortDate(end)}`;
}

export function relativeDay(iso: string, today: string) {
  const d = diffDays(today, iso);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d > 1 && d < 7) return dow(iso);
  return shortDate(iso);
}

export function timeAgo(ts: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(ts)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

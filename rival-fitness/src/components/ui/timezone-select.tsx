"use client";
import { useMemo } from "react";
import { Input, Select } from "./form";

const COMMON = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney",
];

function label(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
    const abbr = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return `${tz.replace(/_/g, " ").replace("/", " / ")}${abbr ? ` (${abbr})` : ""}`;
  } catch {
    return tz;
  }
}

/** IANA time zone picker; common US zones first, then every zone the device knows. */
export function TimezoneSelect({ id, value, onChange, disabled }: { id?: string; value: string; onChange: (tz: string) => void; disabled?: boolean }) {
  const all = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? null;
    } catch {
      return null;
    }
  }, []);
  if (!all) return <Input id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  const rest = all.filter((z) => !COMMON.includes(z));
  const known = all.includes(value) || COMMON.includes(value);
  return (
    <Select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value={value}>{value}</option>}
      <optgroup label="Common">{COMMON.map((z) => <option key={z} value={z}>{label(z)}</option>)}</optgroup>
      <optgroup label="All time zones">{rest.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</optgroup>
    </Select>
  );
}

export const APP_TZ = process.env.APP_TZ ?? "Europe/Istanbul";

/** YYYY-MM-DD for "now" in the app time zone (optionally shifted by days). */
export function today(offsetDays = 0, now = new Date()): string {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(now);
  return offsetDays ? addDays(d, offsetDays) : d;
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing ymd (weeks start Monday in TR and GB). */
export function weekStart(ymd: string): string {
  const dow = (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(ymd, -dow);
}

/** Start of the current week in the app time zone, as an instant. */
export function weekStartInstant(now = new Date()): Date {
  const ymd = weekStart(today(0, now));
  // Offset of APP_TZ at that moment, good enough for a week boundary.
  const tzName = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, timeZoneName: "longOffset" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = tzName && tzName !== "GMT" ? tzName.replace("GMT", "") : "+00:00";
  return new Date(`${ymd}T00:00:00${offset}`);
}

/** Whole days from a to b (YYYY-MM-DD), negative when b is earlier. */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

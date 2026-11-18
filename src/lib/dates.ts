/**
 * Calendar-date helpers. A date is always a `YYYY-MM-DD` string in the
 * student's own timezone; nothing here reads the clock.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date at `instant` for someone in `timeZone` (UTC if the zone is unknown). */
export function localDate(instant: Date, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function toUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function isValidDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false;
  return new Date(toUtcMs(date)).toISOString().slice(0, 10) === date;
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** Every date from `from` through `to`, inclusive. Empty when `to` is earlier. */
export function dateRange(from: string, to: string): string[] {
  const count = daysBetween(from, to);
  const out: string[] = [];
  for (let i = 0; i <= count; i++) out.push(addDays(from, i));
  return out;
}

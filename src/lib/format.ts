/** Small formatting helpers shared by screens. */

function utcDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Wednesday, November 18" */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    utcDate(date),
  );
}

/** "Wed" */
export function weekday(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(utcDate(date));
}

/** "Nov 18" */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(utcDate(date));
}

/** How far away a test is, in words a student would use. */
export function countdown(daysLeft: number): { number: string; unit: string } {
  if (daysLeft < 0) return { number: "Past", unit: "" };
  if (daysLeft === 0) return { number: "Today", unit: "" };
  if (daysLeft === 1) return { number: "1", unit: "day" };
  return { number: String(daysLeft), unit: "days" };
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

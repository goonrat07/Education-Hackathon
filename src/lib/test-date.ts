import { MAX_TEST_DAYS_AHEAD } from "@/config/study";
import { addDays, daysBetween, isValidDate } from "@/lib/dates";

/** The latest date a test can be given, counted from the student's today. */
export function latestTestDate(today: string): string {
  return addDays(today, MAX_TEST_DAYS_AHEAD);
}

/**
 * What is wrong with a test date, in words for the student, or null when it
 * is fine: a real date, not in the past, and no more than a year away.
 */
export function testDateProblem(testDate: string, today: string): string | null {
  if (!isValidDate(testDate)) return "That is not a date. Pick the day of your test.";
  const daysAway = daysBetween(today, testDate);
  if (daysAway < 0) return "Pick a test date that hasn't passed.";
  if (daysAway > MAX_TEST_DAYS_AHEAD) return "Pick a test date within a year from today. Check the year.";
  return null;
}

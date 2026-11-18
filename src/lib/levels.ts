import {
  CHECK_MIN_QUESTIONS,
  CHECK_PASS_MARK,
  GAP_CALLOUT_COUNT,
  GAP_CALLOUT_THRESHOLD,
  LEVEL_WEIGHTS,
  TOP_LEVEL,
  type Level,
} from "@/config/study";
import { daysBetween } from "@/lib/dates";

/**
 * Topic level rules. Pure functions: the same inputs always give the same
 * answer, and nothing here reads the clock or the database.
 *
 * A topic climbs one level each time a check is passed. The last step, to
 * Locked in, needs a delayed check passed at least a day after the topic
 * reached Got it. Nothing else moves a level.
 */

export interface CheckScore {
  /** Questions answered correctly. */
  correct: number;
  /** Questions that counted (questions the student flagged as wrong are left out). */
  scored: number;
}

/** A check is passed with at least three scored questions and 75% of them right. */
export function checkPassed(correct: number, scored: number): boolean {
  if (scored < CHECK_MIN_QUESTIONS) return false;
  return correct / scored >= CHECK_PASS_MARK;
}

/**
 * The topic's level after a check.
 * @param levelSince local date the current level was reached, if known
 */
export function nextLevel(
  level: Level,
  levelSince: string | null,
  check: { kind: "session" | "delayed"; passed: boolean; takenOn: string },
): Level {
  if (!check.passed || level === TOP_LEVEL) return level;
  if (level === 2) {
    const aDayLater = levelSince !== null && daysBetween(levelSince, check.takenOn) >= 1;
    return check.kind === "delayed" && aDayLater ? 3 : 2;
  }
  return (level + 1) as Level;
}

/** A test's readiness, 0 to 1: the average of what each topic's level is worth. */
export function readiness(levels: Level[]): number {
  if (levels.length === 0) return 0;
  const total = levels.reduce((sum, level) => sum + LEVEL_WEIGHTS[level], 0);
  return total / levels.length;
}

/**
 * How far a student's confidence (1–5) is from their latest check result.
 * Positive means more confident than the check supports. Null when either is missing.
 */
export function confidenceGap(confidence: number | null, latest: CheckScore | null): number | null {
  if (confidence === null || latest === null || latest.scored === 0) return null;
  return (confidence - 1) / 4 - latest.correct / latest.scored;
}

/** The topics whose confidence and latest check disagree the most, largest first. */
export function biggestGaps<T extends { confidence: number | null; latest: CheckScore | null }>(
  rows: T[],
): Array<T & { gap: number }> {
  const withGap: Array<T & { gap: number }> = [];
  for (const row of rows) {
    const gap = confidenceGap(row.confidence, row.latest);
    if (gap !== null && Math.abs(gap) >= GAP_CALLOUT_THRESHOLD) withGap.push({ ...row, gap });
  }
  // Stable sort keeps list order for equal gaps.
  return withGap.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, GAP_CALLOUT_COUNT);
}

export interface DelayedCheckCandidate {
  level: Level;
  /** Local date of the topic's last completed study session. */
  lastStudiedOn: string | null;
  /** Local date of the topic's last session or check, whichever is later. */
  lastActivityOn: string | null;
}

/**
 * A topic is due for a delayed check when it has been studied, is not yet
 * Locked in, and nothing has happened on it today.
 */
export function dueForDelayedCheck(topic: DelayedCheckCandidate, today: string): boolean {
  if (topic.lastStudiedOn === null || topic.level === TOP_LEVEL) return false;
  const last = topic.lastActivityOn ?? topic.lastStudiedOn;
  return daysBetween(last, today) >= 1;
}

/**
 * Which topic gets the delayed check at the start of a session: the session's
 * own topic if it is due, otherwise the due topic left alone the longest
 * (ties: lower level, then list order). Null when none is due.
 */
export function pickDelayedCheckTopic(
  topics: Array<DelayedCheckCandidate & { id: string; position: number }>,
  today: string,
  sessionTopicId: string,
): string | null {
  const due = topics.filter((t) => dueForDelayedCheck(t, today));
  if (due.length === 0) return null;
  if (due.some((t) => t.id === sessionTopicId)) return sessionTopicId;
  const lastOn = (t: DelayedCheckCandidate) => (t.lastActivityOn ?? t.lastStudiedOn) as string;
  const [first] = [...due].sort(
    (a, b) => lastOn(a).localeCompare(lastOn(b)) || a.level - b.level || a.position - b.position,
  );
  return first.id;
}

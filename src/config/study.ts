/**
 * Study rules in one place: how long sessions are, how checks are scored,
 * and what each level is worth. The planner and level rules read these.
 */

export type TopicType = "memorization" | "application" | "concept";
export const TOPIC_TYPES: readonly TopicType[] = ["memorization", "application", "concept"];

/** 0 Not started, 1 Learning, 2 Got it, 3 Locked in. */
export type Level = 0 | 1 | 2 | 3;
export const LEVEL_NAMES = ["Not started", "Learning", "Got it", "Locked in"] as const;
export const TOP_LEVEL: Level = 3;

/** Every session is between these lengths. */
export const MIN_SESSION_MINUTES = 10;
export const MAX_SESSION_MINUTES = 15;

/** A check has this many questions when enough can be verified, never fewer than the minimum. */
export const CHECK_TARGET_QUESTIONS = 4;
export const CHECK_MIN_QUESTIONS = 3;
export const CHECK_MAX_QUESTIONS = 5;

/** Share of scored questions that must be right to pass a check: 3/3, 3/4 or 4/5. */
export const CHECK_PASS_MARK = 0.75;

/** What each level contributes to a test's readiness bar. */
export const LEVEL_WEIGHTS: readonly number[] = [0, 1 / 3, 2 / 3, 1];

/** Confidence used for planning when a topic has not been rated yet. */
export const DEFAULT_CONFIDENCE = 3;

/** A confidence-versus-check gap smaller than this is not called out (one step on either scale is 0.25). */
export const GAP_CALLOUT_THRESHOLD = 0.3;
export const GAP_CALLOUT_COUNT = 3;

/** Limits on what a student can enter. */
export const MIN_MINUTES_PER_DAY = 10;
export const MAX_MINUTES_PER_DAY = 240;
/** A test can be at most this many days away. Catches a mistyped year and keeps plans a sensible length. */
export const MAX_TEST_DAYS_AHEAD = 366;

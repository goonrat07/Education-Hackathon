/**
 * The one place AI settings live: which Claude model does each job, and how
 * many AI calls a student may make per day. Change them here and nowhere else.
 */

/** Model for each job. Every entry starts as claude-sonnet-5-5. */
export const AI_MODELS = {
  /** Reading uploaded PDFs and photos into passages. */
  extract: "claude-sonnet-5-5",
  /** Finding the topics a test covers. */
  topics: "claude-sonnet-5-5",
  /** Writing flashcards, practice problems and check questions. */
  generate: "claude-sonnet-5-5",
  /** Solving every generated question a second time, without seeing the first answer. */
  solve: "claude-sonnet-5-5",
  /** Deciding whether two independently written answers agree. */
  judge: "claude-sonnet-5-5",
  /** Grading a student's short answer. */
  grade: "claude-sonnet-5-5",
  /** Writing the short explanation of a plan. */
  explain: "claude-sonnet-5-5",
} as const;

export type AiTask = keyof typeof AI_MODELS;

/** AI calls one student may make per day (their local day). Counted per request to Claude. */
export const AI_DAILY_CALL_LIMIT = 120;

/** How hard Claude thinks on each job. Lower is faster and cheaper. */
export const AI_EFFORT: Record<AiTask, "low" | "medium" | "high"> = {
  extract: "low",
  topics: "low",
  generate: "medium",
  solve: "medium",
  judge: "low",
  grade: "low",
  explain: "low",
};

/** Output ceiling per call, including Claude's thinking. */
export const AI_MAX_TOKENS: Record<AiTask, number> = {
  extract: 16000,
  topics: 8000,
  generate: 12000,
  solve: 8000,
  judge: 4000,
  grade: 4000,
  explain: 3000,
};

/**
 * If Claude Sonnet 5.5 declines a request for a policy reason that a
 * substitute model can handle, Anthropic retries it server-side on the
 * default substitute. Set `enabled` to false to turn this off.
 */
export const AI_REFUSAL_FALLBACK = {
  enabled: true,
  beta: "server-side-fallback-2026-07-01",
  fallbacks: "default",
} as const;

/** PDFs longer than this are read in parts of this many pages. */
export const EXTRACT_PAGES_PER_CALL = 6;
/** How many parts of one file are read at the same time. */
export const EXTRACT_CONCURRENCY = 4;

/** How much study material to write for a topic the first time it is studied. */
export const FLASHCARDS_PER_TOPIC = 12;
export const MIN_FLASHCARDS = 4;
export const PRACTICE_MIX = { mcq: 3, short: 2, worked: 2 } as const;
export const MIN_PRACTICE_PROBLEMS = 3;
/** Check questions requested per set; the set keeps the first CHECK_TARGET_QUESTIONS that verify. */
export const CHECK_QUESTIONS_REQUESTED = 6;

import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

// ───────────────────────── Sign-in (Better Auth) ─────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ───────────────────────── App data ─────────────────────────
// Every table carries user_id so each query can filter on the owner and
// deleting the user row removes everything.

const ownerId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const tests = pgTable(
  "tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    className: text("class_name").notNull(),
    name: text("name").notNull(),
    testDate: date("test_date", { mode: "string" }).notNull(),
    minutesPerDay: integer("minutes_per_day").notNull(),
    topicsGeneratedAt: timestamp("topics_generated_at", { withTimezone: true }),
    planReadyAt: timestamp("plan_ready_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tests_user_idx").on(t.userId)],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    /** Who wrote it: the teacher's handout or the student's own notes. */
    source: text("source").$type<"teacher" | "notes">().notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    pageCount: integer("page_count"),
    status: text("status")
      .$type<"uploading" | "uploaded" | "extracting" | "ready" | "failed">()
      .notNull()
      .default("uploading"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("files_test_idx").on(t.testId), index("files_user_idx").on(t.userId)],
);

export const fileChunks = pgTable(
  "file_chunks",
  {
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    userId: ownerId(),
    idx: integer("idx").notNull(),
    data: bytea("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.fileId, t.idx] })],
);

export const passages = pgTable(
  "passages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    /** 1-based page within the file (always 1 for a photo). */
    page: integer("page").notNull(),
    /** Reading order within the file. */
    position: integer("position").notNull(),
    kind: text("kind").$type<"text" | "handwriting" | "diagram" | "table" | "equation">().notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("passages_test_idx").on(t.testId), index("passages_file_idx").on(t.fileId)],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    type: text("type").$type<"memorization" | "application" | "concept">().notNull(),
    position: integer("position").notNull(),
    /** Student's self-rating, 1–5. Null until they rate it. */
    confidence: integer("confidence"),
    /** 0 Not started, 1 Learning, 2 Got it, 3 Locked in. Changed only by src/lib/levels.ts rules. */
    level: integer("level").notNull().default(0),
    /** Local date the current level was reached. */
    levelSince: date("level_since", { mode: "string" }),
    origin: text("origin").$type<"ai" | "student">().notNull().default("ai"),
    createdAt: createdAt(),
  },
  (t) => [index("topics_test_idx").on(t.testId)],
);

export const topicPassages = pgTable(
  "topic_passages",
  {
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    passageId: uuid("passage_id")
      .notNull()
      .references(() => passages.id, { onDelete: "cascade" }),
    userId: ownerId(),
  },
  (t) => [primaryKey({ columns: [t.topicId, t.passageId] })],
);

export const checkSets = pgTable(
  "check_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    /** `ready` sets hold verified questions the student has not seen yet. */
    status: text("status").$type<"ready" | "used">().notNull().default("ready"),
    createdAt: createdAt(),
  },
  (t) => [index("check_sets_topic_idx").on(t.topicId)],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    /** `study` items feed flashcards and practice; `check` items are used once in a check. */
    role: text("role").$type<"study" | "check">().notNull(),
    kind: text("kind").$type<"flashcard" | "mcq" | "short" | "worked">().notNull(),
    content: jsonb("content").notNull(),
    /** The passage this item was written from. Deleting the passage deletes the item. */
    passageId: uuid("passage_id")
      .notNull()
      .references(() => passages.id, { onDelete: "cascade" }),
    /** Verbatim words from that passage that support the answer. */
    quote: text("quote").notNull(),
    status: text("status").$type<"active" | "flagged">().notNull().default("active"),
    checkSetId: uuid("check_set_id").references(() => checkSets.id, { onDelete: "cascade" }),
    timesSeen: integer("times_seen").notNull().default(0),
    timesCorrect: integer("times_correct").notNull().default(0),
    lastResult: text("last_result").$type<"correct" | "missed">(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("items_topic_idx").on(t.topicId), index("items_check_set_idx").on(t.checkSetId)],
);

export const studySessions = pgTable(
  "study_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // ── The session record every mode saves ──
    userId: ownerId(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds"),
    itemsAttempted: integer("items_attempted"),
    itemsCorrect: integer("items_correct"),
    score: real("score"),
    confidence: integer("confidence"),
    // ── Bookkeeping around the record ──
    status: text("status").$type<"active" | "completed">().notNull().default("active"),
    /** Calendar date in the student's timezone when the session started. */
    localDate: date("local_date", { mode: "string" }).notNull(),
    plannedMinutes: integer("planned_minutes").notNull(),
    readinessBefore: real("readiness_before").notNull().default(0),
    /** The earlier topic whose delayed check opens this session, if one was due. */
    delayedTopicId: uuid("delayed_topic_id").references(() => topics.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("sessions_test_idx").on(t.testId), index("sessions_topic_idx").on(t.topicId)],
);

export const checks = pgTable(
  "checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => studySessions.id, { onDelete: "cascade" }),
    checkSetId: uuid("check_set_id")
      .notNull()
      .references(() => checkSets.id, { onDelete: "cascade" }),
    /** `session` = end of a session; `delayed` = a topic studied on an earlier day. */
    kind: text("kind").$type<"session" | "delayed">().notNull(),
    localDate: date("local_date", { mode: "string" }).notNull(),
    status: text("status").$type<"open" | "submitted">().notNull().default("open"),
    /** Questions counted in the score (flagged questions are left out). */
    scored: integer("scored"),
    correct: integer("correct"),
    passed: boolean("passed"),
    levelBefore: integer("level_before"),
    levelAfter: integer("level_after"),
    createdAt: createdAt(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => [
    index("checks_topic_idx").on(t.topicId),
    // A session has at most one delayed check and one end-of-session check.
    uniqueIndex("checks_session_kind_idx").on(t.sessionId, t.kind),
  ],
);

export const checkAnswers = pgTable(
  "check_answers",
  {
    checkId: uuid("check_id")
      .notNull()
      .references(() => checks.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: ownerId(),
    response: text("response").notNull().default(""),
    correct: boolean("correct").notNull(),
    feedback: text("feedback").notNull().default(""),
    /** True when the student flagged the question as wrong; it does not count. */
    excluded: boolean("excluded").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.checkId, t.itemId] })],
);

export const itemFlags = pgTable(
  "item_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("item_flags_item_idx").on(t.itemId)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    userId: ownerId(),
    /** Calendar date in the student's timezone. */
    day: date("day", { mode: "string" }).notNull(),
    calls: integer("calls").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: ownerId(),
    task: text("task").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_calls_user_idx").on(t.userId, t.createdAt)],
);

/** Short-lived markers so two requests never write the same study material at once. */
export const workLocks = pgTable(
  "work_locks",
  {
    userId: ownerId(),
    key: text("key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const plans = pgTable("plans", {
  testId: uuid("test_id")
    .primaryKey()
    .references(() => tests.id, { onDelete: "cascade" }),
  userId: ownerId(),
  /** The last plan shown to the student, kept to detect missed days. */
  plan: jsonb("plan").notNull(),
  planHash: text("plan_hash").notNull(),
  computedOn: date("computed_on", { mode: "string" }).notNull(),
  explanation: text("explanation"),
  /** Hash of the plan the explanation was written for. */
  explanationHash: text("explanation_hash"),
  /** Set when a rebuild found planned sessions left undone on earlier days. */
  missedOn: date("missed_on", { mode: "string" }),
  missedSessions: integer("missed_sessions").notNull().default(0),
  updatedAt: updatedAt(),
});

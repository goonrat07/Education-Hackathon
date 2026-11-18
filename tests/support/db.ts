import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Empties every table. Each integration test starts from a blank database. */
export async function resetDb(): Promise<void> {
  await getDb().execute(sql`TRUNCATE TABLE "user", verification, rate_limit, ai_usage_total CASCADE`);
}

let counter = 0;

/** Inserts a bare user row (no password) and returns its id. */
export async function createUser(label: string): Promise<string> {
  const id = `user-${label}-${++counter}`;
  await getDb()
    .insert(schema.user)
    .values({ id, name: label, email: `${label}-${counter}@example.com` });
  return id;
}

export interface Seeded {
  testId: string;
  fileId: string;
  passageId: string;
  topicId: string;
  itemId: string;
  checkSetId: string;
  checkItemId: string;
  sessionId: string;
  checkId: string;
}

/** Gives a user one of everything: a test with a file, passage, topic, items, session, check and plan. */
export async function seedStudentData(userId: string): Promise<Seeded> {
  const db = getDb();
  const [test] = await db
    .insert(schema.tests)
    .values({ userId, className: "Chemistry", name: "Unit 4", testDate: "2026-11-25", minutesPerDay: 30 })
    .returning();
  const [file] = await db
    .insert(schema.files)
    .values({
      userId,
      testId: test.id,
      source: "teacher",
      name: "guide.pdf",
      mime: "application/pdf",
      sizeBytes: 5,
      status: "ready",
      pageCount: 1,
    })
    .returning();
  await db.insert(schema.fileChunks).values({ fileId: file.id, userId, idx: 0, data: Buffer.from("hello") });
  const [passage] = await db
    .insert(schema.passages)
    .values({
      userId,
      testId: test.id,
      fileId: file.id,
      page: 1,
      position: 0,
      kind: "text",
      text: "A mole contains 6.022 × 10^23 particles.",
    })
    .returning();
  const [topic] = await db
    .insert(schema.topics)
    .values({ userId, testId: test.id, name: "The mole", type: "memorization", position: 0, confidence: 3 })
    .returning();
  await db.insert(schema.topicPassages).values({ topicId: topic.id, passageId: passage.id, userId });
  const [item] = await db
    .insert(schema.items)
    .values({
      userId,
      testId: test.id,
      topicId: topic.id,
      role: "study",
      kind: "flashcard",
      content: { front: "How many particles are in a mole?", back: "6.022 × 10^23" },
      passageId: passage.id,
      quote: "6.022 × 10^23 particles",
    })
    .returning();
  const [checkSet] = await db
    .insert(schema.checkSets)
    .values({ userId, testId: test.id, topicId: topic.id })
    .returning();
  const [checkItem] = await db
    .insert(schema.items)
    .values({
      userId,
      testId: test.id,
      topicId: topic.id,
      role: "check",
      kind: "mcq",
      content: {
        question: "How many particles are in one mole?",
        options: ["6.022 × 10^23", "3.14", "12", "1000"],
        correctIndex: 0,
        explanation: "That is Avogadro's number.",
      },
      passageId: passage.id,
      quote: "6.022 × 10^23 particles",
      checkSetId: checkSet.id,
    })
    .returning();
  const [session] = await db
    .insert(schema.studySessions)
    .values({
      userId,
      testId: test.id,
      topicId: topic.id,
      mode: "flashcards",
      startedAt: new Date("2026-11-18T20:00:00Z"),
      localDate: "2026-11-18",
      plannedMinutes: 10,
    })
    .returning();
  const [check] = await db
    .insert(schema.checks)
    .values({
      userId,
      testId: test.id,
      topicId: topic.id,
      sessionId: session.id,
      checkSetId: checkSet.id,
      kind: "session",
      localDate: "2026-11-18",
    })
    .returning();
  await db.insert(schema.checkAnswers).values({ checkId: check.id, itemId: checkItem.id, userId, correct: true });
  await db.insert(schema.itemFlags).values({ userId, itemId: item.id, note: "typo" });
  await db.insert(schema.aiUsage).values({ userId, day: "2026-11-18", calls: 3 }).onConflictDoNothing();
  await db.insert(schema.aiCalls).values({ userId, task: "extract", model: "claude-sonnet-5-5", ok: true });
  await db.insert(schema.plans).values({
    testId: test.id,
    userId,
    plan: { status: "active", days: [], shortage: null },
    planHash: "abc",
    computedOn: "2026-11-18",
  });
  return {
    testId: test.id,
    fileId: file.id,
    passageId: passage.id,
    topicId: topic.id,
    itemId: item.id,
    checkSetId: checkSet.id,
    checkItemId: checkItem.id,
    sessionId: session.id,
    checkId: check.id,
  };
}

/** Every table that holds student data, for counting rows per user. */
export const OWNED_TABLES = [
  schema.tests,
  schema.files,
  schema.fileChunks,
  schema.passages,
  schema.topics,
  schema.topicPassages,
  schema.checkSets,
  schema.items,
  schema.studySessions,
  schema.checks,
  schema.checkAnswers,
  schema.itemFlags,
  schema.aiUsage,
  schema.aiCalls,
  schema.plans,
  schema.workLocks,
] as const;

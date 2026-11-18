import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/db";
import { insertStudyItems } from "@/server/data/items";
import { notTriedLately } from "@/server/data/locks";
import type { UserContext } from "@/server/session";
import { beginSession, getStudyDeck } from "@/server/study/sessions";
import { createUser, resetDb } from "../support/db";

// The test environment has no Claude key, so anything that has to be written
// by Claude fails. A topic that already has a little material must still be
// studyable with what it has.

const DAY = "2026-11-18";
let userId: string;
let testId: string;
let passageId: string;
let cardsTopic: string;
let problemsTopic: string;

function ctx(): UserContext {
  return { userId, email: "s@example.com", name: "Student", timezone: "UTC", today: DAY };
}

beforeEach(async () => {
  await resetDb();
  userId = await createUser("student");
  const db = getDb();
  const [test] = await db
    .insert(schema.tests)
    .values({ userId, className: "Chemistry", name: "Unit 4", testDate: "2026-11-25", minutesPerDay: 30 })
    .returning();
  testId = test.id;
  const [file] = await db
    .insert(schema.files)
    .values({ userId, testId, source: "teacher", name: "g.pdf", mime: "application/pdf", sizeBytes: 1, status: "ready" })
    .returning();
  const [passage] = await db
    .insert(schema.passages)
    .values({ userId, testId, fileId: file.id, page: 1, position: 0, kind: "text", text: "A mole is 6.022 × 10^23 particles." })
    .returning();
  passageId = passage.id;
  const [cards] = await db
    .insert(schema.topics)
    .values({ userId, testId, name: "The mole", type: "memorization", position: 0 })
    .returning();
  const [problems] = await db
    .insert(schema.topics)
    .values({ userId, testId, name: "Molar mass", type: "application", position: 1 })
    .returning();
  cardsTopic = cards.id;
  problemsTopic = problems.id;
  await db.insert(schema.topicPassages).values([
    { topicId: cardsTopic, passageId, userId },
    { topicId: problemsTopic, passageId, userId },
  ]);
});

afterAll(async () => {
  await closeDb();
});

const quote = "6.022 × 10^23 particles";

describe("a topic with only a little study material", () => {
  it("is studied with the few cards it has", async () => {
    await insertStudyItems(userId, testId, cardsTopic, [
      { kind: "flashcard", content: { front: "How many particles in a mole?", back: "6.022 × 10^23" }, passageId, quote },
      { kind: "flashcard", content: { front: "What does a mole count?", back: "Particles" }, passageId, quote },
    ]);
    const session = await beginSession(ctx(), testId, cardsTopic);
    const deck = await getStudyDeck(ctx(), session.id);
    expect(deck.flashcards).toHaveLength(2);
  });

  it("is studied with the one problem it has when more cannot be written", async () => {
    await insertStudyItems(userId, testId, problemsTopic, [
      {
        kind: "short",
        content: { question: "How many particles are in a mole?", answer: "6.022 × 10^23", explanation: "From the guide." },
        passageId,
        quote,
      },
    ]);
    const session = await beginSession(ctx(), testId, problemsTopic);
    const deck = await getStudyDeck(ctx(), session.id);
    expect(deck.questions).toHaveLength(1);
  });

  it("still fails when it has nothing at all and nothing can be written", async () => {
    const session = await beginSession(ctx(), testId, cardsTopic);
    await expect(getStudyDeck(ctx(), session.id)).rejects.toThrow();
  });

  it("does not try to write more again on the very next visit", async () => {
    await insertStudyItems(userId, testId, cardsTopic, [
      { kind: "flashcard", content: { front: "How many particles in a mole?", back: "6.022 × 10^23" }, passageId, quote },
    ]);
    const session = await beginSession(ctx(), testId, cardsTopic);
    await getStudyDeck(ctx(), session.id);

    const marks = await getDb().select().from(schema.workLocks).where(eq(schema.workLocks.userId, userId));
    const topUp = marks.find((m) => m.key.startsWith("top-up:"));
    expect(topUp).toBeDefined();
    expect(topUp!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  });
});

describe("notTriedLately", () => {
  it("says yes the first time and no until the wait is over", async () => {
    expect(await notTriedLately(userId, "top-up:x", 3600)).toBe(true);
    expect(await notTriedLately(userId, "top-up:x", 3600)).toBe(false);

    await getDb().execute(sql`update work_locks set expires_at = now() - interval '1 second' where key = 'top-up:x'`);
    expect(await notTriedLately(userId, "top-up:x", 3600)).toBe(true);
  });

  it("keeps each student and each job apart", async () => {
    const other = await createUser("other");
    expect(await notTriedLately(userId, "top-up:x", 3600)).toBe(true);
    expect(await notTriedLately(other, "top-up:x", 3600)).toBe(true);
    expect(await notTriedLately(userId, "top-up:y", 3600)).toBe(true);
  });
});

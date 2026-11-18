import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/db";
import { saveSessionRecord, type SessionRecord } from "@/server/data/sessions";
import { createUser, resetDb, seedStudentData, type Seeded } from "../support/db";

let owner: string;
let seeded: Seeded;

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    userId: owner,
    testId: seeded.testId,
    topicId: seeded.topicId,
    mode: "flashcards",
    startedAt: new Date("2026-11-18T20:00:00Z"),
    durationSeconds: 540,
    itemsAttempted: 12,
    itemsCorrect: 9,
    score: 0.75,
    confidence: 4,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
  owner = await createUser("owner");
  seeded = await seedStudentData(owner);
});

afterAll(async () => {
  await closeDb();
});

describe("saveSessionRecord", () => {
  it("stores every field of the record and completes the session", async () => {
    await saveSessionRecord(seeded.sessionId, record());
    const [row] = await getDb()
      .select()
      .from(schema.studySessions)
      .where(eq(schema.studySessions.id, seeded.sessionId));
    expect(row.userId).toBe(owner);
    expect(row.testId).toBe(seeded.testId);
    expect(row.topicId).toBe(seeded.topicId);
    expect(row.mode).toBe("flashcards");
    expect(row.startedAt.toISOString()).toBe("2026-11-18T20:00:00.000Z");
    expect(row.durationSeconds).toBe(540);
    expect(row.itemsAttempted).toBe(12);
    expect(row.itemsCorrect).toBe(9);
    expect(row.score).toBeCloseTo(0.75, 5);
    expect(row.confidence).toBe(4);
    expect(row.status).toBe("completed");
    expect(row.completedAt).not.toBeNull();
  });

  it("accepts a mode it has never seen, so new modes need no changes here", async () => {
    await saveSessionRecord(seeded.sessionId, record({ mode: "teach-back" }));
    const [row] = await getDb()
      .select()
      .from(schema.studySessions)
      .where(eq(schema.studySessions.id, seeded.sessionId));
    expect(row.mode).toBe("teach-back");
    expect(row.status).toBe("completed");
  });

  it.each([
    ["a score above 1", { score: 1.2 }],
    ["a negative score", { score: -0.1 }],
    ["confidence of 0", { confidence: 0 }],
    ["confidence of 6", { confidence: 6 }],
    ["a fractional confidence", { confidence: 2.5 }],
    ["more correct than attempted", { itemsAttempted: 3, itemsCorrect: 4 }],
    ["a negative duration", { durationSeconds: -5 }],
    ["an empty mode", { mode: "" }],
  ])("rejects %s", async (_label, overrides) => {
    await expect(saveSessionRecord(seeded.sessionId, record(overrides))).rejects.toThrow();
    const [row] = await getDb()
      .select()
      .from(schema.studySessions)
      .where(eq(schema.studySessions.id, seeded.sessionId));
    expect(row.status).toBe("active");
  });

  it("refuses to save into another student's session", async () => {
    const other = await createUser("other");
    await expect(saveSessionRecord(seeded.sessionId, record({ userId: other }))).rejects.toThrow();
  });
});

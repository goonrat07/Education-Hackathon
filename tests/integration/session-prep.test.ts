import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb, schema } from "@/db";
import type { ContentBlock } from "@/server/ai/client";
import type { UserContext } from "@/server/session";
import { prepareSessionAhead } from "@/server/study/content";
import { beginSession } from "@/server/study/sessions";
import { createUser, resetDb } from "../support/db";

// Claude's replies are scripted; everything else (what it is asked, in what
// order, and what is stored) is the real code against the test database.
const calls: Array<{ task: string; text: string }> = [];

const QUOTE = "add the molar masses of all the atoms in its formula";
function problems(tag: string, count: number) {
  return {
    problems: Array.from({ length: count }, (_, i) => ({
      kind: "short",
      question: `${tag} question ${i + 1}: how do you find a molar mass?`,
      options: [],
      correctOption: -1,
      answer: `${tag} answer ${i + 1}`,
      explanation: "From the guide.",
      steps: [],
      passage: "P1",
      quote: QUOTE,
    })),
  };
}

vi.mock("@/server/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/client")>()),
  runClaude: vi.fn(async (_ctx: unknown, task: string, content: ContentBlock[]) => {
    const text = content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    calls.push({ task, text });
    if (task === "generate") return text.includes("quick check") ? problems("Check", 6) : problems("Practice", 4);
    if (task === "solve") {
      // Agree with whatever was asked: answer N for question N, in the wording the generator used.
      const tag = text.includes("Check question") ? "Check" : "Practice";
      const ids = [...text.matchAll(/<question id="(q\d+)"/g)].map((m) => m[1]);
      return { solutions: ids.map((id) => ({ id, answerable: true, optionIndex: -1, answer: `${tag} answer ${id.slice(1)}` })) };
    }
    throw new Error(`No scripted answer for "${task}"`);
  }),
}));

const DAY = "2026-11-18";
let userId: string;
let testId: string;
let topicId: string;

function ctx(): UserContext {
  return { userId, email: "s@example.com", name: "Student", timezone: "UTC", today: DAY };
}

beforeEach(async () => {
  calls.length = 0;
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
    .values({
      userId,
      testId,
      fileId: file.id,
      page: 1,
      position: 0,
      kind: "text",
      text: "To find the molar mass of a compound, add the molar masses of all the atoms in its formula.",
    })
    .returning();
  const [topic] = await db
    .insert(schema.topics)
    .values({ userId, testId, name: "Molar mass", type: "application", position: 0, confidence: 3 })
    .returning();
  topicId = topic.id;
  await db.insert(schema.topicPassages).values({ topicId, passageId: passage.id, userId });
});

afterAll(async () => {
  await closeDb();
});

describe("getting a session ready ahead of time", () => {
  it("writes the practice problems before the check, and tells the check to avoid them", async () => {
    const session = await beginSession(ctx(), testId, topicId);
    await prepareSessionAhead(ctx(), session);

    const generated = calls.filter((c) => c.task === "generate");
    expect(generated).toHaveLength(2);
    expect(generated[0].text).toContain("Write practice problems");
    expect(generated[1].text).toContain("quick check");

    // The check is told what the student will already have seen in this session.
    const alreadySeen = generated[1].text.split("<already_seen>")[1] ?? "";
    for (let n = 1; n <= 4; n++) {
      expect(alreadySeen).toContain(`Practice question ${n}: how do you find a molar mass?`);
    }
    // The practice problems themselves were written with nothing to avoid.
    expect(generated[0].text).not.toContain("<already_seen>");
  });

  it("leaves the problems and an unused check stored and ready", async () => {
    const session = await beginSession(ctx(), testId, topicId);
    await prepareSessionAhead(ctx(), session);

    const items = await getDb().select().from(schema.items).where(eq(schema.items.topicId, topicId));
    expect(items.filter((i) => i.role === "study")).toHaveLength(4);
    expect(items.filter((i) => i.role === "check").length).toBeGreaterThanOrEqual(3);
    const sets = await getDb()
      .select()
      .from(schema.checkSets)
      .where(and(eq(schema.checkSets.topicId, topicId), eq(schema.checkSets.status, "ready")));
    expect(sets).toHaveLength(1);
  });

  it("does nothing a second time once everything is ready", async () => {
    const session = await beginSession(ctx(), testId, topicId);
    await prepareSessionAhead(ctx(), session);
    const before = calls.length;
    await prepareSessionAhead(ctx(), session);
    expect(calls.length).toBe(before);
  });
});

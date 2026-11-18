import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, schema } from "@/db";
import type { McqContent } from "@/lib/items";
import type { Plan } from "@/lib/plan";
import { createCheckSet } from "@/server/data/items";
import { storePlan } from "@/server/data/plans";
import type { UserContext } from "@/server/session";
import { disputeCheckAnswer, openSessionCheck, submitCheck } from "@/server/study/checks";
import { getPlanView } from "@/server/study/plans";
import { beginSession, completeSession } from "@/server/study/sessions";
import { loadTestState } from "@/server/study/state";
import { createUser, resetDb } from "../support/db";

const DAY1 = "2026-11-18";
const DAY2 = "2026-11-19";
const DAY3 = "2026-11-20";

let userId: string;
let testId: string;
let passageId: string;
let moleTopic: string; // memorization
let massTopic: string; // application

function ctx(today: string): UserContext {
  return { userId, email: "s@example.com", name: "Student", timezone: "UTC", today };
}

/** Adds a ready check set of four multiple-choice questions whose correct option is index 0. */
async function addCheckSet(topicId: string, tag: string): Promise<void> {
  await createCheckSet(
    userId,
    testId,
    topicId,
    [1, 2, 3, 4].map((n) => ({
      kind: "mcq" as const,
      content: {
        question: `${tag} question ${n}?`,
        options: ["right", "wrong a", "wrong b", "wrong c"],
        correctIndex: 0,
        explanation: "Because the notes say so.",
      } satisfies McqContent,
      passageId,
      quote: "6.022 × 10^23 particles",
    })),
  );
}

/** Opens the check and answers it with `right` correct answers; the rest wrong. */
async function takeCheck(
  today: string,
  sessionId: string,
  kind: "session" | "delayed",
  right: number,
  flagged: number[] = [],
) {
  const check = await openSessionCheck(ctx(today), sessionId, kind);
  const answers = check.questions.map((q, i) => ({
    itemId: q.id,
    response: i < right ? "0" : "1",
    flagged: flagged.includes(i),
  }));
  return submitCheck(ctx(today), check.checkId, answers);
}

async function topicLevel(topicId: string): Promise<{ level: number; levelSince: string | null }> {
  const [row] = await getDb().select().from(schema.topics).where(eq(schema.topics.id, topicId));
  return { level: row.level, levelSince: row.levelSince };
}

beforeEach(async () => {
  await resetDb();
  userId = await createUser("student");
  const db = getDb();
  const [test] = await db
    .insert(schema.tests)
    .values({
      userId,
      className: "Chemistry",
      name: "Unit 4",
      testDate: "2026-11-25",
      minutesPerDay: 30,
      planReadyAt: new Date(),
    })
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
  const [mole] = await db
    .insert(schema.topics)
    .values({ userId, testId, name: "The mole", type: "memorization", position: 0, confidence: 2 })
    .returning();
  const [mass] = await db
    .insert(schema.topics)
    .values({ userId, testId, name: "Molar mass", type: "application", position: 1, confidence: 4 })
    .returning();
  moleTopic = mole.id;
  massTopic = mass.id;
  await db.insert(schema.topicPassages).values([
    { topicId: moleTopic, passageId, userId },
    { topicId: massTopic, passageId, userId },
  ]);
});

afterAll(async () => {
  await closeDb();
});

describe("starting a session", () => {
  it("picks the mode from the topic type and starts the clock", async () => {
    const flash = await beginSession(ctx(DAY1), testId, moleTopic);
    const practice = await beginSession(ctx(DAY1), testId, massTopic);
    expect(flash.mode).toBe("flashcards");
    expect(practice.mode).toBe("practice");
    expect(flash.status).toBe("active");
    expect(flash.localDate).toBe(DAY1);
    expect(flash.delayedTopicId).toBeNull();
  });

  it("returns the session already under way instead of starting a second one", async () => {
    const first = await beginSession(ctx(DAY1), testId, moleTopic);
    const again = await beginSession(ctx(DAY1), testId, moleTopic);
    expect(again.id).toBe(first.id);
  });

  it("starts one session when the button is pressed twice at once", async () => {
    const [first, second] = await Promise.all([
      beginSession(ctx(DAY1), testId, moleTopic),
      beginSession(ctx(DAY1), testId, moleTopic),
    ]);
    expect(second.id).toBe(first.id);
    const rows = await getDb().select().from(schema.studySessions).where(eq(schema.studySessions.topicId, moleTopic));
    expect(rows).toHaveLength(1);
  });

  it("refuses a topic from another student's test", async () => {
    const other = await createUser("other");
    const stranger: UserContext = { ...ctx(DAY1), userId: other };
    await expect(beginSession(stranger, testId, moleTopic)).rejects.toThrow();
  });
});

describe("checks", () => {
  it("sends questions without their answers", async () => {
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    const check = await openSessionCheck(ctx(DAY1), session.id, "session");
    expect(check.questions).toHaveLength(4);
    for (const question of check.questions) {
      expect(Object.keys(question).sort()).toEqual(["id", "kind", "options", "passageId", "question"]);
    }
  });

  it("reopens the same check rather than using up another set", async () => {
    await addCheckSet(moleTopic, "A");
    await addCheckSet(moleTopic, "B");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    const first = await openSessionCheck(ctx(DAY1), session.id, "session");
    const second = await openSessionCheck(ctx(DAY1), session.id, "session");
    expect(second.checkId).toBe(first.checkId);
    expect(second.questions.map((q) => q.id)).toEqual(first.questions.map((q) => q.id));
  });

  it("opens one check, using one set, when two requests arrive at the same moment", async () => {
    await addCheckSet(moleTopic, "A");
    await addCheckSet(moleTopic, "B");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    const [first, second] = await Promise.all([
      openSessionCheck(ctx(DAY1), session.id, "session"),
      openSessionCheck(ctx(DAY1), session.id, "session"),
    ]);
    expect(second.checkId).toBe(first.checkId);
    const checks = await getDb().select().from(schema.checks).where(eq(schema.checks.sessionId, session.id));
    expect(checks).toHaveLength(1);
    const sets = await getDb().select().from(schema.checkSets).where(eq(schema.checkSets.topicId, moleTopic));
    expect(sets.filter((s) => s.status === "ready")).toHaveLength(1);
  });

  it("moves a topic up one level when the check is passed", async () => {
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    const result = await takeCheck(DAY1, session.id, "session", 3);
    expect(result.passed).toBe(true);
    expect(result.correct).toBe(3);
    expect(result.scored).toBe(4);
    expect(result.levelBefore).toBe(0);
    expect(result.levelAfter).toBe(1);
    expect(await topicLevel(moleTopic)).toEqual({ level: 1, levelSince: DAY1 });
  });

  it("leaves the level alone when the check is failed", async () => {
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    const result = await takeCheck(DAY1, session.id, "session", 2);
    expect(result.passed).toBe(false);
    expect(result.levelAfter).toBe(0);
    expect(await topicLevel(moleTopic)).toEqual({ level: 0, levelSince: null });
  });

  it("shows the right answers and their sources only after submitting", async () => {
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    const result = await takeCheck(DAY1, session.id, "session", 4);
    expect(result.reveals).toHaveLength(4);
    for (const reveal of result.reveals) {
      expect(reveal.answer).toBe("right");
      expect(reveal.correctIndex).toBe(0);
      expect(reveal.passageId).toBe(passageId);
      expect(reveal.correct).toBe(true);
    }
  });

  it("counts a check only once however many times it is submitted", async () => {
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    const check = await openSessionCheck(ctx(DAY1), session.id, "session");
    const answers = check.questions.map((q) => ({ itemId: q.id, response: "0", flagged: false }));
    await submitCheck(ctx(DAY1), check.checkId, answers);
    const again = await submitCheck(ctx(DAY1), check.checkId, answers);
    expect(again.levelAfter).toBe(1);
    expect(await topicLevel(moleTopic)).toEqual({ level: 1, levelSince: DAY1 });
  });

  it("leaves a question the student flagged as wrong out of the score", async () => {
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    // Three right, the fourth (wrong) one flagged: 3 of 3 scored.
    const result = await takeCheck(DAY1, session.id, "session", 3, [3]);
    expect(result.scored).toBe(3);
    expect(result.correct).toBe(3);
    expect(result.passed).toBe(true);
  });

  it("cannot be passed once flags leave fewer than three questions", async () => {
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    const result = await takeCheck(DAY1, session.id, "session", 4, [2, 3]);
    expect(result.scored).toBe(2);
    expect(result.passed).toBe(false);
    expect(await topicLevel(moleTopic)).toEqual({ level: 0, levelSince: null });
  });

  it("lets a student dispute an answer afterwards, which can turn a near miss into a pass", async () => {
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    const check = await openSessionCheck(ctx(DAY1), session.id, "session");
    // Only two right of four: failed.
    const answers = check.questions.map((q, i) => ({ itemId: q.id, response: i < 2 ? "0" : "1", flagged: false }));
    const failed = await submitCheck(ctx(DAY1), check.checkId, answers);
    expect(failed.passed).toBe(false);
    // Disputing one wrong answer leaves 2 of 3: still failed.
    const after = await disputeCheckAnswer(ctx(DAY1), check.checkId, check.questions[3].id, "answer key is wrong");
    expect(after.scored).toBe(3);
    expect(after.passed).toBe(false);
    expect(await topicLevel(moleTopic)).toEqual({ level: 0, levelSince: null });
  });

  it("never lowers a level when a passed check is disputed", async () => {
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    const check = await openSessionCheck(ctx(DAY1), session.id, "session");
    const answers = check.questions.map((q, i) => ({ itemId: q.id, response: i < 3 ? "0" : "1", flagged: false }));
    await submitCheck(ctx(DAY1), check.checkId, answers);
    await disputeCheckAnswer(ctx(DAY1), check.checkId, check.questions[0].id, null);
    await disputeCheckAnswer(ctx(DAY1), check.checkId, check.questions[1].id, null);
    expect((await topicLevel(moleTopic)).level).toBe(1);
  });
});

describe("the climb to Locked in", () => {
  it("takes a delayed check passed on a later day", async () => {
    for (const tag of ["A", "B", "C", "D", "E"]) await addCheckSet(moleTopic, tag);

    // Day 1: two sessions, both checks passed. Not started → Learning → Got it.
    const s1 = await beginSession(ctx(DAY1), testId, moleTopic);
    await takeCheck(DAY1, s1.id, "session", 4);
    await completeSession(ctx(DAY1), s1.id, { itemsAttempted: 10, itemsCorrect: 8, confidence: 3 });
    const s2 = await beginSession(ctx(DAY1), testId, moleTopic);
    expect(s2.id).not.toBe(s1.id);
    expect(s2.delayedTopicId).toBeNull(); // studied today: no delayed check yet
    const second = await takeCheck(DAY1, s2.id, "session", 4);
    expect(second.levelAfter).toBe(2);
    await completeSession(ctx(DAY1), s2.id, { itemsAttempted: 10, itemsCorrect: 10, confidence: 4 });

    // Still day 1: a third passed end-of-session check does not lock it in.
    const s3 = await beginSession(ctx(DAY1), testId, moleTopic);
    const third = await takeCheck(DAY1, s3.id, "session", 4);
    expect(third.levelAfter).toBe(2);
    await completeSession(ctx(DAY1), s3.id, { itemsAttempted: 5, itemsCorrect: 5, confidence: 4 });

    // Day 2: a session on another topic opens with a delayed check on this one.
    const s4 = await beginSession(ctx(DAY2), testId, massTopic);
    expect(s4.delayedTopicId).toBe(moleTopic);
    const delayed = await takeCheck(DAY2, s4.id, "delayed", 3);
    expect(delayed.kind).toBe("delayed");
    expect(delayed.levelBefore).toBe(2);
    expect(delayed.levelAfter).toBe(3);
    expect(await topicLevel(moleTopic)).toEqual({ level: 3, levelSince: DAY2 });
  });

  it("offers no delayed check for a topic already checked today", async () => {
    for (const tag of ["A", "B", "C"]) await addCheckSet(moleTopic, tag);
    await addCheckSet(massTopic, "M");
    const s1 = await beginSession(ctx(DAY1), testId, moleTopic);
    await takeCheck(DAY1, s1.id, "session", 4);
    await completeSession(ctx(DAY1), s1.id, { itemsAttempted: 10, itemsCorrect: 8, confidence: 3 });

    const s2 = await beginSession(ctx(DAY2), testId, massTopic);
    expect(s2.delayedTopicId).toBe(moleTopic);
    await takeCheck(DAY2, s2.id, "delayed", 4);
    await takeCheck(DAY2, s2.id, "session", 4);
    await completeSession(ctx(DAY2), s2.id, { itemsAttempted: 6, itemsCorrect: 5, confidence: 4 });

    // Same day, the mole topic's own review: its delayed check already happened today.
    const s3 = await beginSession(ctx(DAY2), testId, moleTopic);
    expect(s3.delayedTopicId).toBeNull();
  });
});

describe("finishing a session", () => {
  it("needs the end-of-session check first", async () => {
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    await expect(
      completeSession(ctx(DAY1), session.id, { itemsAttempted: 5, itemsCorrect: 5, confidence: 3 }),
    ).rejects.toThrow(/check/i);
  });

  it("saves the record, updates confidence, and reports what moved", async () => {
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    await takeCheck(DAY1, session.id, "session", 4);
    const summary = await completeSession(ctx(DAY1), session.id, {
      itemsAttempted: 12,
      itemsCorrect: 9,
      confidence: 5,
    });

    const [row] = await getDb().select().from(schema.studySessions).where(eq(schema.studySessions.id, session.id));
    expect(row.status).toBe("completed");
    expect(row.itemsAttempted).toBe(12);
    expect(row.itemsCorrect).toBe(9);
    expect(row.score).toBeCloseTo(0.75, 5);
    expect(row.confidence).toBe(5);
    expect(row.durationSeconds).toBeGreaterThanOrEqual(0);

    const [topic] = await getDb().select().from(schema.topics).where(eq(schema.topics.id, moleTopic));
    expect(topic.confidence).toBe(5);

    expect(summary.readinessBefore).toBe(0);
    expect(summary.readinessAfter).toBeCloseTo(1 / 6, 5); // one of two topics at Learning
    expect(summary.movements).toEqual([
      expect.objectContaining({ topicId: moleTopic, kind: "session", levelBefore: 0, levelAfter: 1, passed: true }),
    ]);
  });

  it("changes the plan: today's minutes are used and the topic is no longer new", async () => {
    await addCheckSet(moleTopic, "A");
    const before = await getPlanView(userId, testId, DAY1);
    expect(before!.plan.days[0].minutesAvailable).toBe(30);
    expect(before!.plan.days[0].sessions[0]).toMatchObject({ topicId: moleTopic, kind: "learn" });

    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    await takeCheck(DAY1, session.id, "session", 4);
    await completeSession(ctx(DAY1), session.id, { itemsAttempted: 10, itemsCorrect: 9, confidence: 3 });

    const after = await getPlanView(userId, testId, DAY1);
    expect(after!.plan.days[0].minutesAvailable).toBe(20);
    expect(after!.hash).not.toBe(before!.hash);
    const learnTopics = after!.plan.days.flatMap((d) => d.sessions).filter((s) => s.kind === "learn");
    expect(learnTopics.map((s) => s.topicId)).toEqual([massTopic]);
    const state = await loadTestState(userId, testId, DAY1);
    expect(state!.readiness).toBeCloseTo(1 / 6, 5);
  });
});

describe("missed days", () => {
  it("notices planned sessions that were not done and rebuilds from today", async () => {
    const first = await getPlanView(userId, testId, DAY1);
    const plannedDay1 = first!.plan.days[0].sessions.length;
    expect(plannedDay1).toBeGreaterThan(0);
    expect(first!.missed).toBeNull();

    // Nothing studied on day 1. Opening the app on day 2:
    const next = await getPlanView(userId, testId, DAY2);
    expect(next!.missed).toEqual({ sessions: plannedDay1, on: DAY2 });
    expect(next!.plan.days[0].date).toBe(DAY2);
    expect(next!.plan.days.every((d) => d.date >= DAY2)).toBe(true);
  });

  it("keeps showing the note for the rest of that day, then drops it", async () => {
    await getPlanView(userId, testId, DAY1);
    await getPlanView(userId, testId, DAY2);
    const sameDay = await getPlanView(userId, testId, DAY2);
    expect(sameDay!.missed).not.toBeNull();

    // Day 2's sessions get done, so day 3 has nothing to report.
    const day2 = sameDay!.plan.days[0].sessions;
    for (const planned of day2) {
      await addCheckSet(planned.topicId, `d2-${planned.topicId}-${planned.kind}`);
      const session = await beginSession(ctx(DAY2), testId, planned.topicId);
      await takeCheck(DAY2, session.id, "session", 4);
      await completeSession(ctx(DAY2), session.id, { itemsAttempted: 5, itemsCorrect: 5, confidence: 3 });
    }
    const day3 = await getPlanView(userId, testId, DAY3);
    expect(day3!.missed).toBeNull();
  });

  it("counts only the sessions that were skipped", async () => {
    const stored: Plan = {
      status: "active",
      shortage: null,
      days: [
        {
          date: DAY1,
          isTestDay: false,
          minutesAvailable: 30,
          minutesPlanned: 25,
          sessions: [
            { topicId: moleTopic, mode: "flashcards", minutes: 10, kind: "learn" },
            { topicId: massTopic, mode: "practice", minutes: 15, kind: "learn" },
          ],
        },
      ],
    };
    await storePlan(userId, testId, { plan: stored, planHash: "x", computedOn: DAY1, missedOn: null, missedSessions: 0 });
    await addCheckSet(moleTopic, "A");
    const session = await beginSession(ctx(DAY1), testId, moleTopic);
    await takeCheck(DAY1, session.id, "session", 4);
    await completeSession(ctx(DAY1), session.id, { itemsAttempted: 5, itemsCorrect: 5, confidence: 3 });

    const next = await getPlanView(userId, testId, DAY2);
    expect(next!.missed).toEqual({ sessions: 1, on: DAY2 });
  });
});

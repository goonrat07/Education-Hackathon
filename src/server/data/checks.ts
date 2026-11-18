import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Level } from "@/config/study";
import { getDb, schema } from "@/db";

export type Check = typeof schema.checks.$inferSelect;
export type CheckAnswer = typeof schema.checkAnswers.$inferSelect;

export async function openCheck(
  userId: string,
  input: {
    testId: string;
    topicId: string;
    sessionId: string;
    checkSetId: string;
    kind: "session" | "delayed";
    localDate: string;
  },
): Promise<Check> {
  const [row] = await getDb()
    .insert(schema.checks)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function getCheck(userId: string, checkId: string): Promise<Check | null> {
  const [row] = await getDb()
    .select()
    .from(schema.checks)
    .where(and(eq(schema.checks.id, checkId), eq(schema.checks.userId, userId)));
  return row ?? null;
}

/** The check of a given kind already opened for a session, if any. */
export async function findSessionCheck(
  userId: string,
  sessionId: string,
  kind: "session" | "delayed",
): Promise<Check | null> {
  const [row] = await getDb()
    .select()
    .from(schema.checks)
    .where(
      and(eq(schema.checks.sessionId, sessionId), eq(schema.checks.kind, kind), eq(schema.checks.userId, userId)),
    )
    .orderBy(asc(schema.checks.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listCheckAnswers(userId: string, checkId: string): Promise<CheckAnswer[]> {
  return getDb()
    .select()
    .from(schema.checkAnswers)
    .where(and(eq(schema.checkAnswers.checkId, checkId), eq(schema.checkAnswers.userId, userId)));
}

/**
 * Records a graded check. Returns false when it was already submitted, so a
 * double submit can never count twice.
 */
export async function submitCheckResult(
  userId: string,
  checkId: string,
  result: {
    answers: Array<{ itemId: string; response: string; correct: boolean; feedback: string; excluded: boolean }>;
    scored: number;
    correct: number;
    passed: boolean;
    levelBefore: Level;
    levelAfter: Level;
  },
): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .update(schema.checks)
      .set({
        status: "submitted",
        scored: result.scored,
        correct: result.correct,
        passed: result.passed,
        levelBefore: result.levelBefore,
        levelAfter: result.levelAfter,
        submittedAt: new Date(),
      })
      .where(and(eq(schema.checks.id, checkId), eq(schema.checks.userId, userId), eq(schema.checks.status, "open")))
      .returning({ id: schema.checks.id });
    if (rows.length === 0) return false;
    if (result.answers.length > 0) {
      await tx.insert(schema.checkAnswers).values(result.answers.map((a) => ({ checkId, userId, ...a })));
    }
    return true;
  });
}

/** Submitted checks for a test, oldest first. */
export async function listSubmittedChecks(userId: string, testId: string): Promise<Check[]> {
  return getDb()
    .select()
    .from(schema.checks)
    .where(
      and(eq(schema.checks.testId, testId), eq(schema.checks.userId, userId), eq(schema.checks.status, "submitted")),
    )
    .orderBy(asc(schema.checks.submittedAt), asc(schema.checks.createdAt));
}

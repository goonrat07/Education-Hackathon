import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** The student has used up today's AI calls. */
export class AiLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Daily AI limit of ${limit} calls reached`);
    this.name = "AiLimitError";
  }
}

/** All students together have used up the app's AI calls for the day. */
export class AiCeilingError extends Error {
  constructor(public readonly limit: number) {
    super(`Daily AI ceiling of ${limit} calls for all students reached`);
    this.name = "AiCeilingError";
  }
}

/**
 * Counts one AI call against the student's day, atomically. Throws
 * AiLimitError, without counting, when the day is already at the limit.
 *
 * With `total`, the call is also counted against the ceiling for all students
 * together; when that is reached it throws AiCeilingError and the student's
 * own count is left as it was.
 * @returns the number of calls the student has used today, including this one
 */
export async function reserveAiCall(
  userId: string,
  day: string,
  limit: number,
  total?: { day: string; limit: number },
): Promise<number> {
  if (limit <= 0) throw new AiLimitError(limit);
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .insert(schema.aiUsage)
      .values({ userId, day, calls: 1 })
      .onConflictDoUpdate({
        target: [schema.aiUsage.userId, schema.aiUsage.day],
        set: { calls: sql`${schema.aiUsage.calls} + 1` },
        setWhere: sql`${schema.aiUsage.calls} < ${limit}`,
      })
      .returning({ calls: schema.aiUsage.calls });
    if (rows.length === 0) throw new AiLimitError(limit);

    if (total) {
      if (total.limit <= 0) throw new AiCeilingError(total.limit);
      const all = await tx
        .insert(schema.aiUsageTotal)
        .values({ day: total.day, calls: 1 })
        .onConflictDoUpdate({
          target: schema.aiUsageTotal.day,
          set: { calls: sql`${schema.aiUsageTotal.calls} + 1` },
          setWhere: sql`${schema.aiUsageTotal.calls} < ${total.limit}`,
        })
        .returning({ calls: schema.aiUsageTotal.calls });
      // Throwing rolls the student's own count back as well.
      if (all.length === 0) throw new AiCeilingError(total.limit);
    }
    return rows[0].calls;
  });
}

/** Calls made by all students together on a day. A count only: no student's data is read. */
export async function getAiUsageTotal(day: string): Promise<number> {
  const [row] = await getDb()
    .select({ calls: schema.aiUsageTotal.calls })
    .from(schema.aiUsageTotal)
    .where(eq(schema.aiUsageTotal.day, day));
  return row?.calls ?? 0;
}

/**
 * Whether a student still has enough calls left today for work done ahead of
 * time (writing the next check in the background). The last `reserve` calls
 * are kept for what the student is doing right now: answering and grading.
 */
export async function hasBackgroundHeadroom(
  userId: string,
  day: string,
  budget: { limit: number; reserve: number },
): Promise<boolean> {
  return (await getAiUsage(userId, day)) + budget.reserve <= budget.limit;
}

export async function getAiUsage(userId: string, day: string): Promise<number> {
  const [row] = await getDb()
    .select({ calls: schema.aiUsage.calls })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.userId, userId), eq(schema.aiUsage.day, day)));
  return row?.calls ?? 0;
}

export async function logAiCall(
  userId: string,
  entry: {
    task: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    ok: boolean;
    error?: string;
  },
): Promise<void> {
  await getDb()
    .insert(schema.aiCalls)
    .values({ userId, ...entry });
}

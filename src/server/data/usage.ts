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

/**
 * Counts one AI call against the student's day, atomically. Throws
 * AiLimitError, without counting, when the day is already at the limit.
 * @returns the number of calls used today, including this one
 */
export async function reserveAiCall(userId: string, day: string, limit: number): Promise<number> {
  if (limit <= 0) throw new AiLimitError(limit);
  const rows = await getDb()
    .insert(schema.aiUsage)
    .values({ userId, day, calls: 1 })
    .onConflictDoUpdate({
      target: [schema.aiUsage.userId, schema.aiUsage.day],
      set: { calls: sql`${schema.aiUsage.calls} + 1` },
      setWhere: sql`${schema.aiUsage.calls} < ${limit}`,
    })
    .returning({ calls: schema.aiUsage.calls });
  if (rows.length === 0) throw new AiLimitError(limit);
  return rows[0].calls;
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

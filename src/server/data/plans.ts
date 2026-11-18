import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Plan } from "@/lib/plan";

export type StoredPlan = typeof schema.plans.$inferSelect;

export async function getStoredPlan(userId: string, testId: string): Promise<StoredPlan | null> {
  const [row] = await getDb()
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.testId, testId), eq(schema.plans.userId, userId)));
  return row ?? null;
}

/** Saves the plan just shown to the student. The explanation is kept until its plan changes. */
export async function storePlan(
  userId: string,
  testId: string,
  snapshot: { plan: Plan; planHash: string; computedOn: string; missedOn: string | null; missedSessions: number },
): Promise<void> {
  await getDb()
    .insert(schema.plans)
    .values({ testId, userId, ...snapshot })
    .onConflictDoUpdate({
      target: schema.plans.testId,
      set: snapshot,
      setWhere: eq(schema.plans.userId, userId),
    });
}

export async function storeExplanation(
  userId: string,
  testId: string,
  planHash: string,
  explanation: string,
): Promise<void> {
  await getDb()
    .update(schema.plans)
    .set({ explanation, explanationHash: planHash })
    .where(and(eq(schema.plans.testId, testId), eq(schema.plans.userId, userId)));
}

import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type Test = typeof schema.tests.$inferSelect;

export interface TestInput {
  className: string;
  name: string;
  testDate: string;
  minutesPerDay: number;
}

export async function createTest(userId: string, input: TestInput): Promise<Test> {
  const [row] = await getDb()
    .insert(schema.tests)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function listTests(userId: string): Promise<Test[]> {
  return getDb()
    .select()
    .from(schema.tests)
    .where(eq(schema.tests.userId, userId))
    .orderBy(asc(schema.tests.testDate), asc(schema.tests.createdAt));
}

export async function getTest(userId: string, testId: string): Promise<Test | null> {
  const [row] = await getDb()
    .select()
    .from(schema.tests)
    .where(and(eq(schema.tests.id, testId), eq(schema.tests.userId, userId)));
  return row ?? null;
}

export async function updateTest(
  userId: string,
  testId: string,
  patch: Partial<TestInput> & { topicsGeneratedAt?: Date; planReadyAt?: Date },
): Promise<Test | null> {
  const [row] = await getDb()
    .update(schema.tests)
    .set(patch)
    .where(and(eq(schema.tests.id, testId), eq(schema.tests.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteTest(userId: string, testId: string): Promise<boolean> {
  const rows = await getDb()
    .delete(schema.tests)
    .where(and(eq(schema.tests.id, testId), eq(schema.tests.userId, userId)))
    .returning({ id: schema.tests.id });
  return rows.length > 0;
}

import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Deletes an account and everything it owns. Every table references the user
 * row with ON DELETE CASCADE, so removing that row removes the tests, files,
 * passages, topics, cards, questions, sessions, checks, plans, usage counts,
 * sign-in sessions and linked sign-in accounts in one statement.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await getDb().delete(schema.user).where(eq(schema.user.id, userId));
}

import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { promptText, type ItemKind } from "@/lib/items";

export type Item = typeof schema.items.$inferSelect;

export interface NewItem {
  kind: ItemKind;
  content: unknown;
  passageId: string;
  quote: string;
}

export async function insertStudyItems(
  userId: string,
  testId: string,
  topicId: string,
  rows: NewItem[],
): Promise<Item[]> {
  if (rows.length === 0) return [];
  return getDb()
    .insert(schema.items)
    .values(rows.map((r) => ({ userId, testId, topicId, role: "study" as const, ...r })))
    .returning();
}

/** Active study items for a topic, oldest first. */
export async function listStudyItems(userId: string, topicId: string, kinds?: ItemKind[]): Promise<Item[]> {
  const conditions = [
    eq(schema.items.topicId, topicId),
    eq(schema.items.userId, userId),
    eq(schema.items.role, "study"),
    eq(schema.items.status, "active"),
  ];
  if (kinds && kinds.length > 0) conditions.push(inArray(schema.items.kind, kinds));
  return getDb()
    .select()
    .from(schema.items)
    .where(and(...conditions))
    .orderBy(asc(schema.items.createdAt), asc(schema.items.id));
}

export async function getItem(userId: string, itemId: string): Promise<Item | null> {
  const [row] = await getDb()
    .select()
    .from(schema.items)
    .where(and(eq(schema.items.id, itemId), eq(schema.items.userId, userId)));
  return row ?? null;
}

/** Remembers how the student did on an item, so missed ones can come back sooner. */
export async function recordItemResult(userId: string, itemId: string, correct: boolean): Promise<boolean> {
  const rows = await getDb()
    .update(schema.items)
    .set({
      timesSeen: sql`${schema.items.timesSeen} + 1`,
      timesCorrect: sql`${schema.items.timesCorrect} + ${correct ? 1 : 0}`,
      lastResult: correct ? "correct" : "missed",
      lastSeenAt: new Date(),
    })
    .where(and(eq(schema.items.id, itemId), eq(schema.items.userId, userId)))
    .returning({ id: schema.items.id });
  return rows.length > 0;
}

/** "This is wrong": retires the item and keeps the student's note. */
export async function flagItem(userId: string, itemId: string, note: string | null): Promise<boolean> {
  const rows = await getDb()
    .update(schema.items)
    .set({ status: "flagged" })
    .where(and(eq(schema.items.id, itemId), eq(schema.items.userId, userId)))
    .returning({ id: schema.items.id });
  if (rows.length === 0) return false;
  await getDb().insert(schema.itemFlags).values({ userId, itemId, note });
  return true;
}

/** Stores a verified set of check questions the student has not seen yet. */
export async function createCheckSet(
  userId: string,
  testId: string,
  topicId: string,
  rows: NewItem[],
): Promise<string> {
  return getDb().transaction(async (tx) => {
    const [set] = await tx.insert(schema.checkSets).values({ userId, testId, topicId }).returning();
    await tx
      .insert(schema.items)
      .values(rows.map((r) => ({ userId, testId, topicId, role: "check" as const, checkSetId: set.id, ...r })));
    return set.id;
  });
}

export async function listCheckSetItems(userId: string, checkSetId: string): Promise<Item[]> {
  return getDb()
    .select()
    .from(schema.items)
    .where(and(eq(schema.items.checkSetId, checkSetId), eq(schema.items.userId, userId)))
    .orderBy(asc(schema.items.createdAt), asc(schema.items.id));
}

/** The oldest unused check set for a topic, or null. */
export async function findReadyCheckSet(userId: string, topicId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: schema.checkSets.id })
    .from(schema.checkSets)
    .where(
      and(
        eq(schema.checkSets.topicId, topicId),
        eq(schema.checkSets.userId, userId),
        eq(schema.checkSets.status, "ready"),
      ),
    )
    .orderBy(asc(schema.checkSets.createdAt), asc(schema.checkSets.id))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Claims a ready check set so no other check can use it. Returns false when
 * it was already taken (two requests racing for the same set).
 */
export async function claimCheckSet(userId: string, checkSetId: string): Promise<boolean> {
  const rows = await getDb()
    .update(schema.checkSets)
    .set({ status: "used" })
    .where(
      and(
        eq(schema.checkSets.id, checkSetId),
        eq(schema.checkSets.userId, userId),
        eq(schema.checkSets.status, "ready"),
      ),
    )
    .returning({ id: schema.checkSets.id });
  return rows.length > 0;
}

/** Every prompt ever written for a topic, so new questions can avoid repeating them. */
export async function listPromptTexts(userId: string, topicId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ kind: schema.items.kind, content: schema.items.content })
    .from(schema.items)
    .where(and(eq(schema.items.topicId, topicId), eq(schema.items.userId, userId)));
  return rows.map((r) => promptText(r.kind, r.content));
}

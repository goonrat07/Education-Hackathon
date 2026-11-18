import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Level, TopicType } from "@/config/study";
import { getDb, schema } from "@/db";
import { ownedPassageIds } from "./passages";
import { getTest } from "./tests";

export type Topic = typeof schema.topics.$inferSelect;

export interface TopicWithPassages extends Topic {
  passageIds: string[];
}

export interface TopicInput {
  name: string;
  summary: string;
  type: TopicType;
}

export async function listTopics(userId: string, testId: string): Promise<TopicWithPassages[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.topics)
    .where(and(eq(schema.topics.testId, testId), eq(schema.topics.userId, userId)))
    .orderBy(asc(schema.topics.position), asc(schema.topics.createdAt));
  if (rows.length === 0) return [];
  const links = await db
    .select({ topicId: schema.topicPassages.topicId, passageId: schema.topicPassages.passageId })
    .from(schema.topicPassages)
    .innerJoin(schema.passages, eq(schema.passages.id, schema.topicPassages.passageId))
    .innerJoin(schema.files, eq(schema.files.id, schema.passages.fileId))
    .where(
      and(
        eq(schema.topicPassages.userId, userId),
        inArray(
          schema.topicPassages.topicId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .orderBy(asc(schema.files.createdAt), asc(schema.files.id), asc(schema.passages.position));
  const byTopic = new Map<string, string[]>();
  for (const link of links) {
    const list = byTopic.get(link.topicId) ?? [];
    list.push(link.passageId);
    byTopic.set(link.topicId, list);
  }
  return rows.map((r) => ({ ...r, passageIds: byTopic.get(r.id) ?? [] }));
}

export async function getTopic(userId: string, topicId: string): Promise<Topic | null> {
  const [row] = await getDb()
    .select()
    .from(schema.topics)
    .where(and(eq(schema.topics.id, topicId), eq(schema.topics.userId, userId)));
  return row ?? null;
}

async function nextPosition(userId: string, testId: string): Promise<number> {
  const [row] = await getDb()
    .select({ max: sql<number | null>`max(${schema.topics.position})` })
    .from(schema.topics)
    .where(and(eq(schema.topics.testId, testId), eq(schema.topics.userId, userId)));
  return (row?.max ?? -1) + 1;
}

/**
 * Adds a topic to a test. Only passages that belong to this user's test are
 * linked; any other ids are ignored. Null when the test is not the caller's.
 */
export async function createTopic(
  userId: string,
  testId: string,
  input: TopicInput,
  passageIds: string[],
  origin: "ai" | "student" = "student",
): Promise<Topic | null> {
  if (!(await getTest(userId, testId))) return null;
  const owned = await ownedPassageIds(userId, testId, passageIds);
  const position = await nextPosition(userId, testId);
  return getDb().transaction(async (tx) => {
    const [topic] = await tx
      .insert(schema.topics)
      .values({ userId, testId, ...input, position, origin })
      .returning();
    if (owned.length > 0) {
      await tx
        .insert(schema.topicPassages)
        .values(owned.map((passageId) => ({ topicId: topic.id, passageId, userId })));
    }
    return topic;
  });
}

/** Replaces the topics the app found (student-added topics are kept, after them). */
export async function replaceAiTopics(
  userId: string,
  testId: string,
  found: Array<TopicInput & { passageIds: string[] }>,
): Promise<void> {
  if (!(await getTest(userId, testId))) return;
  const db = getDb();
  await db
    .delete(schema.topics)
    .where(and(eq(schema.topics.testId, testId), eq(schema.topics.userId, userId), eq(schema.topics.origin, "ai")));
  for (const topic of found) {
    const { passageIds, ...input } = topic;
    await createTopic(userId, testId, input, passageIds, "ai");
  }
}

export async function updateTopic(
  userId: string,
  topicId: string,
  patch: Partial<TopicInput> & { confidence?: number },
): Promise<Topic | null> {
  const [row] = await getDb()
    .update(schema.topics)
    .set(patch)
    .where(and(eq(schema.topics.id, topicId), eq(schema.topics.userId, userId)))
    .returning();
  return row ?? null;
}

/** Records a level change. Only the check flow calls this. */
export async function setTopicLevel(userId: string, topicId: string, level: Level, since: string): Promise<void> {
  await getDb()
    .update(schema.topics)
    .set({ level, levelSince: since })
    .where(and(eq(schema.topics.id, topicId), eq(schema.topics.userId, userId)));
}

export async function deleteTopic(userId: string, topicId: string): Promise<boolean> {
  const rows = await getDb()
    .delete(schema.topics)
    .where(and(eq(schema.topics.id, topicId), eq(schema.topics.userId, userId)))
    .returning({ id: schema.topics.id });
  return rows.length > 0;
}

/**
 * Folds `sourceId` into `targetId`: the target keeps its name and gains the
 * source's passages, cards, questions and history. The merged topic takes the
 * lower level and lower confidence of the two, so merging can never raise a level.
 */
export async function mergeTopics(userId: string, sourceId: string, targetId: string): Promise<boolean> {
  if (sourceId === targetId) return false;
  const [source, target] = await Promise.all([getTopic(userId, sourceId), getTopic(userId, targetId)]);
  if (!source || !target || source.testId !== target.testId) return false;

  await getDb().transaction(async (tx) => {
    const links = await tx
      .select({ passageId: schema.topicPassages.passageId })
      .from(schema.topicPassages)
      .where(and(eq(schema.topicPassages.topicId, sourceId), eq(schema.topicPassages.userId, userId)));
    if (links.length > 0) {
      await tx
        .insert(schema.topicPassages)
        .values(links.map((l) => ({ topicId: targetId, passageId: l.passageId, userId })))
        .onConflictDoNothing();
    }
    await tx
      .update(schema.items)
      .set({ topicId: targetId })
      .where(and(eq(schema.items.topicId, sourceId), eq(schema.items.userId, userId)));
    await tx
      .update(schema.checkSets)
      .set({ topicId: targetId })
      .where(and(eq(schema.checkSets.topicId, sourceId), eq(schema.checkSets.userId, userId)));
    await tx
      .update(schema.studySessions)
      .set({ topicId: targetId })
      .where(and(eq(schema.studySessions.topicId, sourceId), eq(schema.studySessions.userId, userId)));
    await tx
      .update(schema.checks)
      .set({ topicId: targetId })
      .where(and(eq(schema.checks.topicId, sourceId), eq(schema.checks.userId, userId)));
    await tx
      .update(schema.studySessions)
      .set({ delayedTopicId: targetId })
      .where(and(eq(schema.studySessions.delayedTopicId, sourceId), eq(schema.studySessions.userId, userId)));

    const lower = source.level < target.level ? source : target;
    const confidences = [source.confidence, target.confidence].filter((c): c is number => c !== null);
    await tx
      .update(schema.topics)
      .set({
        level: lower.level,
        levelSince: lower.levelSince,
        confidence: confidences.length > 0 ? Math.min(...confidences) : null,
        summary: target.summary || source.summary,
      })
      .where(and(eq(schema.topics.id, targetId), eq(schema.topics.userId, userId)));
    await tx.delete(schema.topics).where(and(eq(schema.topics.id, sourceId), eq(schema.topics.userId, userId)));
  });
  return true;
}

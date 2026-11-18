import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { NotFoundError } from "@/server/errors";

export type StudySession = typeof schema.studySessions.$inferSelect;

/**
 * The record every study session saves, whatever the mode. A new mode needs
 * nothing more than studying one topic and saving this.
 */
export interface SessionRecord {
  userId: string;
  testId: string;
  topicId: string;
  mode: string;
  startedAt: Date;
  durationSeconds: number;
  itemsAttempted: number;
  itemsCorrect: number;
  /** 0 to 1. */
  score: number;
  /** 1 to 5. */
  confidence: number;
}

const recordSchema = z
  .object({
    userId: z.string().min(1),
    testId: z.string().min(1),
    topicId: z.string().min(1),
    mode: z.string().min(1).max(40),
    startedAt: z.date(),
    durationSeconds: z.number().int().min(0).max(86_400),
    itemsAttempted: z.number().int().min(0),
    itemsCorrect: z.number().int().min(0),
    score: z.number().min(0).max(1),
    confidence: z.number().int().min(1).max(5),
  })
  .refine((r) => r.itemsCorrect <= r.itemsAttempted, {
    message: "itemsCorrect cannot exceed itemsAttempted",
  });

export async function startSession(
  userId: string,
  input: {
    testId: string;
    topicId: string;
    mode: string;
    startedAt: Date;
    localDate: string;
    plannedMinutes: number;
    readinessBefore: number;
    delayedTopicId: string | null;
  },
): Promise<StudySession> {
  const [row] = await getDb()
    .insert(schema.studySessions)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function getSession(userId: string, sessionId: string): Promise<StudySession | null> {
  const [row] = await getDb()
    .select()
    .from(schema.studySessions)
    .where(and(eq(schema.studySessions.id, sessionId), eq(schema.studySessions.userId, userId)));
  return row ?? null;
}

/**
 * Saves the session record and marks the session complete. Throws when the
 * record is invalid or the session is not this user's session on this topic.
 */
export async function saveSessionRecord(sessionId: string, record: SessionRecord): Promise<void> {
  const r = recordSchema.parse(record);
  const rows = await getDb()
    .update(schema.studySessions)
    .set({
      mode: r.mode,
      startedAt: r.startedAt,
      durationSeconds: r.durationSeconds,
      itemsAttempted: r.itemsAttempted,
      itemsCorrect: r.itemsCorrect,
      score: r.score,
      confidence: r.confidence,
      status: "completed",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.studySessions.id, sessionId),
        eq(schema.studySessions.userId, r.userId),
        eq(schema.studySessions.testId, r.testId),
        eq(schema.studySessions.topicId, r.topicId),
      ),
    )
    .returning({ id: schema.studySessions.id });
  if (rows.length === 0) throw new NotFoundError("Session not found");
}

/**
 * Stores what the study step reported when it ended, so the counts survive a
 * closed tab. Returns false when the session is not this user's or is already finished.
 */
export async function recordStudied(
  userId: string,
  sessionId: string,
  counts: { itemsAttempted: number; itemsCorrect: number },
): Promise<boolean> {
  const rows = await getDb()
    .update(schema.studySessions)
    .set({ itemsAttempted: counts.itemsAttempted, itemsCorrect: counts.itemsCorrect, studiedAt: new Date() })
    .where(
      and(
        eq(schema.studySessions.id, sessionId),
        eq(schema.studySessions.userId, userId),
        eq(schema.studySessions.status, "active"),
      ),
    )
    .returning({ id: schema.studySessions.id });
  return rows.length > 0;
}

/** Notes that this session's end check could not be written or graded, so it may be finished without one. */
export async function markCheckUnavailable(userId: string, sessionId: string): Promise<void> {
  await getDb()
    .update(schema.studySessions)
    .set({ checkUnavailable: true })
    .where(and(eq(schema.studySessions.id, sessionId), eq(schema.studySessions.userId, userId)));
}

export async function listCompletedSessions(userId: string, testId: string): Promise<StudySession[]> {
  return getDb()
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.testId, testId),
        eq(schema.studySessions.userId, userId),
        eq(schema.studySessions.status, "completed"),
      ),
    )
    .orderBy(asc(schema.studySessions.startedAt));
}

/** A session on this topic that was started today and not finished, if there is one. */
export async function findActiveSession(
  userId: string,
  topicId: string,
  localDate: string,
): Promise<StudySession | null> {
  const [row] = await getDb()
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.topicId, topicId),
        eq(schema.studySessions.userId, userId),
        eq(schema.studySessions.localDate, localDate),
        eq(schema.studySessions.status, "active"),
      ),
    )
    .orderBy(asc(schema.studySessions.startedAt))
    .limit(1);
  return row ?? null;
}

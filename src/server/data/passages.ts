import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type Passage = typeof schema.passages.$inferSelect;
export type PassageKind = Passage["kind"];

export interface PassageWithFile extends Passage {
  fileName: string;
  fileSource: "teacher" | "notes";
  fileMime: string;
}

const withFile = {
  id: schema.passages.id,
  userId: schema.passages.userId,
  testId: schema.passages.testId,
  fileId: schema.passages.fileId,
  page: schema.passages.page,
  position: schema.passages.position,
  kind: schema.passages.kind,
  text: schema.passages.text,
  fileName: schema.files.name,
  fileSource: schema.files.source,
  fileMime: schema.files.mime,
};

/** Replaces everything read from one file with a fresh set of passages. */
export async function replacePassages(
  userId: string,
  testId: string,
  fileId: string,
  rows: Array<{ page: number; position: number; kind: PassageKind; text: string }>,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx
      .delete(schema.passages)
      .where(and(eq(schema.passages.fileId, fileId), eq(schema.passages.userId, userId)));
    if (rows.length > 0) {
      await tx.insert(schema.passages).values(rows.map((r) => ({ userId, testId, fileId, ...r })));
    }
  });
}

/** Every passage for a test, in reading order (file by file). */
export async function listPassages(userId: string, testId: string): Promise<PassageWithFile[]> {
  return getDb()
    .select(withFile)
    .from(schema.passages)
    .innerJoin(schema.files, eq(schema.files.id, schema.passages.fileId))
    .where(and(eq(schema.passages.testId, testId), eq(schema.passages.userId, userId)))
    .orderBy(asc(schema.files.createdAt), asc(schema.files.id), asc(schema.passages.position));
}

export async function getPassage(userId: string, passageId: string): Promise<PassageWithFile | null> {
  const [row] = await getDb()
    .select(withFile)
    .from(schema.passages)
    .innerJoin(schema.files, eq(schema.files.id, schema.passages.fileId))
    .where(and(eq(schema.passages.id, passageId), eq(schema.passages.userId, userId)));
  return row ?? null;
}

/** The passages on one page of a file, in reading order. */
export async function listPagePassages(userId: string, fileId: string, page: number): Promise<Passage[]> {
  return getDb()
    .select()
    .from(schema.passages)
    .where(
      and(eq(schema.passages.fileId, fileId), eq(schema.passages.page, page), eq(schema.passages.userId, userId)),
    )
    .orderBy(asc(schema.passages.position));
}

export async function listTopicPassages(userId: string, topicId: string): Promise<PassageWithFile[]> {
  return getDb()
    .select(withFile)
    .from(schema.topicPassages)
    .innerJoin(schema.passages, eq(schema.passages.id, schema.topicPassages.passageId))
    .innerJoin(schema.files, eq(schema.files.id, schema.passages.fileId))
    .where(and(eq(schema.topicPassages.topicId, topicId), eq(schema.topicPassages.userId, userId)))
    .orderBy(asc(schema.files.createdAt), asc(schema.files.id), asc(schema.passages.position));
}

/** Of the given ids, the ones that are passages of this test owned by this user. */
export async function ownedPassageIds(userId: string, testId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await getDb()
    .select({ id: schema.passages.id })
    .from(schema.passages)
    .where(
      and(eq(schema.passages.userId, userId), eq(schema.passages.testId, testId), inArray(schema.passages.id, ids)),
    );
  return rows.map((r) => r.id);
}

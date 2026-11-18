import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getTest } from "./tests";

export type StoredFile = typeof schema.files.$inferSelect;
export type FileSource = StoredFile["source"];
export type FileStatus = StoredFile["status"];

/**
 * Uploaded files live in Postgres as ordered chunks. Keeping the bytes beside
 * the rest of a student's data means one ownership check covers them and
 * deleting the account removes them.
 */

export async function createFile(
  userId: string,
  testId: string,
  input: { name: string; mime: string; sizeBytes: number; source: FileSource },
): Promise<StoredFile | null> {
  if (!(await getTest(userId, testId))) return null;
  const [row] = await getDb()
    .insert(schema.files)
    .values({ userId, testId, ...input })
    .returning();
  return row;
}

export async function listFiles(userId: string, testId: string): Promise<StoredFile[]> {
  return getDb()
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.testId, testId), eq(schema.files.userId, userId)))
    .orderBy(asc(schema.files.createdAt), asc(schema.files.id));
}

export async function getFile(userId: string, fileId: string): Promise<StoredFile | null> {
  const [row] = await getDb()
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.id, fileId), eq(schema.files.userId, userId)));
  return row ?? null;
}

/** Stores one chunk of an upload. Returns false when the file is not the caller's. */
export async function putChunk(userId: string, fileId: string, idx: number, data: Buffer): Promise<boolean> {
  if (!(await getFile(userId, fileId))) return false;
  await getDb()
    .insert(schema.fileChunks)
    .values({ fileId, userId, idx, data })
    .onConflictDoUpdate({ target: [schema.fileChunks.fileId, schema.fileChunks.idx], set: { data } });
  return true;
}

/** Total bytes stored so far for a file. */
export async function storedSize(userId: string, fileId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(octet_length(${schema.fileChunks.data})), 0)::int` })
    .from(schema.fileChunks)
    .where(and(eq(schema.fileChunks.fileId, fileId), eq(schema.fileChunks.userId, userId)));
  return row?.total ?? 0;
}

/** The whole file, or null when it does not exist or is not the caller's. */
export async function getFileBytes(userId: string, fileId: string): Promise<Buffer | null> {
  if (!(await getFile(userId, fileId))) return null;
  const chunks = await getDb()
    .select({ data: schema.fileChunks.data })
    .from(schema.fileChunks)
    .where(and(eq(schema.fileChunks.fileId, fileId), eq(schema.fileChunks.userId, userId)))
    .orderBy(asc(schema.fileChunks.idx));
  return Buffer.concat(chunks.map((c) => c.data));
}

export async function updateFile(
  userId: string,
  fileId: string,
  patch: Partial<Pick<StoredFile, "status" | "error" | "pageCount" | "source">>,
): Promise<StoredFile | null> {
  const [row] = await getDb()
    .update(schema.files)
    .set(patch)
    .where(and(eq(schema.files.id, fileId), eq(schema.files.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteFile(userId: string, fileId: string): Promise<boolean> {
  const rows = await getDb()
    .delete(schema.files)
    .where(and(eq(schema.files.id, fileId), eq(schema.files.userId, userId)))
    .returning({ id: schema.files.id });
  return rows.length > 0;
}

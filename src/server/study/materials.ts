import "server-only";
import { expectedChunkBytes, MAX_PAGES_PER_TEST, MAX_PDF_PAGES, PDF_TYPE } from "@/config/uploads";
import { countPdfPages, extractFile } from "@/server/ai/extract";
import {
  getFile,
  getFileBytes,
  listFiles,
  putChunk,
  updateFile,
  type StoredFile,
} from "@/server/data/files";
import { onlyOnce } from "@/server/data/locks";
import { replacePassages } from "@/server/data/passages";
import { describeError } from "@/server/error-messages";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import type { UserContext } from "@/server/session";

/**
 * Stores one piece of an upload. A piece is accepted only when it is exactly
 * the size the file's declared length calls for, so a file can never take up
 * more room than it said it would (the storage limits count declared sizes).
 */
export async function storeUploadChunk(user: UserContext, fileId: string, idx: number, data: Buffer): Promise<void> {
  const file = await getFile(user.userId, fileId);
  if (!file) throw new NotFoundError("File not found");
  if (file.status !== "uploading") throw new InvalidRequestError("This file has already been uploaded.");
  const expected = expectedChunkBytes(file.sizeBytes, idx);
  if (expected === null) throw new InvalidRequestError("Unexpected piece.");
  if (data.length !== expected) throw new InvalidRequestError("Unexpected piece size.");
  await putChunk(user.userId, fileId, idx, data);
}

/** Refuses a file that is too long to read, before any AI call is spent on it. */
async function checkPageLimits(userId: string, file: StoredFile, bytes: Buffer): Promise<void> {
  // A PDF that cannot be opened here is sent on as it is; its length is unknown.
  const pages = file.mime === PDF_TYPE ? await countPdfPages(bytes) : 1;
  if (pages !== null && pages > MAX_PDF_PAGES) {
    throw new InvalidRequestError(
      `This PDF has ${pages} pages. Study Coach reads PDFs of up to ${MAX_PDF_PAGES} pages. Upload just the chapter or handout your test covers.`,
    );
  }
  const others = (await listFiles(userId, file.testId))
    .filter((f) => f.id !== file.id && f.status === "ready")
    .reduce((total, f) => total + (f.pageCount ?? 1), 0);
  const total = others + (pages ?? 1);
  if (total > MAX_PAGES_PER_TEST) {
    throw new InvalidRequestError(
      `This file would bring the test to ${total} pages. A test can hold up to ${MAX_PAGES_PER_TEST} pages of material in all. Remove a file, or upload only the pages you need.`,
    );
  }
}

/**
 * Reads an uploaded file into passages. If another request is already reading
 * it, this waits for that one instead of reading (and paying for) it twice.
 * A file that cannot be read is marked failed with the reason.
 */
export async function readUploadedFile(user: UserContext, fileId: string): Promise<StoredFile> {
  const file = await getFile(user.userId, fileId);
  if (!file) throw new NotFoundError("File not found");
  if (file.status === "ready") return file;
  if (file.status === "uploading") throw new InvalidRequestError("This file is still uploading.");

  const alreadyRead = async () => {
    const current = await getFile(user.userId, fileId);
    return current?.status === "ready" ? current : null;
  };
  return onlyOnce(user.userId, `extract:${fileId}`, alreadyRead, async () => {
    const bytes = await getFileBytes(user.userId, fileId);
    if (!bytes) throw new NotFoundError("File not found");
    await updateFile(user.userId, fileId, { status: "extracting", error: null });
    try {
      await checkPageLimits(user.userId, file, bytes);
      const { pageCount, passages } = await extractFile(user, file, bytes);
      if (passages.length === 0) throw new InvalidRequestError("Nothing readable was found in this file.");
      await replacePassages(user.userId, file.testId, fileId, passages);
      const updated = await updateFile(user.userId, fileId, { status: "ready", pageCount, error: null });
      if (!updated) throw new NotFoundError("File not found");
      return updated;
    } catch (error) {
      await updateFile(user.userId, fileId, { status: "failed", error: describeError(error).message });
      throw error;
    }
  });
}

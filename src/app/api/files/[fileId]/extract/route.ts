import { extractFile } from "@/server/ai/extract";
import { getFile, getFileBytes, updateFile } from "@/server/data/files";
import { onlyOnce } from "@/server/data/locks";
import { replacePassages } from "@/server/data/passages";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import { errorResponse, handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";

// Reading a long PDF can take a couple of minutes.
export const maxDuration = 300;

/** Read an uploaded file into passages. */
export async function POST(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const fileId = id((await params).fileId);
    const file = await getFile(user.userId, fileId);
    if (!file) throw new NotFoundError();
    if (file.status === "ready") return json({ file });
    if (file.status === "uploading") throw new InvalidRequestError("This file is still uploading.");

    // If another request is already reading this file, wait for it instead of reading twice.
    const alreadyRead = async () => {
      const current = await getFile(user.userId, fileId);
      return current?.status === "ready" ? current : null;
    };
    const ready = await onlyOnce(user.userId, `extract:${fileId}`, alreadyRead, async () => {
      const bytes = await getFileBytes(user.userId, fileId);
      if (!bytes) throw new NotFoundError();
      await updateFile(user.userId, fileId, { status: "extracting", error: null });
      try {
        const { pageCount, passages } = await extractFile(user, file, bytes);
        if (passages.length === 0) throw new InvalidRequestError("Nothing readable was found in this file.");
        await replacePassages(user.userId, file.testId, fileId, passages);
        const updated = await updateFile(user.userId, fileId, { status: "ready", pageCount, error: null });
        if (!updated) throw new NotFoundError();
        return updated;
      } catch (error) {
        const { error: message } = (await errorResponse(error).json()) as { error: string };
        await updateFile(user.userId, fileId, { status: "failed", error: message });
        throw error;
      }
    });
    return json({ file: ready });
  });
}

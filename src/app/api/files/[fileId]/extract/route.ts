import { extractFile } from "@/server/ai/extract";
import { getFile, getFileBytes, updateFile } from "@/server/data/files";
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

    const bytes = await getFileBytes(user.userId, fileId);
    if (!bytes) throw new NotFoundError();
    await updateFile(user.userId, fileId, { status: "extracting", error: null });
    try {
      const { pageCount, passages } = await extractFile(user, file, bytes);
      if (passages.length === 0) {
        throw new InvalidRequestError("Nothing readable was found in this file.");
      }
      await replacePassages(user.userId, file.testId, fileId, passages);
      const ready = await updateFile(user.userId, fileId, { status: "ready", pageCount, error: null });
      return json({ file: ready, passages: passages.length });
    } catch (error) {
      const response = errorResponse(error);
      const { error: message } = (await response.clone().json()) as { error: string };
      await updateFile(user.userId, fileId, { status: "failed", error: message });
      return response;
    }
  });
}

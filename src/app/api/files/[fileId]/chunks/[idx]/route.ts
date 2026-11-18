import { UPLOAD_CHUNK_BYTES } from "@/config/uploads";
import { getFile, putChunk } from "@/server/data/files";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";

/** Store one piece of an upload. */
export async function PUT(request: Request, { params }: { params: Promise<{ fileId: string; idx: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { fileId: rawId, idx: rawIdx } = await params;
    const fileId = id(rawId);
    const idx = Number(rawIdx);
    const file = await getFile(user.userId, fileId);
    if (!file) throw new NotFoundError();
    if (file.status !== "uploading") throw new InvalidRequestError("This file has already been uploaded.");
    const maxChunks = Math.ceil(file.sizeBytes / UPLOAD_CHUNK_BYTES);
    if (!Number.isInteger(idx) || idx < 0 || idx >= maxChunks) throw new InvalidRequestError("Unexpected piece.");
    const data = Buffer.from(await request.arrayBuffer());
    if (data.length === 0 || data.length > UPLOAD_CHUNK_BYTES) throw new InvalidRequestError("Unexpected piece size.");
    await putChunk(user.userId, fileId, idx, data);
    return json({ ok: true });
  });
}

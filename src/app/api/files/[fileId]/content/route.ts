import { getFile, streamFileBytes } from "@/server/data/files";
import { NotFoundError } from "@/server/errors";
import { handle, id } from "@/server/http";
import { requireUser } from "@/server/session";

/**
 * The file itself, for the source viewer. Only its owner can fetch it.
 *
 * The browser may keep a copy but has to ask before using it, so a copy is
 * never shown after signing out or after the file is deleted. The bytes are
 * streamed, which is what lets a PDF larger than 4.5 MB through.
 */
export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const fileId = id((await params).fileId);
    const file = await getFile(user.userId, fileId);
    if (!file || file.status === "uploading") throw new NotFoundError();

    // A stored file never changes, so its id says whether the browser's copy is current.
    const etag = `"${file.id}"`;
    const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });

    return new Response(streamFileBytes(user.userId, fileId), {
      headers: {
        ...headers,
        "Content-Type": file.mime,
        "Content-Length": String(file.sizeBytes),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

import { getFile, getFileBytes } from "@/server/data/files";
import { NotFoundError } from "@/server/errors";
import { handle, id } from "@/server/http";
import { requireUser } from "@/server/session";

/** The file itself, for the source viewer. Only its owner can fetch it. */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const fileId = id((await params).fileId);
    const file = await getFile(user.userId, fileId);
    const bytes = file ? await getFileBytes(user.userId, fileId) : null;
    if (!file || !bytes) throw new NotFoundError();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": "inline",
        // The bytes never change; keep them in this browser only.
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

import { getFile, storedSize, updateFile } from "@/server/data/files";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";

/** Finish an upload once every piece has arrived. */
export async function POST(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const fileId = id((await params).fileId);
    const file = await getFile(user.userId, fileId);
    if (!file) throw new NotFoundError();
    if (file.status === "uploading") {
      if ((await storedSize(user.userId, fileId)) !== file.sizeBytes) {
        throw new InvalidRequestError("The upload is incomplete. Try that file again.");
      }
      return json({ file: await updateFile(user.userId, fileId, { status: "uploaded" }) });
    }
    return json({ file });
  });
}

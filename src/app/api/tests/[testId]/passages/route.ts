import { listPassages } from "@/server/data/passages";
import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";

/** Where each passage of a test sits (file and page), for building source links. */
export async function GET(_request: Request, { params }: { params: Promise<{ testId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const passages = await listPassages(user.userId, id((await params).testId));
    return json({
      passages: passages.map((p) => ({ id: p.id, fileId: p.fileId, fileName: p.fileName, page: p.page })),
    });
  });
}

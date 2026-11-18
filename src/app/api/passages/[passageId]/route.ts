import { getPassage, listPagePassages } from "@/server/data/passages";
import { NotFoundError } from "@/server/errors";
import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";

/** A passage with its page: what the source viewer shows. */
export async function GET(_request: Request, { params }: { params: Promise<{ passageId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const passage = await getPassage(user.userId, id((await params).passageId));
    if (!passage) throw new NotFoundError();
    const page = await listPagePassages(user.userId, passage.fileId, passage.page);
    return json({
      passage: { id: passage.id, page: passage.page, kind: passage.kind, text: passage.text },
      file: { id: passage.fileId, name: passage.fileName, source: passage.fileSource, mime: passage.fileMime },
      pagePassages: page.map((p) => ({ id: p.id, kind: p.kind, text: p.text })),
    });
  });
}

import { z } from "zod";
import { deleteFile, updateFile } from "@/server/data/files";
import { NotFoundError } from "@/server/errors";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";

type Ctx = { params: Promise<{ fileId: string }> };

/** Change whether a file is teacher material or the student's own notes. */
export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const fileId = id((await params).fileId);
    const { source } = await readBody(request, z.object({ source: z.enum(["teacher", "notes"]) }));
    const file = await updateFile(user.userId, fileId, { source });
    if (!file) throw new NotFoundError();
    return json({ file });
  });
}

/** Remove a file, its passages, and anything written from them. */
export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const fileId = id((await params).fileId);
    if (!(await deleteFile(user.userId, fileId))) throw new NotFoundError();
    return json({ ok: true });
  });
}

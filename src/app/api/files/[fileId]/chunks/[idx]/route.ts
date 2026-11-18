import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";
import { storeUploadChunk } from "@/server/study/materials";

/** Store one piece of an upload. */
export async function PUT(request: Request, { params }: { params: Promise<{ fileId: string; idx: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { fileId, idx } = await params;
    await storeUploadChunk(user, id(fileId), Number(idx), Buffer.from(await request.arrayBuffer()));
    return json({ ok: true });
  });
}

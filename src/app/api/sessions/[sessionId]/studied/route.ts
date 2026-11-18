import { z } from "zod";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { finishStudy } from "@/server/study/sessions";

const schema = z.object({
  itemsAttempted: z.number().int().min(0).max(1000),
  itemsCorrect: z.number().int().min(0).max(1000),
});

/** The study step of a session has ended: store how many items were attempted and got right. */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    await finishStudy(user, id((await params).sessionId), await readBody(request, schema));
    return json({ ok: true });
  });
}

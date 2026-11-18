import { z } from "zod";
import { deleteTopic, updateTopic } from "@/server/data/topics";
import { NotFoundError } from "@/server/errors";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { confidence, topicType } from "@/server/validation";

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    summary: z.string().trim().max(400),
    type: topicType,
    confidence,
  })
  .partial();

type Ctx = { params: Promise<{ topicId: string }> };

/** Rename a topic, change its type, or set the student's confidence in it. */
export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const topicId = id((await params).topicId);
    const topic = await updateTopic(user.userId, topicId, await readBody(request, patchSchema));
    if (!topic) throw new NotFoundError();
    return json({ topic });
  });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const topicId = id((await params).topicId);
    if (!(await deleteTopic(user.userId, topicId))) throw new NotFoundError();
    return json({ ok: true });
  });
}

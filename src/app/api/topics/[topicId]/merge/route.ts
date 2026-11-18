import { z } from "zod";
import { mergeTopics } from "@/server/data/topics";
import { NotFoundError } from "@/server/errors";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";

/** Merge this topic into another topic of the same test. */
export async function POST(request: Request, { params }: { params: Promise<{ topicId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const topicId = id((await params).topicId);
    const { intoTopicId } = await readBody(request, z.object({ intoTopicId: z.string() }));
    if (!(await mergeTopics(user.userId, topicId, id(intoTopicId)))) throw new NotFoundError();
    return json({ ok: true });
  });
}

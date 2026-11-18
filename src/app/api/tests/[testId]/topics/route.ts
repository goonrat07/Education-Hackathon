import { z } from "zod";
import { locateTopic } from "@/server/ai/topics";
import { listPassages } from "@/server/data/passages";
import { getTest } from "@/server/data/tests";
import { createTopic } from "@/server/data/topics";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";

export const maxDuration = 120;

/**
 * Add a topic by name. The topic is only added if the student's materials
 * cover it, because everything studied has to come from those materials.
 */
export async function POST(request: Request, { params }: { params: Promise<{ testId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const testId = id((await params).testId);
    const { name } = await readBody(request, z.object({ name: z.string().trim().min(2).max(80) }));
    const test = await getTest(user.userId, testId);
    if (!test) throw new NotFoundError();

    const located = await locateTopic(user, test, await listPassages(user.userId, testId), name);
    if (!located) {
      throw new InvalidRequestError(
        `Nothing in your uploaded files covers "${name}". Add the notes or handout it's in, then try again.`,
      );
    }
    const topic = await createTopic(
      user.userId,
      testId,
      { name, summary: located.summary, type: located.type },
      located.passageIds,
      "student",
    );
    if (!topic) throw new NotFoundError();
    return json({ topic: { ...topic, passageIds: located.passageIds } }, 201);
  });
}

import { after } from "next/server";
import { z } from "zod";
import { getTopic } from "@/server/data/topics";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser, type UserContext } from "@/server/session";
import { ensureCheckSet } from "@/server/study/content";
import { beginSession } from "@/server/study/sessions";

export const maxDuration = 300;

/** Writes the checks this session will need while the student gets started. */
async function prepareChecks(user: UserContext, topicIds: Array<string | null>): Promise<void> {
  for (const topicId of topicIds) {
    if (!topicId) continue;
    try {
      const topic = await getTopic(user.userId, topicId);
      if (topic) await ensureCheckSet(user, topic);
    } catch (error) {
      // Not fatal: the check is written on demand when the student reaches it.
      console.warn("Could not prepare a check ahead of time", error);
    }
  }
}

/** Start (or resume) a session on a topic. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = await readBody(request, z.object({ testId: z.string(), topicId: z.string() }));
    const session = await beginSession(user, id(input.testId), id(input.topicId));
    after(() => prepareChecks(user, [session.delayedTopicId, session.topicId]));
    return json({ sessionId: session.id }, 201);
  });
}

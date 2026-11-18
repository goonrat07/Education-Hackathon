import { after } from "next/server";
import { z } from "zod";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { prepareCheckAhead } from "@/server/study/content";
import { beginSession } from "@/server/study/sessions";

export const maxDuration = 300;

/** Start (or resume) a session on a topic. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = await readBody(request, z.object({ testId: z.string(), topicId: z.string() }));
    const session = await beginSession(user, id(input.testId), id(input.topicId));
    // Write the checks this session will need while the student gets started.
    after(async () => {
      await prepareCheckAhead(user, session.delayedTopicId);
      await prepareCheckAhead(user, session.topicId);
    });
    return json({ sessionId: session.id }, 201);
  });
}

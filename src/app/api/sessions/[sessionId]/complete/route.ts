import { after } from "next/server";
import { z } from "zod";
import { getTopic } from "@/server/data/topics";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { confidence } from "@/server/validation";
import { ensureCheckSet } from "@/server/study/content";
import { completeSession } from "@/server/study/sessions";

export const maxDuration = 300;

const schema = z.object({
  itemsAttempted: z.number().int().min(0).max(1000),
  itemsCorrect: z.number().int().min(0).max(1000),
  confidence,
});

/** Finish a session: save its record and report what moved. */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const summary = await completeSession(user, id((await params).sessionId), await readBody(request, schema));
    // Get the next check on this topic ready now, so a later session's delayed check starts instantly.
    after(async () => {
      try {
        const topic = await getTopic(user.userId, summary.topicId);
        if (topic && topic.level < 3) await ensureCheckSet(user, topic);
      } catch (error) {
        console.warn("Could not prepare the next check ahead of time", error);
      }
    });
    return json(summary);
  });
}

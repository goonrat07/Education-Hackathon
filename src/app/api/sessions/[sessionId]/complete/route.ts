import { after } from "next/server";
import { z } from "zod";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { confidence } from "@/server/validation";
import { prepareCheckAhead } from "@/server/study/content";
import { completeSession } from "@/server/study/sessions";

export const maxDuration = 300;

const schema = z.object({
  confidence,
  // Only used when the study step could not report its counts when it ended.
  itemsAttempted: z.number().int().min(0).max(1000).optional(),
  itemsCorrect: z.number().int().min(0).max(1000).optional(),
});

/** Finish a session: save its record and report what moved. */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const summary = await completeSession(user, id((await params).sessionId), await readBody(request, schema));
    // Get the next check on this topic ready now, so a later session's delayed check starts instantly.
    after(() => prepareCheckAhead(user, summary.topicId));
    return json(summary);
  });
}

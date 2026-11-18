import { z } from "zod";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { answerStudyItem } from "@/server/study/sessions";

export const maxDuration = 60;

type Ctx = { params: Promise<{ sessionId: string; itemId: string }> };

/** Grade an answer to a practice problem and reveal the solution and its source. */
export async function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { sessionId, itemId } = await params;
    const { response } = await readBody(request, z.object({ response: z.string().max(4000) }));
    return json(await answerStudyItem(user, id(sessionId), id(itemId), response));
  });
}

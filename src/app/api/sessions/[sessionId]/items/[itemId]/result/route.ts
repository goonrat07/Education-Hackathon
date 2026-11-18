import { z } from "zod";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { recordFlashcard } from "@/server/study/sessions";

type Ctx = { params: Promise<{ sessionId: string; itemId: string }> };

/** Record whether the student knew a flashcard. */
export async function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { sessionId, itemId } = await params;
    const { knewIt } = await readBody(request, z.object({ knewIt: z.boolean() }));
    await recordFlashcard(user, id(sessionId), id(itemId), knewIt);
    return json({ ok: true });
  });
}

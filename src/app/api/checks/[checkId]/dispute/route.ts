import { z } from "zod";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { disputeCheckAnswer } from "@/server/study/checks";

const schema = z.object({ itemId: z.string(), note: z.string().trim().max(500).nullish() });

/** "This is wrong" on a graded check question: it stops counting. */
export async function POST(request: Request, { params }: { params: Promise<{ checkId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { itemId, note } = await readBody(request, schema);
    return json(await disputeCheckAnswer(user, id((await params).checkId), id(itemId), note ?? null));
  });
}

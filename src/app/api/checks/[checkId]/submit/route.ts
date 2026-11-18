import { z } from "zod";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { submitCheck } from "@/server/study/checks";

export const maxDuration = 120;

const schema = z.object({
  answers: z
    .array(z.object({ itemId: z.string(), response: z.string().max(4000), flagged: z.boolean().optional() }))
    .max(10),
});

/** Grade a check and apply the level rules. */
export async function POST(request: Request, { params }: { params: Promise<{ checkId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { answers } = await readBody(request, schema);
    return json(await submitCheck(user, id((await params).checkId), answers));
  });
}

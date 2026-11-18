import { z } from "zod";
import { flagItem } from "@/server/data/items";
import { NotFoundError } from "@/server/errors";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";

const schema = z.object({ note: z.string().trim().max(500).nullish() });

/** "This is wrong" on a card or practice problem: it is retired and never shown again. */
export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { note } = await readBody(request, schema);
    if (!(await flagItem(user.userId, id((await params).itemId), note ?? null))) throw new NotFoundError();
    return json({ ok: true });
  });
}

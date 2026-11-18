import { z } from "zod";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { openSessionCheck } from "@/server/study/checks";

export const maxDuration = 300;

/** Open the delayed check at the start of a session or the check at its end. */
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { kind } = await readBody(request, z.object({ kind: z.enum(["session", "delayed"]) }));
    return json(await openSessionCheck(user, id((await params).sessionId), kind));
  });
}

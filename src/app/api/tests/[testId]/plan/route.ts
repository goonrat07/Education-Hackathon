import { z } from "zod";
import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";
import { startPlan } from "@/server/study/plans";
import { confidence } from "@/server/validation";

const schema = z.object({ confidence: z.record(z.string(), confidence).optional() });

/** Build the plan: allowed once every topic has a confidence rating. */
export async function POST(request: Request, { params }: { params: Promise<{ testId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const testId = id((await params).testId);
    // The body is optional: the ratings on screen, in case some are still being saved.
    const body = schema.parse(await request.json().catch(() => ({})));
    await startPlan(user, testId, body.confidence ?? {});
    return json({ ok: true });
  });
}

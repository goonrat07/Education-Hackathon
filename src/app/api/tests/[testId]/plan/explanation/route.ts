import { NotFoundError } from "@/server/errors";
import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";
import { ensureExplanation } from "@/server/study/plans";

export const maxDuration = 60;

/** The short explanation of the current plan, written once per version of the plan. */
export async function POST(_request: Request, { params }: { params: Promise<{ testId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const testId = id((await params).testId);
    const explanation = await ensureExplanation(user, testId);
    if (explanation === null) throw new NotFoundError();
    return json({ explanation });
  });
}

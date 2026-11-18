import { getTest, updateTest } from "@/server/data/tests";
import { listTopics } from "@/server/data/topics";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";

/** Build the plan: allowed once every topic has a confidence rating. */
export async function POST(_request: Request, { params }: { params: Promise<{ testId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const testId = id((await params).testId);
    const test = await getTest(user.userId, testId);
    if (!test) throw new NotFoundError();
    const topics = await listTopics(user.userId, testId);
    if (topics.length === 0) throw new InvalidRequestError("Add at least one topic first.");
    const unrated = topics.filter((t) => t.confidence === null).length;
    if (unrated > 0) {
      throw new InvalidRequestError(
        `Rate your confidence on ${unrated === 1 ? "the last topic" : `the remaining ${unrated} topics`} first.`,
      );
    }
    if (!test.planReadyAt) await updateTest(user.userId, testId, { planReadyAt: new Date() });
    return json({ ok: true });
  });
}

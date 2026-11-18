import { findTopics } from "@/server/ai/topics";
import { listFiles } from "@/server/data/files";
import { listPassages } from "@/server/data/passages";
import { listCompletedSessions } from "@/server/data/sessions";
import { getTest, updateTest } from "@/server/data/tests";
import { listTopics, replaceAiTopics } from "@/server/data/topics";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";

export const maxDuration = 300;

/** Work out the topics a test covers from its uploaded files. */
export async function POST(_request: Request, { params }: { params: Promise<{ testId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const testId = id((await params).testId);
    const test = await getTest(user.userId, testId);
    if (!test) throw new NotFoundError();

    const files = await listFiles(user.userId, testId);
    if (!files.some((f) => f.status === "ready")) {
      throw new InvalidRequestError("Add at least one file and wait for it to be read first.");
    }
    if ((await listCompletedSessions(user.userId, testId)).length > 0) {
      throw new InvalidRequestError(
        "You've already studied for this test, so the topic list can't be rebuilt. Add or edit topics instead.",
      );
    }
    const passages = await listPassages(user.userId, testId);
    const found = await findTopics(user, test, passages);
    if (found.length === 0) {
      throw new InvalidRequestError("No topics could be found in these files. Try adding clearer or fuller material.");
    }
    await replaceAiTopics(user.userId, testId, found);
    await updateTest(user.userId, testId, { topicsGeneratedAt: new Date() });
    return json({ topics: await listTopics(user.userId, testId) });
  });
}

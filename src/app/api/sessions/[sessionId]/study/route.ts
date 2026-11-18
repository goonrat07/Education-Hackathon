import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";
import { getStudyDeck } from "@/server/study/sessions";

// The first session on a topic writes and verifies its material.
export const maxDuration = 300;

/** The cards or problems for this session. */
export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    return json(await getStudyDeck(user, id((await params).sessionId)));
  });
}

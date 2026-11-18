import { z } from "zod";
import { deleteTest, updateTest } from "@/server/data/tests";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { testFields } from "@/server/validation";

const patchSchema = z.object(testFields).partial();

type Ctx = { params: Promise<{ testId: string }> };

/** Change a test's class, name, date or minutes per day. */
export async function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const testId = id((await params).testId);
    const patch = await readBody(request, patchSchema);
    if (patch.testDate && patch.testDate < user.today) {
      throw new InvalidRequestError("Pick a test date that hasn't passed.");
    }
    const test = await updateTest(user.userId, testId, patch);
    if (!test) throw new NotFoundError();
    return json({ test });
  });
}

/** Delete a test and everything under it. */
export async function DELETE(_request: Request, { params }: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const testId = id((await params).testId);
    if (!(await deleteTest(user.userId, testId))) throw new NotFoundError();
    return json({ ok: true });
  });
}

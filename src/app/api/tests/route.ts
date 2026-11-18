import { z } from "zod";
import { createTest } from "@/server/data/tests";
import { InvalidRequestError } from "@/server/errors";
import { handle, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";
import { testFields } from "@/server/validation";

const createSchema = z.object(testFields);

/** Add a test. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = await readBody(request, createSchema);
    if (input.testDate < user.today) throw new InvalidRequestError("Pick a test date that hasn't passed.");
    return json({ test: await createTest(user.userId, input) }, 201);
  });
}

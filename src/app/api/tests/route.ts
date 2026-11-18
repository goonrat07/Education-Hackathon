import { z } from "zod";
import { testDateProblem } from "@/lib/test-date";
import { MAX_TESTS_PER_STUDENT } from "@/config/uploads";
import { countTests, createTest } from "@/server/data/tests";
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
    const dateProblem = testDateProblem(input.testDate, user.today);
    if (dateProblem) throw new InvalidRequestError(dateProblem);
    if ((await countTests(user.userId)) >= MAX_TESTS_PER_STUDENT) {
      throw new InvalidRequestError(
        `You have ${MAX_TESTS_PER_STUDENT} tests, which is the most an account can hold. Delete an old one first.`,
      );
    }
    return json({ test: await createTest(user.userId, input) }, 201);
  });
}

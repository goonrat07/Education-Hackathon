import { z } from "zod";
import { ACCEPTED_TYPES, MAX_FILES_PER_TEST, MAX_STORED_BYTES_PER_STUDENT, maxBytesFor } from "@/config/uploads";
import { createFile, listFiles, storedBytesForUser } from "@/server/data/files";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import { handle, id, json, readBody } from "@/server/http";
import { requireUser } from "@/server/session";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  mime: z.string(),
  sizeBytes: z.number().int().positive(),
  source: z.enum(["teacher", "notes"]),
});

/** Register a file about to be uploaded. Its bytes follow in chunks. */
export async function POST(request: Request, { params }: { params: Promise<{ testId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const testId = id((await params).testId);
    const input = await readBody(request, schema);
    if (!ACCEPTED_TYPES.includes(input.mime)) {
      throw new InvalidRequestError("Upload a PDF or a photo (JPG, PNG, WebP or GIF).");
    }
    const limit = maxBytesFor(input.mime);
    if (input.sizeBytes > limit) {
      throw new InvalidRequestError(`That file is too big. The limit is ${Math.round(limit / 1024 / 1024)} MB.`);
    }
    if ((await listFiles(user.userId, testId)).length >= MAX_FILES_PER_TEST) {
      throw new InvalidRequestError(`A test can have up to ${MAX_FILES_PER_TEST} files.`);
    }
    if ((await storedBytesForUser(user.userId)) + input.sizeBytes > MAX_STORED_BYTES_PER_STUDENT) {
      throw new InvalidRequestError(
        "Your account's file storage is full. Remove files from older tests, or delete those tests, to make room.",
      );
    }
    const file = await createFile(user.userId, testId, input);
    if (!file) throw new NotFoundError();
    return json({ file }, 201);
  });
}

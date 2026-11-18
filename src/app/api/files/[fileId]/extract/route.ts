import { handle, id, json } from "@/server/http";
import { requireUser } from "@/server/session";
import { readUploadedFile } from "@/server/study/materials";

// Reading a long PDF can take a couple of minutes.
export const maxDuration = 300;

/** Read an uploaded file into passages. */
export async function POST(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    return json({ file: await readUploadedFile(user, id((await params).fileId)) });
  });
}

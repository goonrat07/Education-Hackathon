import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MAX_PAGES_PER_TEST, MAX_PDF_PAGES, UPLOAD_CHUNK_BYTES } from "@/config/uploads";
import { closeDb, getDb, schema } from "@/db";
import { storedSize } from "@/server/data/files";
import { getAiUsage } from "@/server/data/usage";
import type { UserContext } from "@/server/session";
import { readUploadedFile, storeUploadChunk } from "@/server/study/materials";
import { createUser, resetDb } from "../support/db";

const DAY = "2026-11-18";
let userId: string;
let testId: string;

function ctx(id = userId): UserContext {
  return { userId: id, email: "s@example.com", name: "Student", timezone: "UTC", today: DAY };
}

async function pdfWithPages(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

/** Registers a file and, when bytes are given, stores them as an uploaded file. */
async function addFile(input: { sizeBytes: number; bytes?: Buffer; status?: "uploading" | "uploaded" | "ready"; pageCount?: number }) {
  const [file] = await getDb()
    .insert(schema.files)
    .values({
      userId,
      testId,
      source: "teacher",
      name: "guide.pdf",
      mime: "application/pdf",
      sizeBytes: input.sizeBytes,
      status: input.status ?? "uploading",
      pageCount: input.pageCount,
    })
    .returning();
  if (input.bytes) {
    await getDb().insert(schema.fileChunks).values({ fileId: file.id, userId, idx: 0, data: input.bytes });
  }
  return file;
}

beforeEach(async () => {
  await resetDb();
  userId = await createUser("student");
  const [test] = await getDb()
    .insert(schema.tests)
    .values({ userId, className: "Chemistry", name: "Unit 4", testDate: "2026-11-25", minutesPerDay: 30 })
    .returning();
  testId = test.id;
});

afterAll(async () => {
  await closeDb();
});

describe("storing a piece of an upload", () => {
  it("stores a piece of exactly the size the file calls for", async () => {
    const file = await addFile({ sizeBytes: UPLOAD_CHUNK_BYTES + 10 });
    await storeUploadChunk(ctx(), file.id, 0, Buffer.alloc(UPLOAD_CHUNK_BYTES, 1));
    await storeUploadChunk(ctx(), file.id, 1, Buffer.alloc(10, 1));
    expect(await storedSize(userId, file.id)).toBe(UPLOAD_CHUNK_BYTES + 10);
  });

  it("refuses more bytes than the file declared", async () => {
    const file = await addFile({ sizeBytes: 1 });
    await expect(storeUploadChunk(ctx(), file.id, 0, Buffer.alloc(UPLOAD_CHUNK_BYTES, 1))).rejects.toThrow(/piece/i);
    expect(await storedSize(userId, file.id)).toBe(0);
  });

  it("refuses a piece the file does not have", async () => {
    const file = await addFile({ sizeBytes: 10 });
    await expect(storeUploadChunk(ctx(), file.id, 1, Buffer.alloc(10, 1))).rejects.toThrow(/piece/i);
  });

  it("refuses a short piece in the middle of a file", async () => {
    const file = await addFile({ sizeBytes: UPLOAD_CHUNK_BYTES * 2 });
    await expect(storeUploadChunk(ctx(), file.id, 0, Buffer.alloc(100, 1))).rejects.toThrow(/piece/i);
  });

  it("refuses a piece for a file that has finished uploading", async () => {
    const file = await addFile({ sizeBytes: 10, status: "uploaded" });
    await expect(storeUploadChunk(ctx(), file.id, 0, Buffer.alloc(10, 1))).rejects.toThrow(/already/i);
  });

  it("treats another student's file as not found", async () => {
    const file = await addFile({ sizeBytes: 10 });
    const stranger = await createUser("stranger");
    await expect(storeUploadChunk(ctx(stranger), file.id, 0, Buffer.alloc(10, 1))).rejects.toThrow(/not found/i);
    expect(await storedSize(userId, file.id)).toBe(0);
  });
});

describe("reading an uploaded PDF", () => {
  it("refuses a PDF with more pages than one file may have, before any AI call", async () => {
    const bytes = await pdfWithPages(MAX_PDF_PAGES + 1);
    const file = await addFile({ sizeBytes: bytes.length, bytes, status: "uploaded" });

    await expect(readUploadedFile(ctx(), file.id)).rejects.toThrow(new RegExp(`${MAX_PDF_PAGES} pages`));

    const [row] = await getDb().select().from(schema.files).where(eq(schema.files.id, file.id));
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(new RegExp(`${MAX_PDF_PAGES + 1} pages`));
    expect(await getAiUsage(userId, DAY)).toBe(0);
  });

  it("refuses a PDF that would take the test past its page total", async () => {
    await addFile({ sizeBytes: 5, status: "ready", pageCount: MAX_PAGES_PER_TEST - 2 });
    const bytes = await pdfWithPages(3);
    const file = await addFile({ sizeBytes: bytes.length, bytes, status: "uploaded" });

    await expect(readUploadedFile(ctx(), file.id)).rejects.toThrow(new RegExp(`${MAX_PAGES_PER_TEST} pages`));

    const [row] = await getDb().select().from(schema.files).where(eq(schema.files.id, file.id));
    expect(row.status).toBe("failed");
    expect(await getAiUsage(userId, DAY)).toBe(0);
  });

  it("lets a PDF inside both limits through to Claude", async () => {
    await addFile({ sizeBytes: 5, status: "ready", pageCount: MAX_PAGES_PER_TEST - 3 });
    const bytes = await pdfWithPages(3);
    const file = await addFile({ sizeBytes: bytes.length, bytes, status: "uploaded" });

    // The test environment has no Claude key, so getting as far as Claude shows up as this error.
    await expect(readUploadedFile(ctx(), file.id)).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("treats another student's file as not found", async () => {
    const bytes = await pdfWithPages(1);
    const file = await addFile({ sizeBytes: bytes.length, bytes, status: "uploaded" });
    const stranger = await createUser("stranger");
    await expect(readUploadedFile(ctx(stranger), file.id)).rejects.toThrow(/not found/i);
  });
});

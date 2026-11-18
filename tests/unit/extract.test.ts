import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXTRACT_PAGES_PER_CALL } from "@/config/ai";
import { runClaude } from "@/server/ai/client";
import { countPdfPages, extractFile } from "@/server/ai/extract";

// Claude's reply is scripted; splitting the file and numbering its pages is the real code.
vi.mock("@/server/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ai/client")>()),
  runClaude: vi.fn(),
}));

const ctx = { userId: "u", today: "2026-11-18" };
const pdf = { name: "guide.pdf", mime: "application/pdf", source: "teacher" as const };
/** Starts like a PDF, but has none of a PDF's structure. */
const junk = Buffer.from("%PDF-1.7\n" + "this is not really a pdf ".repeat(400));

async function pdfWithPages(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

beforeEach(() => {
  vi.mocked(runClaude).mockReset();
  vi.mocked(runClaude).mockResolvedValue({ pages: [{ page: 1, passages: [{ kind: "text", text: "Hello" }] }] });
});

describe("countPdfPages", () => {
  it("counts the pages of a PDF", async () => {
    expect(await countPdfPages(await pdfWithPages(7))).toBe(7);
  });

  it("is unknown for a file it cannot open", async () => {
    expect(await countPdfPages(junk)).toBeNull();
    expect(await countPdfPages(Buffer.from("not a pdf at all"))).toBeNull();
  });
});

describe("extractFile", () => {
  it("sends a PDF it cannot open to Claude whole, instead of failing on its own", async () => {
    const result = await extractFile(ctx, pdf, junk);
    expect(runClaude).toHaveBeenCalledTimes(1);
    expect(result.passages.map((p) => p.text)).toEqual(["Hello"]);
    expect(result.pageCount).toBe(1);
  });

  it("reads a short PDF in one call", async () => {
    const result = await extractFile(ctx, pdf, await pdfWithPages(EXTRACT_PAGES_PER_CALL));
    expect(runClaude).toHaveBeenCalledTimes(1);
    expect(result.pageCount).toBe(EXTRACT_PAGES_PER_CALL);
  });

  it("reads a long PDF in parts and numbers passages by their page in the whole file", async () => {
    const pages = EXTRACT_PAGES_PER_CALL * 2 + 2;
    const result = await extractFile(ctx, pdf, await pdfWithPages(pages));

    expect(runClaude).toHaveBeenCalledTimes(3);
    expect(result.pageCount).toBe(pages);
    // Each part answered "page 1", which is the first page of that part.
    expect(result.passages.map((p) => p.page)).toEqual([1, EXTRACT_PAGES_PER_CALL + 1, EXTRACT_PAGES_PER_CALL * 2 + 1]);
    expect(result.passages.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it("keeps a page number Claude made up inside the part it came from", async () => {
    vi.mocked(runClaude).mockResolvedValue({ pages: [{ page: 99, passages: [{ kind: "text", text: "Hello" }] }] });
    const result = await extractFile(ctx, pdf, await pdfWithPages(3));
    expect(result.passages[0].page).toBe(3);
  });

  it("treats a photo as one page", async () => {
    const result = await extractFile(ctx, { name: "notes.jpg", mime: "image/jpeg", source: "notes" }, Buffer.from("x"));
    expect(runClaude).toHaveBeenCalledTimes(1);
    expect(result.pageCount).toBe(1);
  });
});

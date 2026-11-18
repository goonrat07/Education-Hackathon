import "server-only";
import { PDFDocument } from "pdf-lib";
import { EXTRACT_CONCURRENCY, EXTRACT_PAGES_PER_CALL } from "@/config/ai";
import type { PassageKind } from "@/server/data/passages";
import { runClaude, type AiContext, type ContentBlock } from "./client";
import { EXTRACT_INSTRUCTIONS } from "./prompts";
import { extractSchema } from "./schemas";

export interface ExtractedPassage {
  /** 1-based page in the original file. */
  page: number;
  /** Reading order within the file. */
  position: number;
  kind: PassageKind;
  text: string;
}

export interface Extraction {
  pageCount: number;
  passages: ExtractedPassage[];
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const PDF_TYPE = "application/pdf";

export function isImageType(mime: string): mime is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(mime);
}

interface Part {
  /** Page in the original file that this part's page 1 corresponds to. */
  firstPage: number;
  pageCount: number;
  block: ContentBlock;
}

/** Splits a long PDF into parts so they can be read in parallel. */
async function pdfParts(bytes: Buffer): Promise<{ pageCount: number; parts: Part[] }> {
  const whole = (pageCount: number): Part[] => [
    {
      firstPage: 1,
      pageCount,
      block: {
        type: "document",
        source: { type: "base64", media_type: PDF_TYPE, data: bytes.toString("base64") },
      },
    },
  ];

  let source: PDFDocument;
  try {
    source = await PDFDocument.load(bytes);
  } catch {
    // A PDF pdf-lib cannot open (for example an encrypted one) is still sent whole.
    return { pageCount: 0, parts: whole(0) };
  }
  const pageCount = source.getPageCount();
  if (pageCount <= EXTRACT_PAGES_PER_CALL) return { pageCount, parts: whole(pageCount) };

  const parts: Part[] = [];
  for (let start = 0; start < pageCount; start += EXTRACT_PAGES_PER_CALL) {
    const indices = Array.from({ length: Math.min(EXTRACT_PAGES_PER_CALL, pageCount - start) }, (_, i) => start + i);
    const piece = await PDFDocument.create();
    const pages = await piece.copyPages(source, indices);
    for (const page of pages) piece.addPage(page);
    const data = Buffer.from(await piece.save()).toString("base64");
    parts.push({
      firstPage: start + 1,
      pageCount: indices.length,
      block: { type: "document", source: { type: "base64", media_type: PDF_TYPE, data } },
    });
  }
  return { pageCount, parts };
}

/** Runs tasks with at most `limit` in flight, keeping results in order. */
async function inBatches<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Reads an uploaded PDF or photo into passages: printed text and handwriting
 * transcribed, diagrams described, each tied to its page.
 */
export async function extractFile(
  ctx: AiContext,
  file: { name: string; mime: string; source: "teacher" | "notes" },
  bytes: Buffer,
): Promise<Extraction> {
  let parts: Part[];
  let pageCount: number;

  if (file.mime === PDF_TYPE) {
    ({ pageCount, parts } = await pdfParts(bytes));
  } else if (isImageType(file.mime)) {
    pageCount = 1;
    parts = [
      {
        firstPage: 1,
        pageCount: 1,
        block: { type: "image", source: { type: "base64", media_type: file.mime, data: bytes.toString("base64") } },
      },
    ];
  } else {
    throw new Error(`Unsupported file type: ${file.mime}`);
  }

  const perPart = await inBatches(parts, EXTRACT_CONCURRENCY, async (part) => {
    const pageNote =
      file.mime !== PDF_TYPE
        ? "It is a single photo or scan; treat it as page 1."
        : part.pageCount > 0
          ? `This document has ${part.pageCount} page${part.pageCount === 1 ? "" : "s"}; number them from 1.`
          : "Number its pages from 1.";
    const result = await runClaude(
      ctx,
      "extract",
      [part.block, { type: "text", text: EXTRACT_INSTRUCTIONS(file, pageNote) }],
      extractSchema,
    );
    return { part, pages: result.pages };
  });

  const passages: ExtractedPassage[] = [];
  let highestPage = 0;
  for (const { part, pages } of perPart) {
    const ordered = [...pages].sort((a, b) => a.page - b.page);
    for (const page of ordered) {
      // Keep page numbers inside the part, whatever the model returned.
      const local = Math.min(Math.max(1, page.page), Math.max(1, part.pageCount || page.page));
      const absolute = part.firstPage + local - 1;
      highestPage = Math.max(highestPage, absolute);
      for (const passage of page.passages) {
        const text = passage.text.trim();
        if (!text) continue;
        passages.push({ page: absolute, position: passages.length, kind: passage.kind, text });
      }
    }
  }
  return { pageCount: pageCount || highestPage || 1, passages };
}

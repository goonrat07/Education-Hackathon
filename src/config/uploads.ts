/** Limits on what a student can upload. Shared by the upload form and the server. */

export const PDF_TYPE = "application/pdf";
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const ACCEPTED_TYPES: readonly string[] = [PDF_TYPE, ...IMAGE_TYPES];

export const MAX_FILES_PER_TEST = 10;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Files travel to the server in pieces this size (Vercel caps a request body at 4.5 MB). */
export const UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;

/**
 * How many bytes piece number `idx` of a file of `sizeBytes` must hold: a
 * full piece, or what is left for the last one. Null when the file has no
 * such piece. The server stores a piece only when it is exactly this size, so
 * a file can never take up more room than it declared.
 */
export function expectedChunkBytes(sizeBytes: number, idx: number): number | null {
  if (!Number.isInteger(idx) || idx < 0 || !Number.isInteger(sizeBytes) || sizeBytes <= 0) return null;
  const pieces = Math.ceil(sizeBytes / UPLOAD_CHUNK_BYTES);
  if (idx >= pieces) return null;
  return idx < pieces - 1 ? UPLOAD_CHUNK_BYTES : sizeBytes - (pieces - 1) * UPLOAD_CHUNK_BYTES;
}

/**
 * How much one test can hold. Reading is what takes time and AI calls: a PDF
 * is read six pages per call, and everything a test holds is read again in
 * one go to find its topics. These keep both inside what one request can do.
 */
export const MAX_PDF_PAGES = 40;
export const MAX_PAGES_PER_TEST = 80;

/** Photos are scaled down in the browser so the longest side is at most this many pixels. */
export const PHOTO_MAX_EDGE = 2000;

export function maxBytesFor(mime: string): number {
  return mime === PDF_TYPE ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
}

/**
 * Per-student ceilings that keep the app inside the free database tier
 * (0.5 GB shared by everyone). Raise them if you move to a bigger plan.
 */
export const MAX_TESTS_PER_STUDENT = 30;
export const MAX_STORED_BYTES_PER_STUDENT = 100 * 1024 * 1024;
/** All students together. New uploads are refused past this, so the database never fills up. */
export const MAX_STORED_BYTES_TOTAL = 350 * 1024 * 1024;

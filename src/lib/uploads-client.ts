import { IMAGE_TYPES, maxBytesFor, PDF_TYPE, PHOTO_MAX_EDGE, UPLOAD_CHUNK_BYTES } from "@/config/uploads";
import { api, ApiError } from "@/lib/api";

export interface UploadedFile {
  id: string;
  name: string;
  mime: string;
  source: "teacher" | "notes";
  status: "uploading" | "uploaded" | "extracting" | "ready" | "failed";
  error: string | null;
  pageCount: number | null;
  sizeBytes: number;
}

interface Prepared {
  blob: Blob;
  name: string;
  mime: string;
}

/** Phone photos are far larger than needed to read them; shrink before sending. */
async function shrinkPhoto(file: File): Promise<Prepared> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ApiError(
      "This photo format can't be read here. Take a screenshot of it or save it as a JPG, then add that.",
      400,
      "invalid",
    );
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  const small = longest <= PHOTO_MAX_EDGE && file.size <= 1_500_000;
  if (small && (IMAGE_TYPES as readonly string[]).includes(file.type)) {
    bitmap.close();
    return { blob: file, name: file.name, mime: file.type };
  }
  const scale = Math.min(1, PHOTO_MAX_EDGE / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new ApiError("This browser couldn't prepare the photo.", 400, "invalid");
  // White behind transparent images so handwriting stays dark on light.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new ApiError("This browser couldn't prepare the photo.", 400, "invalid");
  return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg" };
}

async function prepare(file: File): Promise<Prepared> {
  const isPdf = file.type === PDF_TYPE || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) return { blob: file, name: file.name, mime: PDF_TYPE };
  if (file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)) {
    return shrinkPhoto(file);
  }
  throw new ApiError("Add a PDF or a photo.", 400, "invalid");
}

/**
 * Uploads one file to a test: registers it, sends it in pieces, and confirms
 * it arrived whole. Reading it into passages is a separate step.
 */
export async function uploadFile(
  testId: string,
  file: File,
  source: "teacher" | "notes",
  onProgress: (fraction: number) => void,
): Promise<UploadedFile> {
  const prepared = await prepare(file);
  const limit = maxBytesFor(prepared.mime);
  if (prepared.blob.size > limit) {
    throw new ApiError(`That file is too big. The limit is ${Math.round(limit / 1024 / 1024)} MB.`, 400, "invalid");
  }
  const { file: row } = await api<{ file: UploadedFile }>(`/api/tests/${testId}/files`, {
    body: { name: prepared.name, mime: prepared.mime, sizeBytes: prepared.blob.size, source },
  });

  const pieces = Math.ceil(prepared.blob.size / UPLOAD_CHUNK_BYTES);
  for (let i = 0; i < pieces; i++) {
    const piece = prepared.blob.slice(i * UPLOAD_CHUNK_BYTES, (i + 1) * UPLOAD_CHUNK_BYTES);
    const response = await fetch(`/api/files/${row.id}/chunks/${i}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: piece,
    }).catch(() => null);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      // Leave nothing half-uploaded behind.
      await api(`/api/files/${row.id}`, { method: "DELETE" }).catch(() => undefined);
      throw new ApiError(data?.error ?? "The upload was interrupted. Try that file again.", response?.status ?? 0);
    }
    onProgress((i + 1) / pieces);
  }
  const { file: done } = await api<{ file: UploadedFile }>(`/api/files/${row.id}/complete`, { method: "POST" });
  return done;
}

/** Reads an uploaded file into passages. Can take a minute or two for a long PDF. */
export async function readFile(fileId: string): Promise<UploadedFile> {
  const { file } = await api<{ file: UploadedFile }>(`/api/files/${fileId}/extract`, { method: "POST" });
  return file;
}

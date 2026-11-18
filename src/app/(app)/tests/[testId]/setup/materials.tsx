"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_FILES_PER_TEST, MAX_PAGES_PER_TEST, MAX_PDF_PAGES } from "@/config/uploads";
import { api, messageFrom } from "@/lib/api";
import { readFile, uploadFile, type UploadedFile } from "@/lib/uploads-client";

type Source = "teacher" | "notes";

/** A file as the page tracks it: uploading, being read, ready, or failed. */
export interface MaterialRow {
  key: string;
  id: string | null;
  name: string;
  source: Source;
  state: "uploading" | "reading" | "ready" | "failed";
  progress: number;
  error: string | null;
}

export function rowFromFile(file: UploadedFile): MaterialRow {
  const state =
    file.status === "ready"
      ? "ready"
      : file.status === "failed" || file.status === "uploading"
        ? "failed"
        : "reading";
  return {
    key: file.id,
    id: file.id,
    name: file.name,
    source: file.source,
    state,
    progress: 1,
    error:
      file.status === "uploading" ? "This upload didn't finish. Remove it and add the file again." : file.error,
  };
}

const SOURCE_LABEL: Record<Source, string> = { teacher: "Teacher material", notes: "My notes" };

let nextKey = 0;

/**
 * Upload area and file list. Each file is tagged as teacher material or the
 * student's own notes, uploaded, then read into passages.
 */
export function Materials({
  testId,
  rows,
  onRows,
}: {
  testId: string;
  rows: MaterialRow[];
  onRows: (update: (rows: MaterialRow[]) => MaterialRow[]) => void;
}) {
  const teacherInput = useRef<HTMLInputElement>(null);
  const notesInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const resumed = useRef(false);

  const patch = (key: string, change: Partial<MaterialRow>) =>
    onRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));

  async function read(key: string, fileId: string) {
    patch(key, { state: "reading", error: null });
    try {
      await readFile(fileId);
      patch(key, { state: "ready" });
    } catch (e) {
      patch(key, { state: "failed", error: messageFrom(e) });
    }
  }

  // Files that were uploaded earlier but not read yet (a reload mid-way) pick up where they left off.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    for (const row of rows) {
      if (row.state === "reading" && row.id) void read(row.key, row.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(files: FileList | File[], source: Source) {
    setNotice(null);
    const list = Array.from(files);
    const room = MAX_FILES_PER_TEST - rows.length;
    if (list.length > room) {
      setNotice(`A test can have up to ${MAX_FILES_PER_TEST} files. ${room > 0 ? `Only the first ${room} were added.` : ""}`);
    }
    for (const file of list.slice(0, Math.max(0, room))) {
      const key = `new-${nextKey++}`;
      onRows((current) => [
        ...current,
        { key, id: null, name: file.name, source, state: "uploading", progress: 0, error: null },
      ]);
      try {
        const uploaded = await uploadFile(testId, file, source, (progress) => patch(key, { progress }));
        patch(key, { id: uploaded.id, name: uploaded.name, progress: 1 });
        // Reading runs alongside the next upload.
        void read(key, uploaded.id);
      } catch (e) {
        patch(key, { state: "failed", error: messageFrom(e) });
      }
    }
  }

  async function remove(row: MaterialRow) {
    if (row.id) {
      try {
        await api(`/api/files/${row.id}`, { method: "DELETE" });
      } catch (e) {
        patch(row.key, { error: messageFrom(e) });
        return;
      }
    }
    onRows((current) => current.filter((r) => r.key !== row.key));
  }

  async function retag(row: MaterialRow, source: Source) {
    patch(row.key, { source });
    if (row.id) await api(`/api/files/${row.id}`, { method: "PATCH", body: { source } }).catch(() => undefined);
  }

  const accept = "application/pdf,image/*";

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          // Dropped files start as notes; the tag can be changed on each file.
          if (event.dataTransfer.files.length > 0) void add(event.dataTransfer.files, "notes");
        }}
        className={`rounded-[3px] border-2 border-dashed px-4 py-6 sm:px-6 ${
          dragging ? "border-ink bg-hi-yellow/30" : "border-rule bg-sheet"
        }`}
      >
        <p className="max-w-[60ch]">
          Add PDFs or photos. Photos of handwritten notes work, and so do pages with diagrams.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn btn-ink" onClick={() => teacherInput.current?.click()}>
            Add teacher material
          </button>
          <button type="button" className="btn btn-paper" onClick={() => notesInput.current?.click()}>
            Add my notes
          </button>
        </div>
        <p className="field-hint">
          Up to {MAX_FILES_PER_TEST} files and {MAX_PAGES_PER_TEST} pages in all. A PDF can be up to {MAX_PDF_PAGES}{" "}
          pages and 20 MB, so add the chapter or handout your test covers rather than a whole textbook. On a phone,
          &ldquo;Add my notes&rdquo; lets you take a photo.
        </p>
        <input
          ref={teacherInput}
          type="file"
          accept={accept}
          multiple
          hidden
          aria-label="Choose teacher material"
          onChange={(event) => {
            if (event.target.files) void add(event.target.files, "teacher");
            event.target.value = "";
          }}
        />
        <input
          ref={notesInput}
          type="file"
          accept={accept}
          multiple
          hidden
          aria-label="Choose your notes"
          onChange={(event) => {
            if (event.target.files) void add(event.target.files, "notes");
            event.target.value = "";
          }}
        />
      </div>

      {notice && (
        <p role="status" className="mt-3 text-sm text-redpen">
          {notice}
        </p>
      )}

      {rows.length > 0 && (
        <ul className="mt-4 ruled-top" aria-label="Your files">
          {rows.map((row) => (
            <li key={row.key} className="py-3 ruled-bottom">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="min-w-0 flex-1 basis-48 truncate font-semibold" title={row.name}>
                  {row.name}
                </p>
                <div role="group" aria-label={`Who wrote ${row.name}`} className="flex">
                  {(["teacher", "notes"] as const).map((source) => (
                    <button
                      key={source}
                      type="button"
                      aria-pressed={row.source === source}
                      onClick={() => void retag(row, source)}
                      className={`border-2 border-ink px-2.5 py-1 text-sm font-semibold first:rounded-l-[9px] last:-ml-0.5 last:rounded-r-[9px] ${
                        row.source === source ? "bg-ink text-paper" : "bg-sheet text-ink"
                      }`}
                    >
                      {SOURCE_LABEL[source]}
                    </button>
                  ))}
                </div>
                <p className="w-28 text-sm" role="status">
                  {row.state === "uploading" && `Uploading ${Math.round(row.progress * 100)}%`}
                  {row.state === "reading" && "Reading it…"}
                  {row.state === "ready" && <span className="font-semibold text-pass">Read</span>}
                  {row.state === "failed" && <span className="font-semibold text-redpen">Didn&rsquo;t work</span>}
                </p>
                <button type="button" className="link link-quiet text-sm" onClick={() => void remove(row)}>
                  Remove<span className="sr-only"> {row.name}</span>
                </button>
              </div>
              {(row.state === "uploading" || row.state === "reading") && <div className="working-line mt-2" />}
              {row.state === "failed" && (
                <p className="mt-1 text-sm text-redpen">
                  {row.error ?? "Something went wrong with this file."}{" "}
                  {row.id && (
                    <button type="button" className="link text-sm" onClick={() => void read(row.key, row.id!)}>
                      Try reading it again
                    </button>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

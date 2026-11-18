"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { PdfPage } from "@/components/pdf-page";
import { RichText } from "@/components/rich-text";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";

interface SourceData {
  passage: { id: string; page: number; kind: string; text: string };
  file: { id: string; name: string; source: "teacher" | "notes"; mime: string };
  pagePassages: Array<{ id: string; kind: string; text: string }>;
}

interface Request {
  passageId: string;
  /** Passages to highlight on the page; defaults to the one opened. */
  highlight: string[];
}

const SourceContext = createContext<((passageId: string, highlight?: string[]) => void) | null>(null);

/** Opens the source viewer for a passage. */
export function useSource() {
  const open = useContext(SourceContext);
  if (!open) throw new Error("useSource must be used inside SourceProvider");
  return open;
}

/**
 * A link that opens the passage a card, question or topic came from, shown
 * in the student's own file.
 */
export function SourceLink({
  passageId,
  highlight,
  children = "See where this came from",
  className = "link text-sm",
}: {
  passageId: string;
  highlight?: string[];
  children?: React.ReactNode;
  className?: string;
}) {
  const open = useSource();
  return (
    <button type="button" className={className} onClick={() => open(passageId, highlight)}>
      {children}
    </button>
  );
}

function SourceBody({ request }: { request: Request }) {
  const { data, error } = useLoad(request.passageId, () => api<SourceData>(`/api/passages/${request.passageId}`));
  const marked = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (data) marked.current?.scrollIntoView({ block: "center" });
  }, [data]);

  if (error) return <p className="p-5 text-redpen">{error}</p>;
  if (!data) {
    return (
      <div className="p-5">
        <p className="text-pencil">Opening your file…</p>
        <div className="working-line mt-3" />
      </div>
    );
  }

  const highlight = new Set(request.highlight);
  const url = `/api/files/${data.file.id}/content`;
  const isPdf = data.file.mime === "application/pdf";
  const firstMarked = data.pagePassages.find((p) => highlight.has(p.id))?.id;

  return (
    <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
      <section className="p-5 md:overflow-y-auto" aria-label="What Study Coach read on this page">
        <h3 className="font-sans text-sm font-semibold text-pencil">
          {data.file.source === "teacher" ? "Teacher material" : "Your notes"}, page {data.passage.page}, as read by
          Study Coach
        </h3>
        <ol className="mt-3 space-y-3">
          {data.pagePassages.map((p) => {
            const on = highlight.has(p.id);
            const ref = p.id === firstMarked ? marked : undefined;
            return (
              <li
                key={p.id}
                ref={ref}
                data-highlighted={on || undefined}
                className={on ? "rounded-[3px] bg-hi-yellow/70 px-3 py-2" : "px-3 text-pencil"}
              >
                <RichText text={p.text} />
              </li>
            );
          })}
        </ol>
      </section>
      <section className="border-t border-rule bg-rule-faint/50 p-5 md:overflow-y-auto md:border-l md:border-t-0" aria-label="The original page">
        <h3 className="font-sans text-sm font-semibold text-pencil">The original page</h3>
        <div className="mt-3 overflow-hidden rounded-[3px] shadow-[var(--shadow-card)]">
          {isPdf ? (
            <PdfPage url={url} page={data.passage.page} label={`Page ${data.passage.page} of ${data.file.name}`} />
          ) : (
            // The student's own photo, served only to them; next/image would re-host and re-encode it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`Your upload: ${data.file.name}`} className="block w-full" />
          )}
        </div>
      </section>
    </div>
  );
}

/** Provides the source viewer to everything inside it. */
export function SourceProvider({ children }: { children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState<Request | null>(null);

  const open = useCallback((passageId: string, highlight?: string[]) => {
    setRequest({ passageId, highlight: highlight && highlight.length > 0 ? highlight : [passageId] });
  }, []);

  useEffect(() => {
    if (request && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [request]);

  return (
    <SourceContext value={open}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="source-title"
        onClose={() => setRequest(null)}
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === dialog.current) dialog.current?.close();
        }}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-5xl bg-paper p-0 text-ink backdrop:bg-ink/40"
      >
        {request && (
          <div className="flex h-full flex-col">
            <header className="flex items-center justify-between gap-4 border-b border-rule px-5 py-3">
              <h2 id="source-title" className="text-lg">
                From your materials
              </h2>
              <button type="button" className="btn btn-paper btn-sm" onClick={() => dialog.current?.close()}>
                Close
              </button>
            </header>
            <SourceBody request={request} />
          </div>
        )}
      </dialog>
    </SourceContext>
  );
}

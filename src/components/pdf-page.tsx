"use client";

import { useEffect, useRef, useState } from "react";

type PdfModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfModule["getDocument"]>["promise"]>;

let pdfjs: Promise<PdfModule> | null = null;
const documents = new Map<string, Promise<PdfDocument>>();

function loadPdfjs(): Promise<PdfModule> {
  pdfjs ??= import("pdfjs-dist").then((module) => {
    module.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return module;
  });
  return pdfjs;
}

function loadDocument(url: string): Promise<PdfDocument> {
  let doc = documents.get(url);
  if (!doc) {
    doc = loadPdfjs().then((module) => module.getDocument({ url, withCredentials: true }).promise);
    documents.set(url, doc);
    doc.catch(() => documents.delete(url));
  }
  return doc;
}

/** One page of an uploaded PDF, drawn to fit the width it is given. */
export function PdfPage({ url, page, label }: { url: string; page: number; label: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const request = `${url}#${page}`;
  const [settled, setSettled] = useState<{ request: string; state: "ready" | "error" } | null>(null);
  const state = settled?.request === request ? settled.state : "loading";

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      try {
        const doc = await loadDocument(url);
        const pdfPage = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
        if (cancelled || !canvas.current || !frame.current) return;
        const width = frame.current.clientWidth || 600;
        const base = pdfPage.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: (width / base.width) * ratio });
        const el = canvas.current;
        el.width = Math.floor(viewport.width);
        el.height = Math.floor(viewport.height);
        el.style.width = "100%";
        const render = pdfPage.render({ canvas: el, viewport });
        task = render;
        await render.promise;
        if (!cancelled) setSettled({ request, state: "ready" });
      } catch {
        if (!cancelled) setSettled({ request, state: "error" });
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [url, page, request]);

  return (
    <div ref={frame} className="relative min-h-40 bg-sheet">
      {state === "loading" && <p className="absolute inset-x-0 top-6 text-center text-sm text-pencil">Opening the page…</p>}
      {state === "error" ? (
        <p className="p-4 text-sm">
          The page couldn&rsquo;t be drawn here.{" "}
          <a className="link" href={url} target="_blank" rel="noreferrer">
            Open the file
          </a>
        </p>
      ) : (
        <canvas ref={canvas} role="img" aria-label={label} className="block" />
      )}
    </div>
  );
}

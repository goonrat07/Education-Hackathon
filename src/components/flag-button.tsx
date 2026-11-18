"use client";

import { useState } from "react";
import { api, messageFrom } from "@/lib/api";

/**
 * "This is wrong": the student's way to say a card, question or answer is
 * mistaken. The item is retired so it is never shown again.
 */
export function FlagButton({
  itemId,
  onFlagged,
  flag,
}: {
  itemId: string;
  onFlagged?: () => void;
  /** Replaces the default request (used by checks, where flagging also changes the score). */
  flag?: () => Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    try {
      if (flag) await flag();
      else await api(`/api/items/${itemId}/flag`, { body: {} });
      setState("done");
      onFlagged?.();
    } catch (e) {
      setError(messageFrom(e));
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <span role="status" className="text-sm text-pencil">
        Marked as wrong. You won&rsquo;t see it again.
      </span>
    );
  }
  return (
    <>
      <button type="button" className="link link-quiet text-sm" disabled={state === "sending"} onClick={send}>
        {state === "sending" ? "Marking…" : "This is wrong"}
      </button>
      {error && (
        <span role="alert" className="ml-2 text-sm text-redpen">
          {error}
        </span>
      )}
    </>
  );
}

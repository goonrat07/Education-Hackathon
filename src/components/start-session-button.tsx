"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, messageFrom } from "@/lib/api";

/** Starts (or resumes) a session on a topic and opens it. */
export function StartSessionButton({
  testId,
  topicId,
  children,
  className = "btn btn-ink btn-lg",
}: {
  testId: string;
  topicId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const { sessionId } = await api<{ sessionId: string }>("/api/sessions", { body: { testId, topicId } });
      router.push(`/study/${sessionId}`);
    } catch (e) {
      setError(messageFrom(e));
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={start} disabled={pending} className={className}>
        {pending ? "Starting…" : children}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-redpen">
          {error}
        </p>
      )}
    </>
  );
}

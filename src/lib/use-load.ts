"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { messageFrom } from "@/lib/api";

interface Settled<T> {
  request: string;
  data: T | null;
  error: string | null;
  /** What the request threw, for callers that need more than the message. */
  cause: unknown;
}

/**
 * Loads something when a component appears and whenever `key` changes.
 * While a request is in flight both `data` and `error` are null.
 *
 * @param key identifies what is being loaded; pass null to load nothing
 */
export function useLoad<T>(
  key: string | null,
  load: () => Promise<T>,
): { data: T | null; error: string | null; cause: unknown; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const request = key === null ? null : `${key}#${attempt}`;
  const run = useEffectEvent(load);

  useEffect(() => {
    if (request === null) return;
    let cancelled = false;
    run().then(
      (data) => {
        if (!cancelled) setSettled({ request, data, error: null, cause: null });
      },
      (error: unknown) => {
        if (!cancelled) setSettled({ request, data: null, error: messageFrom(error), cause: error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // A result from an earlier key or attempt is ignored, so stale data never shows.
  const current = settled && settled.request === request ? settled : null;
  return { data: current?.data ?? null, error: current?.error ?? null, cause: current?.cause ?? null, retry };
}

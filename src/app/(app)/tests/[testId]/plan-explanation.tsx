"use client";

import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";

/**
 * The short note on why the plan looks the way it does. The plan itself is
 * worked out by fixed rules; only this note is written by Claude, once per
 * version of the plan.
 */
export function PlanExplanation({ testId, initial }: { testId: string; initial: string | null }) {
  // Only ask for a new explanation when this version of the plan has none yet.
  const { data, error, retry } = useLoad(initial === null ? testId : null, () =>
    api<{ explanation: string }>(`/api/tests/${testId}/plan/explanation`, { method: "POST" }),
  );
  const text = initial ?? data?.explanation ?? null;

  return (
    <div className="max-w-[68ch]">
      {text !== null ? (
        <p className="text-ink-soft">{text}</p>
      ) : error ? (
        <p className="text-sm text-pencil">
          The explanation couldn&rsquo;t be written just now. {error}{" "}
          <button type="button" className="link text-sm" onClick={retry}>
            Try again
          </button>
        </p>
      ) : (
        <div aria-busy="true">
          <p className="text-sm text-pencil">Writing the explanation…</p>
          <div className="working-line mt-2 max-w-sm" />
        </div>
      )}
    </div>
  );
}

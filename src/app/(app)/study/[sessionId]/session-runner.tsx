"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ConfidenceRating } from "@/components/confidence-rating";
import { MODE_COMPONENTS } from "@/components/modes";
import { api, messageFrom } from "@/lib/api";
import { MODES, type ModeId } from "@/lib/modes";
import type { SessionSummary } from "@/server/study/sessions";
import { CheckStep } from "./check-step";
import { SummaryView } from "./summary-view";

export type Phase = "delayed" | "study" | "check" | "confidence" | "summary";

interface Stats {
  itemsAttempted: number;
  itemsCorrect: number;
}

const STEP_NAMES: Record<Exclude<Phase, "summary">, string> = {
  delayed: "Delayed check",
  study: "Study",
  check: "Check",
  confidence: "Wrap up",
};

/** Where the student is in the session, as a line of steps. */
function Steps({ steps, current }: { steps: Array<Exclude<Phase, "summary">>; current: Phase }) {
  const at = steps.indexOf(current as Exclude<Phase, "summary">);
  return (
    <ol className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Steps in this session">
      {steps.map((step, i) => (
        <li
          key={step}
          aria-current={i === at ? "step" : undefined}
          className={i === at ? "font-semibold underline decoration-hi-yellow decoration-4 underline-offset-4" : i < at ? "text-pencil line-through decoration-rule" : "text-pencil"}
        >
          {STEP_NAMES[step]}
        </li>
      ))}
    </ol>
  );
}

export interface SessionRunnerProps {
  sessionId: string;
  testLabel: string;
  topicName: string;
  mode: ModeId;
  plannedMinutes: number;
  delayedTopicName: string | null;
  initialPhase: Exclude<Phase, "summary">;
}

/** What the study step left in this tab's storage, if the page was reloaded after it. */
function restore(storageKey: string): { stats: Stats; studied: boolean } | null {
  try {
    const saved = window.sessionStorage.getItem(storageKey);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { stats?: Stats; studied?: boolean };
    return parsed.stats ? { stats: parsed.stats, studied: Boolean(parsed.studied) } : null;
  } catch {
    return null;
  }
}

/**
 * Runs one session from start to finish. Every mode goes through the same
 * shell: an optional delayed check on an earlier topic, the mode itself, the
 * end-of-session check, a confidence rating, and the screen showing what moved.
 *
 * Rendered in the browser only (see session-runner-loader.tsx), so it can read
 * this tab's storage while it sets up.
 */
export function SessionRunner({
  sessionId,
  testLabel,
  topicName,
  mode,
  plannedMinutes,
  delayedTopicName,
  initialPhase,
}: SessionRunnerProps) {
  const router = useRouter();
  const storageKey = `study-coach:session:${sessionId}`;
  const [restored] = useState(() => restore(storageKey));
  const [phase, setPhase] = useState<Phase>(restored?.studied && initialPhase === "study" ? "check" : initialPhase);
  const [stats, setStats] = useState<Stats>(restored?.stats ?? { itemsAttempted: 0, itemsCorrect: 0 });
  const [confidence, setConfidence] = useState<number | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishStudy = useCallback(
    (result: Stats) => {
      setStats(result);
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify({ stats: result, studied: true }));
      } catch {
        // Storage unavailable: the results still live in memory for this visit.
      }
      setPhase("check");
      window.scrollTo({ top: 0 });
    },
    [storageKey],
  );

  async function finishSession() {
    if (confidence === null) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api<SessionSummary>(`/api/sessions/${sessionId}/complete`, {
        body: { ...stats, confidence },
      });
      setSummary(result);
      setPhase("summary");
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore: nothing depends on the entry being removed.
      }
      window.scrollTo({ top: 0 });
      // The dashboard and plan now show the updated plan when the student goes back.
      router.refresh();
    } catch (e) {
      setError(messageFrom(e));
    } finally {
      setSaving(false);
    }
  }

  if (phase === "summary" && summary) return <SummaryView summary={summary} />;

  const steps: Array<Exclude<Phase, "summary">> = delayedTopicName
    ? ["delayed", "study", "check", "confidence"]
    : ["study", "check", "confidence"];
  const Mode = MODE_COMPONENTS[mode];

  return (
    <div>
      <header className="mb-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="text-sm text-pencil">
            {testLabel}, {MODES[mode].label.toLowerCase()}, about {plannedMinutes} minutes
          </p>
          <Link href="/" className="link link-quiet text-sm">
            Leave session
          </Link>
        </div>
        <h1 className="mt-1 text-2xl">{topicName}</h1>
        <div className="mt-3">
          <Steps steps={steps} current={phase} />
        </div>
      </header>

      {phase === "delayed" && (
        <section aria-label="Delayed check">
          <p className="mx-auto mb-6 max-w-2xl rounded-[3px] bg-hi-yellow/40 px-4 py-3">
            Before you start: a quick check on <strong>{delayedTopicName}</strong>, which you studied on an earlier
            day. No peeking, this is how a topic gets locked in.
          </p>
          <CheckStep
            sessionId={sessionId}
            kind="delayed"
            doneLabel={`Start ${MODES[mode].label.toLowerCase()}`}
            onDone={() => {
              setPhase("study");
              window.scrollTo({ top: 0 });
            }}
          />
        </section>
      )}

      {phase === "study" && <Mode sessionId={sessionId} topicName={topicName} onFinish={finishStudy} />}

      {phase === "check" && (
        <section aria-label="End-of-session check">
          <p className="mx-auto mb-6 max-w-2xl text-ink-soft">
            Last step: a short check on {topicName} with questions you haven&rsquo;t seen. Passing it is what moves
            the topic up a level.
          </p>
          <CheckStep
            sessionId={sessionId}
            kind="session"
            doneLabel="Continue"
            onDone={() => {
              setPhase("confidence");
              window.scrollTo({ top: 0 });
            }}
          />
        </section>
      )}

      {phase === "confidence" && (
        <section className="mx-auto max-w-xl" aria-labelledby="confidence-question">
          <h2 id="confidence-question" className="text-2xl">
            How well do you know {topicName} now?
          </h2>
          <p className="mt-2 text-ink-soft">Be honest. Your plan uses this next to your check results.</p>
          <div className="mt-5">
            <ConfidenceRating
              value={confidence}
              onChange={setConfidence}
              label={`Confidence in ${topicName}, 1 is lost, 5 is could teach it`}
              size="lg"
            />
            <p className="mt-2 flex max-w-[17.5rem] justify-between text-sm text-pencil">
              <span>lost</span>
              <span>could teach it</span>
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ink btn-lg mt-7"
            disabled={confidence === null || saving}
            onClick={finishSession}
          >
            {saving ? "Saving…" : "Finish session"}
          </button>
          {error && (
            <p role="alert" className="mt-3 text-redpen">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

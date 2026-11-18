import Link from "next/link";
import { LevelMark, LevelName } from "@/components/level-mark";
import { ReadinessLine } from "@/components/readiness-line";
import { StartSessionButton } from "@/components/start-session-button";
import { plural } from "@/lib/format";
import { MODES } from "@/lib/modes";
import type { ProgressRow, SessionSummary } from "@/server/study/sessions";

function gapSentence(row: ProgressRow): string {
  const check = `${row.latestCheck!.correct} of ${row.latestCheck!.scored}`;
  return (row.gap ?? 0) > 0
    ? `${row.name}: you rated it ${row.confidence} out of 5, but your last check was ${check}.`
    : `${row.name}: you rated it only ${row.confidence} out of 5, but your last check was ${check}.`;
}

/** The screen after every session: what moved, and what comes next. */
export function SummaryView({ summary }: { summary: SessionSummary }) {
  const before = Math.round(summary.readinessBefore * 100);
  const after = Math.round(summary.readinessAfter * 100);
  const moved = summary.movements.filter((m) => m.levelAfter !== m.levelBefore);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-pencil">Session finished</p>
      <h1 className="mt-1 text-3xl">What moved</h1>

      <ul className="mt-6 space-y-5">
        {summary.movements.map((m, i) => (
          <li key={`${m.topicId}-${m.kind}-${i}`} className="ruled-bottom pb-5">
            <p className="text-sm text-pencil">
              {m.kind === "delayed" ? "Delayed check" : "End-of-session check"}: {m.correct} of {m.scored},{" "}
              {m.passed ? "passed" : "not passed"}
            </p>
            <p className="mt-1 font-display text-xl font-semibold">{m.topicName}</p>
            <p className="mt-2 font-display text-lg font-semibold">
              <LevelName level={m.levelBefore} />
              {m.levelAfter !== m.levelBefore ? (
                <>
                  <span className="mx-3 font-sans text-base font-normal text-pencil">to</span>
                  <LevelName level={m.levelAfter} draw />
                </>
              ) : (
                <span className="ml-3 font-sans text-base font-normal text-pencil">no change</span>
              )}
            </p>
          </li>
        ))}
      </ul>
      {moved.length === 0 && (
        <p className="mt-4 max-w-[60ch] text-ink-soft">
          No level moved this time. A level goes up only when a check is passed, and the last step needs a check on
          a later day.
        </p>
      )}

      <section className="mt-8" aria-labelledby="readiness-heading">
        <h2 id="readiness-heading" className="text-xl">
          {summary.testName}
        </h2>
        <p className="mt-1 text-ink-soft">
          {after === before ? `Readiness is at ${after}%.` : `Readiness went from ${before}% to ${after}%.`}
        </p>
        <div className="mt-3">
          <ReadinessLine levels={summary.rows.map((r) => r.level)} />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="confidence-heading">
        <h2 id="confidence-heading" className="text-xl">
          Your confidence next to your checks
        </h2>
        {summary.gaps.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label="Biggest gaps">
            {summary.gaps.map((row) => (
              <li
                key={row.topicId}
                className={`rounded-[3px] border-l-4 px-4 py-2.5 ${
                  (row.gap ?? 0) > 0 ? "border-redpen bg-redpen-wash" : "border-pass bg-pass-wash"
                }`}
              >
                {gapSentence(row)} {(row.gap ?? 0) > 0 ? "It needs more work than it feels like." : "You know it better than you think."}
              </li>
            ))}
          </ul>
        )}
        <ul className="mt-3 ruled-top">
          {summary.rows.map((row) => (
            <li key={row.topicId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 ruled-bottom">
              <span className="min-w-0 flex-1 basis-48 font-semibold">
                <LevelMark level={row.level}>{row.name}</LevelMark>
              </span>
              <span className="text-sm tabular-nums">
                <span className="text-pencil">confidence </span>
                {row.confidence ? `${row.confidence} of 5` : "not rated"}
              </span>
              <span className="w-32 text-sm tabular-nums">
                <span className="text-pencil">last check </span>
                {row.latestCheck ? `${row.latestCheck.correct} of ${row.latestCheck.scored}` : "none"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-9" aria-labelledby="next-heading">
        <h2 id="next-heading" className="text-xl">
          Your plan is updated
        </h2>
        {summary.next ? (
          <>
            <p className="mt-1 text-ink-soft">
              {plural(summary.remainingToday, "session")} left today. Next is {summary.next.topicName},{" "}
              {MODES[summary.next.mode].label.toLowerCase()}, about {summary.next.minutes} minutes.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <StartSessionButton testId={summary.next.testId} topicId={summary.next.topicId}>
                Start the next session
              </StartSessionButton>
              <Link href="/" className="link">
                Back to today
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-ink-soft">Nothing else is planned for this test today.</p>
            <Link href="/" className="btn btn-ink btn-lg mt-4">
              Back to today
            </Link>
          </>
        )}
      </section>
    </div>
  );
}

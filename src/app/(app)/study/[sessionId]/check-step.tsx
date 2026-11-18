"use client";

import { useState } from "react";
import { LevelName } from "@/components/level-mark";
import { OptionList, Reveal } from "@/components/modes/practice";
import { RichText } from "@/components/rich-text";
import { SourceLink } from "@/components/source-panel";
import { api, blocksCheck, messageFrom } from "@/lib/api";
import type { PublicQuestion } from "@/lib/items";
import { useLoad } from "@/lib/use-load";
import type { CheckOutcome, CheckView } from "@/server/study/checks";

interface Draft {
  response: string;
  flagged: boolean;
}

function levelNote(outcome: CheckOutcome): string {
  if (outcome.levelAfter > outcome.levelBefore) return "";
  if (!outcome.passed) return "Levels only move when a check is passed, so this topic stays where it is and comes back in your plan.";
  if (outcome.levelBefore === 3) return "This topic is already locked in.";
  if (outcome.levelBefore === 2) {
    return "Passed. To lock this topic in, pass a delayed check on it on a later day.";
  }
  return "";
}

function Results({
  outcome,
  questions,
  onOutcome,
  onDone,
  doneLabel,
}: {
  outcome: CheckOutcome;
  questions: PublicQuestion[];
  onOutcome: (outcome: CheckOutcome) => void;
  onDone: () => void;
  doneLabel: string;
}) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const note = levelNote(outcome);
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-2xl">{outcome.passed ? "Check passed" : "Check not passed"}</h2>
      <p className="mt-2 text-lg">
        {outcome.correct} of {outcome.scored} right on {outcome.topicName}.
      </p>
      <p className="mt-3 font-display text-lg font-semibold">
        <LevelName level={outcome.levelBefore} />
        {outcome.levelAfter !== outcome.levelBefore && (
          <>
            <span className="mx-3 font-sans font-normal text-pencil">to</span>
            <LevelName level={outcome.levelAfter} draw />
          </>
        )}
      </p>
      {note && <p className="mt-3 max-w-[60ch] text-ink-soft">{note}</p>}

      <ol className="mt-7 space-y-8">
        {outcome.reveals.map((reveal, i) => {
          const question = byId.get(reveal.itemId);
          if (!question) return null;
          return (
            <li key={reveal.itemId} className="ruled-top pt-5">
              <p className="text-sm text-pencil">
                Question {i + 1}
                {reveal.excluded && ", not counted"}
              </p>
              <p className="mt-1 text-lg font-semibold leading-snug">
                <RichText text={question.question} />
              </p>
              <div className="mt-3">
                {question.kind === "mcq" ? (
                  <OptionList
                    question={question}
                    chosen={reveal.response === "" ? null : Number(reveal.response)}
                    correctIndex={reveal.correctIndex}
                  />
                ) : (
                  <p>
                    <span className="text-sm font-semibold text-pencil">You wrote</span>
                    <span className="mt-0.5 block whitespace-pre-wrap">{reveal.response || "(nothing)"}</span>
                  </p>
                )}
              </div>
              {reveal.excluded ? (
                <p className="mt-3 flex flex-wrap items-baseline justify-between gap-3 text-sm text-pencil">
                  <span>You marked this question as wrong, so it doesn&rsquo;t count.</span>
                  <SourceLink passageId={reveal.passageId} />
                </p>
              ) : (
                <Reveal
                  reveal={reveal}
                  kind={question.kind}
                  flag={async () => {
                    const updated = await api<CheckOutcome>(`/api/checks/${outcome.checkId}/dispute`, {
                      body: { itemId: reveal.itemId },
                    });
                    onOutcome(updated);
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>

      <button type="button" className="btn btn-ink btn-lg mt-8" onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  );
}

/** How to go on when a check could not be written or graded. */
interface SkipProps {
  skipLabel: string;
  /** What skipping means for the student's levels. */
  skipNote: string;
  onSkip: () => void;
}

/** The way out when the app itself could not produce or grade a check. */
function SkipOffer({ skipLabel, skipNote, onSkip }: SkipProps) {
  return (
    <div className="mt-5 rounded-[3px] bg-rule-faint px-4 py-3">
      <p>This isn&rsquo;t something you did. {skipNote}</p>
      <button type="button" className="link mt-2" onClick={onSkip}>
        {skipLabel}
      </button>
    </div>
  );
}

/**
 * A check: 3 to 5 questions the student has not seen before, answered one at
 * a time and graded together. Used for the delayed check that opens a
 * session and the check that ends it.
 *
 * If the check cannot be written or graded at all, the student is offered a
 * way to go on without it rather than being left stuck.
 */
export function CheckStep({
  sessionId,
  kind,
  doneLabel,
  onDone,
  ...skip
}: {
  sessionId: string;
  kind: "session" | "delayed";
  doneLabel: string;
  onDone: (outcome: CheckOutcome) => void;
} & SkipProps) {
  const { data: view, error, cause, retry } = useLoad(`${sessionId}:${kind}`, () =>
    api<CheckView>(`/api/sessions/${sessionId}/checks`, { body: { kind } }),
  );

  if (error) {
    return (
      <div className="mx-auto max-w-xl">
        <p role="alert" className="text-redpen">
          {error}
        </p>
        <button type="button" className="btn btn-paper mt-3" onClick={retry}>
          Try again
        </button>
        {blocksCheck(cause) && <SkipOffer {...skip} />}
      </div>
    );
  }
  if (!view) {
    return (
      <div className="mx-auto max-w-xl" aria-busy="true">
        <p>Getting your check ready: new questions, each solved twice to make sure the answer is right.</p>
        <div className="working-line mt-3" />
      </div>
    );
  }
  return <CheckBody key={view.checkId} view={view} doneLabel={doneLabel} onDone={onDone} skip={skip} />;
}

function CheckBody({
  view,
  doneLabel,
  onDone,
  skip,
}: {
  view: CheckView;
  doneLabel: string;
  onDone: (outcome: CheckOutcome) => void;
  skip: SkipProps;
}) {
  const [outcome, setOutcome] = useState<CheckOutcome | null>(view.outcome);
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True when grading failed for a reason the student cannot fix.
  const [canSkip, setCanSkip] = useState(false);

  if (outcome) {
    return (
      <Results
        outcome={outcome}
        questions={view.questions}
        onOutcome={setOutcome}
        onDone={() => onDone(outcome)}
        doneLabel={doneLabel}
      />
    );
  }

  const question = view.questions[index];
  const draft = drafts[question.id] ?? { response: "", flagged: false };
  const last = index === view.questions.length - 1;
  const setDraft = (change: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [question.id]: { ...draft, ...change } }));
  const answered = draft.flagged || draft.response.trim() !== "";

  async function submit(finalDrafts: Record<string, Draft>) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await api<CheckOutcome>(`/api/checks/${view.checkId}/submit`, {
        body: {
          answers: view.questions.map((q) => ({
            itemId: q.id,
            response: finalDrafts[q.id]?.response ?? "",
            flagged: finalDrafts[q.id]?.flagged ?? false,
          })),
        },
      });
      setOutcome(result);
    } catch (e) {
      setError(messageFrom(e));
      setCanSkip(blocksCheck(e));
    } finally {
      setSubmitting(false);
    }
  }

  function advance(nextDrafts: Record<string, Draft>) {
    if (last) void submit(nextDrafts);
    else setIndex((i) => i + 1);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-pencil">
        Question {index + 1} of {view.questions.length}
      </p>
      <h2 className="mt-2 font-sans text-xl font-semibold leading-snug tracking-normal">
        <RichText text={question.question} />
      </h2>

      <div className="mt-5">
        {draft.flagged ? (
          <p className="rounded-[3px] bg-rule-faint px-4 py-3">
            Marked as wrong. This question won&rsquo;t count.{" "}
            <button type="button" className="link" onClick={() => setDraft({ flagged: false })}>
              Undo
            </button>
          </p>
        ) : question.kind === "mcq" ? (
          <OptionList
            question={question}
            chosen={draft.response === "" ? null : Number(draft.response)}
            onChoose={(i) => setDraft({ response: String(i) })}
            disabled={submitting}
          />
        ) : (
          <div>
            <label htmlFor="check-answer" className="field-label">
              Your answer
            </label>
            <textarea
              id="check-answer"
              className="field min-h-24"
              rows={3}
              value={draft.response}
              disabled={submitting}
              onChange={(e) => setDraft({ response: e.target.value })}
            />
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {index > 0 && (
          <button type="button" className="btn btn-paper" disabled={submitting} onClick={() => setIndex((i) => i - 1)}>
            Back
          </button>
        )}
        <button type="button" className="btn btn-ink btn-lg" disabled={!answered || submitting} onClick={() => advance(drafts)}>
          {submitting ? "Checking your answers…" : last ? "Hand in the check" : "Next question"}
        </button>
        {!answered && !submitting && (
          <button
            type="button"
            className="link link-quiet"
            onClick={() => {
              // Moving on without an answer counts as a miss.
              const nextDrafts = { ...drafts, [question.id]: { response: "", flagged: false } };
              setDrafts(nextDrafts);
              advance(nextDrafts);
            }}
          >
            I don&rsquo;t know
          </button>
        )}
      </div>
      {submitting && <div className="working-line mt-3" />}
      {error && (
        <p role="alert" className="mt-3 text-redpen">
          {error}
        </p>
      )}
      {error && canSkip && <SkipOffer {...skip} />}

      {!draft.flagged && (
        <p className="mt-6 text-sm">
          <button type="button" className="link link-quiet text-sm" onClick={() => setDraft({ flagged: true })}>
            This is wrong
          </button>
          <span className="text-pencil"> (if the question itself has a mistake)</span>
        </p>
      )}
    </div>
  );
}

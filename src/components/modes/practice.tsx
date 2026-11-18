"use client";

import { useRef, useState } from "react";
import { FlagButton } from "@/components/flag-button";
import { RichText } from "@/components/rich-text";
import { SourceLink } from "@/components/source-panel";
import { api, messageFrom } from "@/lib/api";
import type { AnswerReveal, PublicQuestion } from "@/lib/items";
import { useLoad } from "@/lib/use-load";
import type { ModeProps } from "./types";

const KIND_LABEL: Record<PublicQuestion["kind"], string> = {
  mcq: "Multiple choice",
  short: "Short answer",
  worked: "Worked problem",
};

const LETTERS = ["A", "B", "C", "D", "E"];

/** The options of a multiple-choice question, before or after the answer is known. */
export function OptionList({
  question,
  chosen,
  onChoose,
  correctIndex,
  disabled,
}: {
  question: Extract<PublicQuestion, { kind: "mcq" }>;
  chosen: number | null;
  onChoose?: (index: number) => void;
  /** Set once the answer has been checked. */
  correctIndex?: number;
  disabled?: boolean;
}) {
  const revealed = correctIndex !== undefined;
  return (
    <div role="radiogroup" aria-label="Answer choices" className="space-y-2">
      {question.options.map((option, i) => {
        const isChosen = chosen === i;
        const isCorrect = revealed && i === correctIndex;
        const isWrongChoice = revealed && isChosen && !isCorrect;
        let tone = "border-rule bg-sheet hover:border-ink";
        if (isCorrect) tone = "border-pass bg-hi-green/60";
        else if (isWrongChoice) tone = "border-redpen bg-redpen-wash";
        else if (isChosen) tone = "border-ink bg-hi-yellow/50";
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={isChosen}
            disabled={disabled || revealed}
            onClick={() => onChoose?.(i)}
            className={`flex w-full items-baseline gap-3 rounded-[9px] border-2 px-4 py-3 text-left disabled:cursor-default ${tone}`}
          >
            <span className="font-display font-bold" aria-hidden="true">
              {LETTERS[i]}
            </span>
            <span className={`min-w-0 flex-1 ${isWrongChoice ? "line-through decoration-redpen decoration-2" : ""}`}>
              <RichText text={option} />
            </span>
            {isCorrect && <span className="shrink-0 text-sm font-semibold text-pass">Correct answer</span>}
            {isWrongChoice && <span className="shrink-0 text-sm font-semibold text-redpen">Your answer</span>}
          </button>
        );
      })}
    </div>
  );
}

/** What is shown once an answer has been checked: the verdict, the answer, why, and where it came from. */
export function Reveal({
  reveal,
  kind,
  flag,
  onFlagged,
}: {
  reveal: AnswerReveal;
  kind: PublicQuestion["kind"];
  flag?: () => Promise<void>;
  onFlagged?: () => void;
}) {
  const steps = reveal.steps ?? [];
  const [shown, setShown] = useState(1);

  return (
    <div className="mt-4">
      <p
        role="status"
        className={`rounded-[3px] border-l-4 px-4 py-2.5 font-semibold ${
          reveal.correct ? "border-pass bg-pass-wash text-pass" : "border-redpen bg-redpen-wash text-redpen"
        }`}
      >
        {reveal.correct ? "Correct" : "Not quite"}
      </p>

      {reveal.feedback && (
        <p className="mt-3">
          <RichText text={reveal.feedback} />
        </p>
      )}

      {kind !== "mcq" && (
        <p className="mt-3">
          <span className="text-sm font-semibold text-pencil">{kind === "worked" ? "Final answer" : "Model answer"}</span>
          <span className="mt-0.5 block">
            <RichText text={reveal.answer} />
          </span>
        </p>
      )}

      {reveal.explanation && (
        <p className="mt-3 text-ink-soft">
          <RichText text={reveal.explanation} />
        </p>
      )}

      {steps.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-pencil">Solution, step by step</p>
          <ol className="mt-2 space-y-2">
            {steps.slice(0, shown).map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-display font-bold tabular-nums text-pencil" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <RichText text={step} />
                </span>
              </li>
            ))}
          </ol>
          {shown < steps.length && (
            <p className="mt-3 flex gap-4">
              <button type="button" className="btn btn-paper btn-sm" onClick={() => setShown((n) => n + 1)}>
                Show next step
              </button>
              <button type="button" className="link link-quiet text-sm" onClick={() => setShown(steps.length)}>
                Show all {steps.length} steps
              </button>
            </p>
          )}
        </div>
      )}

      <p className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <SourceLink passageId={reveal.passageId} />
        <FlagButton itemId={reveal.itemId} flag={flag} onFlagged={onFlagged} />
      </p>
    </div>
  );
}

/**
 * Practice problems: multiple choice, short answers graded against the
 * student's materials, and worked problems with step-by-step solutions.
 */
export function PracticeMode({ sessionId, onFinish }: ModeProps) {
  const { data, error: loadError, retry } = useLoad(sessionId, () =>
    api<{ questions: PublicQuestion[] }>(`/api/sessions/${sessionId}/study`),
  );
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [checking, setChecking] = useState(false);
  const [reveal, setReveal] = useState<AnswerReveal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const results = useRef(new Map<string, boolean>());

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl">
        <p role="alert" className="text-redpen">
          {loadError}
        </p>
        <button type="button" className="btn btn-paper mt-3" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-xl" aria-busy="true">
        <p>
          Writing practice problems from your materials and solving each one a second time to check the answer.
          The first time takes about a minute.
        </p>
        <div className="working-line mt-3" />
      </div>
    );
  }

  const questions = data.questions;
  const question = questions[index];
  const last = index === questions.length - 1;

  function finish() {
    const all = [...results.current.values()];
    onFinish({ itemsAttempted: all.length, itemsCorrect: all.filter(Boolean).length });
  }

  if (!question) {
    // Every problem was flagged or the list was empty.
    return (
      <div className="max-w-xl">
        <p>No more problems for this session.</p>
        <button type="button" className="btn btn-ink mt-4" onClick={finish}>
          Go to the check
        </button>
      </div>
    );
  }

  async function check(response: string) {
    setChecking(true);
    setError(null);
    try {
      const result = await api<AnswerReveal>(`/api/sessions/${sessionId}/items/${question.id}/answer`, {
        body: { response },
      });
      results.current.set(question.id, result.correct);
      setReveal(result);
    } catch (e) {
      setError(messageFrom(e));
    } finally {
      setChecking(false);
    }
  }

  function next() {
    setChoice(null);
    setTyped("");
    setReveal(null);
    setError(null);
    if (last) finish();
    else setIndex((i) => i + 1);
  }

  const canCheck = question.kind === "mcq" ? choice !== null : typed.trim().length > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-pencil">
        Problem {index + 1} of {questions.length}, {KIND_LABEL[question.kind].toLowerCase()}
      </p>
      <h2 className="mt-2 font-sans text-xl font-semibold leading-snug tracking-normal">
        <RichText text={question.question} />
      </h2>

      <div className="mt-5">
        {question.kind === "mcq" ? (
          <OptionList
            question={question}
            chosen={choice}
            onChoose={setChoice}
            correctIndex={reveal?.correctIndex}
            disabled={checking}
          />
        ) : (
          <div>
            <label htmlFor="practice-answer" className="field-label">
              {question.kind === "worked" ? "Work it out on paper, then type your final answer" : "Your answer"}
            </label>
            {question.kind === "worked" ? (
              <input
                id="practice-answer"
                className="field"
                autoComplete="off"
                value={typed}
                disabled={checking || reveal !== null}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCheck && !reveal) void check(typed);
                }}
              />
            ) : (
              <textarea
                id="practice-answer"
                className="field min-h-24"
                rows={3}
                value={typed}
                disabled={checking || reveal !== null}
                onChange={(e) => setTyped(e.target.value)}
              />
            )}
          </div>
        )}
      </div>

      {!reveal && (
        <p className="mt-3">
          <SourceLink passageId={question.passageId} className="link link-quiet text-sm">
            See where this comes from in your materials
          </SourceLink>
        </p>
      )}

      {!reveal && (
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="btn btn-ink btn-lg"
            disabled={!canCheck || checking}
            onClick={() => void check(question.kind === "mcq" ? String(choice) : typed)}
          >
            {checking ? "Checking…" : "Check my answer"}
          </button>
          {question.kind === "worked" && !checking && (
            <button type="button" className="link link-quiet" onClick={() => void check("")}>
              I&rsquo;m stuck, show me the steps
            </button>
          )}
        </div>
      )}
      {checking && question.kind !== "mcq" && <div className="working-line mt-3" />}
      {error && (
        <p role="alert" className="mt-3 text-redpen">
          {error}
        </p>
      )}

      {reveal && (
        <>
          <Reveal
            key={reveal.itemId}
            reveal={reveal}
            kind={question.kind}
            onFlagged={() => {
              // A problem the student says is wrong does not count either way.
              results.current.delete(question.id);
            }}
          />
          <button type="button" className="btn btn-ink btn-lg mt-6" onClick={next}>
            {last ? "Go to the check" : "Next problem"}
          </button>
        </>
      )}
    </div>
  );
}

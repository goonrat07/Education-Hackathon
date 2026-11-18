"use client";

import { useRef, useState } from "react";
import { FlagButton } from "@/components/flag-button";
import { RichText } from "@/components/rich-text";
import { SourceLink } from "@/components/source-panel";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import type { PublicFlashcard } from "@/lib/items";
import { useLoad } from "@/lib/use-load";
import type { ModeProps } from "./types";

/** A missed card comes back after this many other cards, sooner than the rest of the pile. */
const MISSED_COMES_BACK_AFTER = 3;

function Pile({
  sessionId,
  cards,
  onFinish,
}: {
  sessionId: string;
  cards: PublicFlashcard[];
  onFinish: ModeProps["onFinish"];
}) {
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  // First-try results per card: these are what the session reports.
  const firstTry = useRef(new Map<string, boolean>());

  const card = queue[0];

  function finish() {
    const results = [...firstTry.current.values()];
    onFinish({ itemsAttempted: results.length, itemsCorrect: results.filter(Boolean).length });
  }

  function show(next: PublicFlashcard[]) {
    setFlipped(false);
    setQueue(next);
    if (next.length === 0) finish();
  }

  function answer(knewIt: boolean) {
    if (!firstTry.current.has(card.id)) {
      firstTry.current.set(card.id, knewIt);
      // Remembered on the server so missed cards lead the next session too.
      void api(`/api/sessions/${sessionId}/items/${card.id}/result`, { body: { knewIt } }).catch(() => undefined);
    }
    const [first, ...rest] = queue;
    if (knewIt) return show(rest);
    // Missed: the card goes back into the pile a few cards down, not to the bottom.
    const position = Math.min(MISSED_COMES_BACK_AFTER, rest.length);
    show([...rest.slice(0, position), first, ...rest.slice(position)]);
  }

  function drop(cardId: string) {
    firstTry.current.delete(cardId);
    show(queue.filter((c) => c.id !== cardId));
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-xl">
        <p>No cards left in the pile.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm text-pencil" role="status">
        {plural(queue.length, "card")} left in the pile
      </p>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={
          flipped
            ? "Card, showing the answer. Flip back to the question."
            : "Card, showing the question. Flip to see the answer."
        }
        className="index-card mt-3 block min-h-64 w-full px-6 pb-8 pt-3 text-left"
      >
        <span className="block text-sm font-semibold text-pencil">{flipped ? "Answer" : "Question"}</span>
        <span className="mt-6 block text-xl leading-[1.9rem]">
          <RichText text={flipped ? card.back : card.front} />
        </span>
      </button>

      {flipped ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" className="btn btn-paper btn-lg" onClick={() => answer(false)}>
              Missed it
            </button>
            <button type="button" className="btn btn-ink btn-lg" onClick={() => answer(true)}>
              Knew it
            </button>
          </div>
          <p className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
            <SourceLink passageId={card.passageId} />
            <FlagButton key={card.id} itemId={card.id} onFlagged={() => setTimeout(() => drop(card.id), 900)} />
          </p>
        </>
      ) : (
        <button type="button" className="btn btn-ink btn-lg mt-4 w-full" onClick={() => setFlipped(true)}>
          Show the answer
        </button>
      )}
      <p className="mt-3 text-sm text-pencil">
        Say the answer in your head first, then flip. Missed cards come back sooner.
      </p>
    </div>
  );
}

/**
 * Flashcards. The student recalls the answer, flips the card, and says
 * whether they knew it. Cards they knew leave the pile; cards they missed
 * come back a few cards later until they know them.
 */
export function FlashcardsMode({ sessionId, onFinish }: ModeProps) {
  const { data, error, retry } = useLoad(sessionId, () =>
    api<{ flashcards: PublicFlashcard[] }>(`/api/sessions/${sessionId}/study`),
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
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-xl" aria-busy="true">
        <p>Writing your flashcards from your materials. The first time takes about half a minute.</p>
        <div className="working-line mt-3" />
      </div>
    );
  }
  return <Pile sessionId={sessionId} cards={data.flashcards} onFinish={onFinish} />;
}

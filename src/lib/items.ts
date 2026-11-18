/**
 * The shapes of generated study material. Shared by the server (which stores
 * and grades it) and the browser (which only ever receives the public views).
 */

export type ItemKind = "flashcard" | "mcq" | "short" | "worked";

export interface FlashcardContent {
  front: string;
  back: string;
}

export interface McqContent {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface ShortContent {
  question: string;
  /** The model answer the student's answer is graded against. */
  answer: string;
  explanation: string;
}

export interface WorkedContent {
  question: string;
  finalAnswer: string;
  steps: string[];
}

export type ItemContent = FlashcardContent | McqContent | ShortContent | WorkedContent;

export interface StoredItem {
  id: string;
  kind: ItemKind;
  content: unknown;
  passageId: string;
  quote: string;
}

/** What the browser gets before answering: the prompt, never the answer. */
export type PublicQuestion =
  | { id: string; kind: "mcq"; passageId: string; question: string; options: string[] }
  | { id: string; kind: "short"; passageId: string; question: string }
  | { id: string; kind: "worked"; passageId: string; question: string };

/** Flashcards are self-graded, so both sides go to the browser. */
export interface PublicFlashcard {
  id: string;
  kind: "flashcard";
  passageId: string;
  front: string;
  back: string;
  quote: string;
}

/** What the browser gets after answering. */
export interface AnswerReveal {
  itemId: string;
  correct: boolean;
  /** The correct answer, in words. */
  answer: string;
  /** Index of the correct option for multiple choice. */
  correctIndex?: number;
  explanation: string;
  /** Step-by-step solution for worked problems. */
  steps?: string[];
  /** Feedback on a typed answer. */
  feedback?: string;
  passageId: string;
  quote: string;
}

export function toPublicQuestion(item: StoredItem): PublicQuestion {
  const base = { id: item.id, passageId: item.passageId };
  if (item.kind === "mcq") {
    const c = item.content as McqContent;
    return { ...base, kind: "mcq", question: c.question, options: c.options };
  }
  if (item.kind === "short") {
    return { ...base, kind: "short", question: (item.content as ShortContent).question };
  }
  if (item.kind === "worked") {
    return { ...base, kind: "worked", question: (item.content as WorkedContent).question };
  }
  throw new Error(`Item ${item.id} is a ${item.kind}, not a question`);
}

export function toPublicFlashcard(item: StoredItem): PublicFlashcard {
  const c = item.content as FlashcardContent;
  return { id: item.id, kind: "flashcard", passageId: item.passageId, front: c.front, back: c.back, quote: item.quote };
}

/** The text a student reads first: used to avoid asking the same thing twice. */
export function promptText(kind: ItemKind, content: unknown): string {
  return kind === "flashcard" ? (content as FlashcardContent).front : (content as { question: string }).question;
}

/** The correct answer in words, for showing after an attempt. */
export function answerText(kind: ItemKind, content: unknown): string {
  switch (kind) {
    case "flashcard":
      return (content as FlashcardContent).back;
    case "mcq": {
      const c = content as McqContent;
      return c.options[c.correctIndex] ?? "";
    }
    case "short":
      return (content as ShortContent).answer;
    case "worked":
      return (content as WorkedContent).finalAnswer;
  }
}

import "server-only";
import { quoteInPassage, samePrompt } from "@/lib/grounding";
import {
  promptText,
  type FlashcardContent,
  type ItemKind,
  type McqContent,
  type ShortContent,
  type WorkedContent,
} from "@/lib/items";
import { runClaude, type AiContext } from "./client";
import {
  CHECK_INSTRUCTIONS,
  FLASHCARDS_INSTRUCTIONS,
  passagesBlock,
  PRACTICE_INSTRUCTIONS,
  type LabeledPassage,
} from "./prompts";
import { flashcardsSchema, problemsSchema } from "./schemas";

/** A generated card or question that is grounded in a passage but not yet verified. */
export interface Candidate {
  kind: ItemKind;
  content: FlashcardContent | McqContent | ShortContent | WorkedContent;
  passageId: string;
  quote: string;
}

interface TopicBrief {
  name: string;
  summary: string;
  type: string;
}

/** Small seeded generator so option order is random-looking but repeatable. */
function seededRandom(seedText: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffles options so the correct one is not where the model tends to put it. */
function shuffleOptions(
  question: string,
  options: string[],
  correctIndex: number,
): Pick<McqContent, "options" | "correctIndex"> {
  const random = seededRandom(question);
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { options: order.map((i) => options[i]), correctIndex: order.indexOf(correctIndex) };
}

/**
 * Keeps only candidates that cite a real passage of this topic with a quote
 * that is word for word in it, and that are not repeats.
 */
function grounded(
  raw: Array<{ candidate: Omit<Candidate, "passageId">; passage: string }>,
  labeled: LabeledPassage[],
  avoid: string[],
): Candidate[] {
  const byLabel = new Map(labeled.map((l) => [l.label.toLowerCase(), l.passage]));
  const seen = [...avoid];
  const kept: Candidate[] = [];
  for (const { candidate, passage: label } of raw) {
    const passage = byLabel.get(label.trim().toLowerCase());
    if (!passage) continue;
    if (!quoteInPassage(candidate.quote, passage.text)) continue;
    const prompt = promptText(candidate.kind, candidate.content);
    if (seen.some((s) => samePrompt(s, prompt))) continue;
    seen.push(prompt);
    kept.push({ ...candidate, passageId: passage.id });
  }
  return kept;
}

export async function generateFlashcards(
  ctx: AiContext,
  topic: TopicBrief,
  labeled: LabeledPassage[],
  avoid: string[],
  count: number,
): Promise<Candidate[]> {
  const result = await runClaude(
    ctx,
    "generate",
    [
      { type: "text", text: passagesBlock(labeled), cache_control: { type: "ephemeral" } },
      { type: "text", text: FLASHCARDS_INSTRUCTIONS(topic, count, avoid) },
    ],
    flashcardsSchema,
  );
  const raw = result.cards
    .map((card) => ({
      candidate: {
        kind: "flashcard" as const,
        content: { front: card.front.trim(), back: card.back.trim() },
        quote: card.quote.trim(),
      },
      passage: card.passage,
    }))
    .filter(({ candidate }) => candidate.content.front && candidate.content.back);
  return grounded(raw, labeled, avoid);
}

type RawProblem = (typeof problemsSchema)["_output"]["problems"][number];

/** Turns one generated problem into a candidate, or null when its shape is unusable. */
function toCandidate(p: RawProblem): Omit<Candidate, "passageId"> | null {
  const question = p.question.trim();
  const explanation = p.explanation.trim();
  const quote = p.quote.trim();
  if (!question) return null;

  if (p.kind === "mcq") {
    const options = p.options.map((o) => o.trim()).filter(Boolean);
    const distinct = new Set(options.map((o) => o.toLowerCase())).size === options.length;
    if (options.length !== 4 || !distinct || p.correctOption < 0 || p.correctOption >= options.length) return null;
    const shuffled = shuffleOptions(question, options, p.correctOption);
    return { kind: "mcq", content: { question, ...shuffled, explanation }, quote };
  }
  const answer = p.answer.trim();
  if (!answer) return null;
  if (p.kind === "short") {
    return { kind: "short", content: { question, answer, explanation }, quote };
  }
  const steps = p.steps.map((s) => s.trim()).filter(Boolean);
  if (steps.length < 2) return null;
  return { kind: "worked", content: { question, finalAnswer: answer, steps }, quote };
}

function problemCandidates(problems: RawProblem[], labeled: LabeledPassage[], avoid: string[]): Candidate[] {
  const raw = problems.flatMap((p) => {
    const candidate = toCandidate(p);
    return candidate ? [{ candidate, passage: p.passage }] : [];
  });
  return grounded(raw, labeled, avoid);
}

export async function generatePractice(
  ctx: AiContext,
  topic: TopicBrief,
  labeled: LabeledPassage[],
  avoid: string[],
  mix: { mcq: number; short: number; worked: number },
): Promise<Candidate[]> {
  const result = await runClaude(
    ctx,
    "generate",
    [
      { type: "text", text: passagesBlock(labeled), cache_control: { type: "ephemeral" } },
      { type: "text", text: PRACTICE_INSTRUCTIONS(topic, mix, avoid) },
    ],
    problemsSchema,
  );
  return problemCandidates(result.problems, labeled, avoid);
}

export async function generateCheckQuestions(
  ctx: AiContext,
  topic: TopicBrief,
  labeled: LabeledPassage[],
  avoid: string[],
  count: number,
): Promise<Candidate[]> {
  const result = await runClaude(
    ctx,
    "generate",
    [
      { type: "text", text: passagesBlock(labeled), cache_control: { type: "ephemeral" } },
      { type: "text", text: CHECK_INSTRUCTIONS(topic, count, avoid) },
    ],
    problemsSchema,
  );
  // A check is quick: multiple choice and short answers only.
  return problemCandidates(
    result.problems.filter((p) => p.kind !== "worked"),
    labeled,
    avoid,
  );
}

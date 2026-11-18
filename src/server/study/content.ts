import "server-only";
import {
  AI_BACKGROUND_RESERVE,
  AI_DAILY_CALL_LIMIT,
  CHECK_QUESTIONS_REQUESTED,
  FLASHCARDS_PER_TOPIC,
  MIN_FLASHCARDS,
  MIN_PRACTICE_PROBLEMS,
  PRACTICE_MIX,
} from "@/config/ai";
import { CHECK_MIN_QUESTIONS, CHECK_TARGET_QUESTIONS } from "@/config/study";
import type { ItemKind } from "@/lib/items";
import { isModeId, type ModeId } from "@/lib/modes";
import { AiOutputError, type AiContext } from "@/server/ai/client";
import { generateCheckQuestions, generateFlashcards, generatePractice, type Candidate } from "@/server/ai/generate";
import { labelPassages } from "@/server/ai/prompts";
import { keepVerified } from "@/server/ai/verify";
import {
  createCheckSet,
  findReadyCheckSet,
  insertStudyItems,
  listCheckSetItems,
  listPromptTexts,
  listStudyItems,
  type Item,
} from "@/server/data/items";
import { notTriedLately, onlyOnce } from "@/server/data/locks";
import { listTopicPassages } from "@/server/data/passages";
import { getTopic, type Topic } from "@/server/data/topics";
import { hasBackgroundHeadroom } from "@/server/data/usage";
import { NoMaterialError } from "@/server/errors";

/** Which kinds of item each mode studies. */
export const KINDS_FOR_MODE: Record<ModeId, ItemKind[]> = {
  flashcards: ["flashcard"],
  practice: ["mcq", "short", "worked"],
};

async function topicPassages(ctx: AiContext, topic: Topic) {
  const passages = await listTopicPassages(ctx.userId, topic.id);
  if (passages.length === 0) throw new NoMaterialError(topic.name);
  return labelPassages(passages);
}

/** A topic never holds more practice problems than this; after that, old ones are reused. */
const MAX_PRACTICE_PER_TOPIC = 24;

/** A topic that came up short is asked for more at most this often, not on every visit. */
const TOP_UP_WAIT_SECONDS = 12 * 60 * 60;

/**
 * Makes sure a topic has study material for a mode, writing and verifying it
 * when needed, and returns the topic's active items.
 *
 * Flashcards are written once. Practice problems are topped up when the
 * student has already got nearly all of them right, so a review session has
 * something new to work on. A topic that has a little material but cannot
 * get more (thin passages, Claude unreachable) is studied with what it has:
 * only a topic with nothing at all fails.
 */
export async function ensureStudyItems(ctx: AiContext, topic: Topic, mode: ModeId): Promise<Item[]> {
  const kinds = KINDS_FOR_MODE[mode];
  const minimum = mode === "flashcards" ? MIN_FLASHCARDS : MIN_PRACTICE_PROBLEMS;
  const current = () => listStudyItems(ctx.userId, topic.id, kinds);

  const enoughAlready = async (): Promise<Item[] | null> => {
    const existing = await current();
    const stillToLearn =
      mode === "flashcards" ? existing.length : existing.filter((i) => i.lastResult !== "correct").length;
    if (stillToLearn >= minimum) return existing;
    const full = mode === "flashcards" || existing.length >= MAX_PRACTICE_PER_TOPIC;
    return existing.length >= minimum && full ? existing : null;
  };

  return onlyOnce(ctx.userId, `study:${topic.id}:${mode}`, enoughAlready, async () => {
    const existing = await current();
    // A topic that came up short once usually will again, so it is asked for more only now and then.
    const topUpDue = () => notTriedLately(ctx.userId, `top-up:${topic.id}:${mode}`, TOP_UP_WAIT_SECONDS);
    if (existing.length > 0 && !(await topUpDue())) return existing;

    try {
      const labeled = await topicPassages(ctx, topic);
      const avoid = await listPromptTexts(ctx.userId, topic.id);
      const candidates =
        mode === "flashcards"
          ? await generateFlashcards(ctx, topic, labeled, avoid, FLASHCARDS_PER_TOPIC)
          : await generatePractice(ctx, topic, labeled, avoid, PRACTICE_MIX);
      const verified = await keepVerified(ctx, labeled, candidates);
      await insertStudyItems(ctx.userId, topic.testId, topic.id, verified);
    } catch (error) {
      // Writing more failed. If there is already something to study, study that.
      if (existing.length === 0) throw error;
      console.warn(`Could not write more study material for topic ${topic.id}`, error);
      return existing;
    }

    const items = await current();
    if (items.length === 0) {
      throw new AiOutputError(
        `Nothing could be written for "${topic.name}" from your materials. It may be too small a topic to study on its own: merge it into a related topic, add a file that covers it, or delete it.`,
      );
    }
    return items;
  });
}

/**
 * Makes sure a topic has an unused check ready: 3 to 5 verified questions the
 * student has not seen. Returns the set's id.
 */
export async function ensureCheckSet(ctx: AiContext, topic: Topic): Promise<string> {
  const readySet = async (): Promise<string | null> => {
    const ready = await findReadyCheckSet(ctx.userId, topic.id);
    if (!ready) return null;
    const items = await listCheckSetItems(ctx.userId, ready);
    return items.filter((i) => i.status === "active").length >= CHECK_MIN_QUESTIONS ? ready : null;
  };

  return onlyOnce(ctx.userId, `check:${topic.id}`, readySet, async () => {
    const labeled = await topicPassages(ctx, topic);
    const avoid = await listPromptTexts(ctx.userId, topic.id);
    let verified: Candidate[] = [];
    // One retry: a second batch must also avoid the questions the first one produced.
    for (let attempt = 0; attempt < 2 && verified.length < CHECK_MIN_QUESTIONS; attempt++) {
      const seen = [...avoid, ...verified.map((c) => (c.content as { question: string }).question)];
      const candidates = await generateCheckQuestions(ctx, topic, labeled, seen, CHECK_QUESTIONS_REQUESTED);
      verified = [...verified, ...(await keepVerified(ctx, labeled, candidates))];
    }
    if (verified.length < CHECK_MIN_QUESTIONS) {
      throw new AiOutputError(
        `New check questions could not be written for "${topic.name}". If this keeps happening, the topic may be too small: merge it into a related one.`,
      );
    }
    return createCheckSet(ctx.userId, topic.testId, topic.id, verified.slice(0, CHECK_TARGET_QUESTIONS));
  });
}

/**
 * Writes a topic's next check before the student needs it, so it opens
 * instantly. Best effort: it is skipped when the student is close to the
 * day's limit (those calls are kept for answering and grading), and a failure
 * here is not an error, because the check is written on demand anyway.
 */
export async function prepareCheckAhead(ctx: AiContext, topicId: string | null): Promise<void> {
  if (!topicId) return;
  try {
    const budget = { limit: AI_DAILY_CALL_LIMIT, reserve: AI_BACKGROUND_RESERVE };
    if (!(await hasBackgroundHeadroom(ctx.userId, ctx.today, budget))) return;
    const topic = await getTopic(ctx.userId, topicId);
    if (topic && topic.level < 3) await ensureCheckSet(ctx, topic);
  } catch (error) {
    console.warn("Could not prepare a check ahead of time", error);
  }
}

/**
 * Gets a session's material ready while the student is still on its first
 * screen: the delayed check on an earlier topic, then the cards or problems,
 * then the check that ends the session.
 *
 * The order matters. A check has to be made of questions the student has not
 * seen, so the end check is written only once this session's study material
 * exists and can be listed as "already seen". Written the other way round,
 * the check repeated the very problems the student had just practiced.
 */
export async function prepareSessionAhead(
  ctx: AiContext,
  session: { topicId: string; mode: string; delayedTopicId: string | null },
): Promise<void> {
  await prepareCheckAhead(ctx, session.delayedTopicId);
  try {
    const topic = await getTopic(ctx.userId, session.topicId);
    if (!topic || !isModeId(session.mode)) return;
    await ensureStudyItems(ctx, topic, session.mode);
  } catch (error) {
    // The student's own request for the cards or problems reports this; no check is written blind.
    console.warn("Could not prepare study material ahead of time", error);
    return;
  }
  await prepareCheckAhead(ctx, session.topicId);
}

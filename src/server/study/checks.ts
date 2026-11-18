import "server-only";
import type { Level } from "@/config/study";
import {
  answerText,
  toPublicQuestion,
  type AnswerReveal,
  type McqContent,
  type PublicQuestion,
  type ShortContent,
  type WorkedContent,
} from "@/lib/items";
import { checkPassed, nextLevel } from "@/lib/levels";
import { gradeAnswers, type ToGrade } from "@/server/ai/grade";
import {
  excludeCheckAnswer,
  findSessionCheck,
  getCheck,
  listCheckAnswers,
  openCheck,
  submitCheckResult,
  type Check,
} from "@/server/data/checks";
import { claimCheckSet, flagItem, listCheckSetItems, type Item } from "@/server/data/items";
import { onlyOnce } from "@/server/data/locks";
import { listTopicPassages } from "@/server/data/passages";
import { getSession, markCheckUnavailable } from "@/server/data/sessions";
import { AiCeilingError, AiLimitError } from "@/server/data/usage";
import { getTopic, setTopicLevel } from "@/server/data/topics";
import { AiBusyError, AiInputError, AiOutputError, AiRefusalError, AiUnavailableError } from "@/server/ai/client";
import { InvalidRequestError, NoMaterialError, NotFoundError } from "@/server/errors";
import type { UserContext } from "@/server/session";
import { ensureCheckSet } from "./content";

export interface CheckReveal extends AnswerReveal {
  /** What the student answered. */
  response: string;
  /** True when the student flagged the question as wrong; it does not count. */
  excluded: boolean;
}

export interface CheckOutcome {
  checkId: string;
  kind: "session" | "delayed";
  topicId: string;
  topicName: string;
  /** Questions that counted. */
  scored: number;
  correct: number;
  passed: boolean;
  levelBefore: Level;
  levelAfter: Level;
  reveals: CheckReveal[];
}

export interface CheckView {
  checkId: string;
  kind: "session" | "delayed";
  topicId: string;
  topicName: string;
  questions: PublicQuestion[];
  /** Present when this check was already submitted. */
  outcome: CheckOutcome | null;
}

function reveal(item: Item, response: string, correct: boolean, feedback: string, excluded: boolean): CheckReveal {
  const base = {
    itemId: item.id,
    correct,
    answer: answerText(item.kind, item.content),
    feedback,
    passageId: item.passageId,
    quote: item.quote,
    response,
    excluded,
  };
  if (item.kind === "mcq") {
    const c = item.content as McqContent;
    return { ...base, correctIndex: c.correctIndex, explanation: c.explanation };
  }
  if (item.kind === "worked") {
    const c = item.content as WorkedContent;
    return { ...base, explanation: "", steps: c.steps };
  }
  return { ...base, explanation: (item.content as ShortContent).explanation };
}

async function outcomeOf(userId: string, check: Check, topicName: string): Promise<CheckOutcome> {
  const [items, answers] = await Promise.all([
    listCheckSetItems(userId, check.checkSetId),
    listCheckAnswers(userId, check.id),
  ]);
  const byItem = new Map(answers.map((a) => [a.itemId, a]));
  return {
    checkId: check.id,
    kind: check.kind,
    topicId: check.topicId,
    topicName,
    scored: check.scored ?? 0,
    correct: check.correct ?? 0,
    passed: check.passed ?? false,
    levelBefore: (check.levelBefore ?? 0) as Level,
    levelAfter: (check.levelAfter ?? 0) as Level,
    reveals: items.map((item) => {
      const a = byItem.get(item.id);
      return reveal(item, a?.response ?? "", a?.correct ?? false, a?.feedback ?? "", a?.excluded ?? false);
    }),
  };
}

/**
 * True for failures the student cannot fix by answering differently: the
 * check could not be written or graded at all (Claude unreachable, busy, out
 * of the day's requests, or with nothing usable to say; no materials left).
 */
function blocksCheck(error: unknown): boolean {
  return (
    error instanceof AiLimitError ||
    error instanceof AiCeilingError ||
    error instanceof AiUnavailableError ||
    error instanceof AiBusyError ||
    error instanceof AiRefusalError ||
    error instanceof AiOutputError ||
    error instanceof AiInputError ||
    error instanceof NoMaterialError
  );
}

/**
 * Opens (or reopens) one of a session's checks: the delayed check on an
 * earlier topic at the start, or the check on the session's own topic at the end.
 * Questions are sent without answers.
 *
 * When the end check cannot be produced, the session is marked so that it can
 * still be finished (without a check, and so without any level change).
 */
export async function openSessionCheck(
  user: UserContext,
  sessionId: string,
  kind: "session" | "delayed",
): Promise<CheckView> {
  try {
    return await openCheckView(user, sessionId, kind);
  } catch (error) {
    if (kind === "session" && blocksCheck(error)) await markCheckUnavailable(user.userId, sessionId);
    throw error;
  }
}

async function openCheckView(user: UserContext, sessionId: string, kind: "session" | "delayed"): Promise<CheckView> {
  const session = await getSession(user.userId, sessionId);
  if (!session) throw new NotFoundError("Session not found");
  const topicId = kind === "delayed" ? session.delayedTopicId : session.topicId;
  if (!topicId) throw new InvalidRequestError("This session has no delayed check.");
  const topic = await getTopic(user.userId, topicId);
  if (!topic) throw new NotFoundError("Topic not found");

  // Two requests for the same check (a double tap, a retry) must end up with one check and one set.
  const check = await onlyOnce(
    user.userId,
    `open-check:${sessionId}:${kind}`,
    () => findSessionCheck(user.userId, sessionId, kind),
    async () => {
      if (session.status !== "active") throw new InvalidRequestError("This session is already finished.");
      // Claim a ready set; if another check took it first, get the next one.
      let setId = await ensureCheckSet(user, topic);
      for (let attempt = 0; attempt < 3 && !(await claimCheckSet(user.userId, setId)); attempt++) {
        setId = await ensureCheckSet(user, topic);
      }
      return openCheck(user.userId, {
        testId: session.testId,
        topicId,
        sessionId,
        checkSetId: setId,
        kind,
        localDate: user.today,
      });
    },
  );

  const items = await listCheckSetItems(user.userId, check.checkSetId);
  return {
    checkId: check.id,
    kind,
    topicId,
    topicName: topic.name,
    questions: items.map(toPublicQuestion),
    outcome: check.status === "submitted" ? await outcomeOf(user.userId, check, topic.name) : null,
  };
}

export interface SubmittedAnswer {
  itemId: string;
  /** Option index for multiple choice, typed text otherwise. */
  response: string;
  /** "This is wrong": leave the question out of the score. */
  flagged?: boolean;
}

/**
 * Grades a check and applies the level rules. Multiple choice is graded by
 * comparing the option; typed answers by Claude against the model answer.
 */
export async function submitCheck(
  user: UserContext,
  checkId: string,
  submitted: SubmittedAnswer[],
): Promise<CheckOutcome> {
  const check = await getCheck(user.userId, checkId);
  if (!check) throw new NotFoundError("Check not found");
  const topic = await getTopic(user.userId, check.topicId);
  if (!topic) throw new NotFoundError("Topic not found");
  if (check.status === "submitted") return outcomeOf(user.userId, check, topic.name);

  const items = await listCheckSetItems(user.userId, check.checkSetId);
  const byItem = new Map(submitted.map((a) => [a.itemId, a]));

  const typed: ToGrade[] = [];
  for (const item of items) {
    const answer = byItem.get(item.id);
    if (item.kind === "mcq" || answer?.flagged) continue;
    typed.push({
      id: item.id,
      question: (item.content as ShortContent).question,
      modelAnswer: answerText(item.kind, item.content),
      studentAnswer: answer?.response ?? "",
    });
  }
  let grades = new Map<string, { correct: boolean; feedback: string }>();
  if (typed.length > 0) {
    try {
      grades = await gradeAnswers(user, await listTopicPassages(user.userId, topic.id), typed);
    } catch (error) {
      // The answers could not be graded: the session may be finished without this check.
      if (check.kind === "session" && check.sessionId && blocksCheck(error)) {
        await markCheckUnavailable(user.userId, check.sessionId);
      }
      throw error;
    }
  }

  const answers = items.map((item) => {
    const answer = byItem.get(item.id);
    const response = (answer?.response ?? "").slice(0, 2000);
    const excluded = Boolean(answer?.flagged);
    let correct = false;
    let feedback = "";
    if (item.kind === "mcq") {
      correct = response !== "" && Number(response) === (item.content as McqContent).correctIndex;
    } else if (!excluded) {
      const grade = grades.get(item.id);
      correct = grade?.correct ?? false;
      feedback = grade?.feedback ?? "";
    }
    return { itemId: item.id, response, correct: excluded ? false : correct, feedback, excluded };
  });

  const scored = answers.filter((a) => !a.excluded).length;
  const correct = answers.filter((a) => !a.excluded && a.correct).length;
  const passed = checkPassed(correct, scored);
  const levelBefore = topic.level as Level;
  const levelAfter = nextLevel(levelBefore, topic.levelSince, { kind: check.kind, passed, takenOn: user.today });

  const recorded = await submitCheckResult(user.userId, checkId, {
    answers,
    scored,
    correct,
    passed,
    levelBefore,
    levelAfter,
  });
  if (recorded) {
    if (levelAfter !== levelBefore) await setTopicLevel(user.userId, topic.id, levelAfter, user.today);
    for (const a of answers) {
      if (a.excluded) await flagItem(user.userId, a.itemId, null);
    }
  }
  const saved = await getCheck(user.userId, checkId);
  return outcomeOf(user.userId, saved ?? check, topic.name);
}

/**
 * "This is wrong" on a question after a check was graded: the question stops
 * counting and the result is recalculated. This can turn a fail into a pass
 * (and then raises the level), but it never takes a level away.
 */
export async function disputeCheckAnswer(
  user: UserContext,
  checkId: string,
  itemId: string,
  note: string | null,
): Promise<CheckOutcome> {
  const check = await getCheck(user.userId, checkId);
  if (!check || check.status !== "submitted") throw new NotFoundError("Check not found");
  const topic = await getTopic(user.userId, check.topicId);
  if (!topic) throw new NotFoundError("Topic not found");
  const answers = await listCheckAnswers(user.userId, checkId);
  const target = answers.find((a) => a.itemId === itemId);
  if (!target) throw new NotFoundError("Question not found in this check");

  if (!target.excluded) {
    const remaining = answers.filter((a) => !a.excluded && a.itemId !== itemId);
    const scored = remaining.length;
    const correct = remaining.filter((a) => a.correct).length;
    const passed = checkPassed(correct, scored);
    const wasPassed = check.passed ?? false;
    let levelAfter = (check.levelAfter ?? topic.level) as Level;
    if (passed && !wasPassed) {
      // The check now counts as passed: apply the level rule as of today.
      levelAfter = nextLevel(topic.level as Level, topic.levelSince, {
        kind: check.kind,
        passed: true,
        takenOn: user.today,
      });
      if (levelAfter !== topic.level) await setTopicLevel(user.userId, topic.id, levelAfter, user.today);
    }
    await excludeCheckAnswer(user.userId, checkId, itemId, {
      scored,
      correct,
      // A pass that already raised the level stays a pass.
      passed: wasPassed || passed,
      levelAfter,
    });
    await flagItem(user.userId, itemId, note);
  }
  const saved = await getCheck(user.userId, checkId);
  return outcomeOf(user.userId, saved ?? check, topic.name);
}

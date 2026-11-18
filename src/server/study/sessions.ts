import "server-only";
import type { Level, TopicType } from "@/config/study";
import {
  answerText,
  toPublicFlashcard,
  toPublicQuestion,
  type AnswerReveal,
  type McqContent,
  type PublicFlashcard,
  type PublicQuestion,
  type ShortContent,
  type WorkedContent,
} from "@/lib/items";
import { biggestGaps, confidenceGap, pickDelayedCheckTopic, type CheckScore } from "@/lib/levels";
import { isModeId, MODES, modeForType, type ModeId } from "@/lib/modes";
import { gradeAnswers } from "@/server/ai/grade";
import { listSessionChecks } from "@/server/data/checks";
import { getItem, recordItemResult, type Item } from "@/server/data/items";
import { listTopicPassages } from "@/server/data/passages";
import {
  findActiveSession,
  getSession,
  saveSessionRecord,
  startSession,
  type StudySession,
} from "@/server/data/sessions";
import { getTopic, updateTopic } from "@/server/data/topics";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import type { UserContext } from "@/server/session";
import { ensureStudyItems } from "./content";
import { getPlanView } from "./plans";
import type { TestState } from "./state";

/** How many items one session works through. */
const FLASHCARDS_PER_SESSION = 12;
const PROBLEMS_PER_SESSION = 6;

/**
 * Starts a session on a topic: one topic, one mode. If a session on this
 * topic is already under way today, that one is returned instead.
 */
export async function beginSession(user: UserContext, testId: string, topicId: string): Promise<StudySession> {
  const view = await getPlanView(user.userId, testId, user.today);
  const topic = view?.state.topics.find((t) => t.id === topicId);
  if (!view || !topic) throw new NotFoundError("Topic not found");

  const underWay = await findActiveSession(user.userId, topicId, user.today);
  if (underWay) return underWay;

  const mode = modeForType(topic.type);
  const plannedToday = view.plan.days.find((d) => d.date === user.today)?.sessions.find((s) => s.topicId === topicId);
  return startSession(user.userId, {
    testId,
    topicId,
    mode,
    startedAt: new Date(),
    localDate: user.today,
    plannedMinutes: plannedToday?.minutes ?? MODES[mode].minutes,
    readinessBefore: view.state.readiness,
    // A topic studied on an earlier day gets its delayed check at the start of this session.
    delayedTopicId: pickDelayedCheckTopic(view.state.topics, user.today, topicId),
  });
}

export interface StudyDeck {
  mode: ModeId;
  flashcards: PublicFlashcard[];
  questions: PublicQuestion[];
}

/** Missed items first, then ones never seen, then the ones seen longest ago. */
function studyOrder(items: Item[]): Item[] {
  const rank = (i: Item) => (i.lastResult === "missed" ? 0 : i.timesSeen === 0 ? 1 : 2);
  const seenAt = (i: Item) => i.lastSeenAt?.getTime() ?? 0;
  return [...items].sort(
    (a, b) => rank(a) - rank(b) || seenAt(a) - seenAt(b) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
}

/** The cards or problems for a session, writing them first if the topic has none yet. */
export async function getStudyDeck(user: UserContext, sessionId: string): Promise<StudyDeck> {
  const session = await getSession(user.userId, sessionId);
  if (!session) throw new NotFoundError("Session not found");
  const topic = await getTopic(user.userId, session.topicId);
  if (!topic) throw new NotFoundError("Topic not found");
  if (!isModeId(session.mode)) throw new InvalidRequestError(`Unknown study mode "${session.mode}".`);

  const items = studyOrder(await ensureStudyItems(user, topic, session.mode));
  if (session.mode === "flashcards") {
    return {
      mode: "flashcards",
      flashcards: items.slice(0, FLASHCARDS_PER_SESSION).map(toPublicFlashcard),
      questions: [],
    };
  }
  return {
    mode: "practice",
    flashcards: [],
    questions: items.slice(0, PROBLEMS_PER_SESSION).map(toPublicQuestion),
  };
}

async function studyItemOf(user: UserContext, sessionId: string, itemId: string): Promise<Item> {
  const [session, item] = await Promise.all([getSession(user.userId, sessionId), getItem(user.userId, itemId)]);
  if (!session || !item || item.topicId !== session.topicId || item.role !== "study") {
    throw new NotFoundError("Item not found");
  }
  return item;
}

/** Records whether the student knew a flashcard, so missed cards come back sooner. */
export async function recordFlashcard(
  user: UserContext,
  sessionId: string,
  itemId: string,
  knewIt: boolean,
): Promise<void> {
  const item = await studyItemOf(user, sessionId, itemId);
  await recordItemResult(user.userId, item.id, knewIt);
}

/**
 * Grades a practice problem and returns the answer, the explanation or
 * worked steps, and where in the student's materials it came from.
 */
export async function answerStudyItem(
  user: UserContext,
  sessionId: string,
  itemId: string,
  response: string,
): Promise<AnswerReveal> {
  const item = await studyItemOf(user, sessionId, itemId);
  const typed = response.trim().slice(0, 2000);
  const base = { itemId: item.id, passageId: item.passageId, quote: item.quote, answer: answerText(item.kind, item.content) };

  if (item.kind === "mcq") {
    const c = item.content as McqContent;
    const correct = typed !== "" && Number(typed) === c.correctIndex;
    await recordItemResult(user.userId, item.id, correct);
    return { ...base, correct, correctIndex: c.correctIndex, explanation: c.explanation };
  }
  if (item.kind === "flashcard") throw new InvalidRequestError("Flashcards are not graded this way.");

  const question = (item.content as ShortContent | WorkedContent).question;
  const grades = await gradeAnswers(user, await listTopicPassages(user.userId, item.topicId), [
    { id: item.id, question, modelAnswer: base.answer, studentAnswer: typed },
  ]);
  const grade = grades.get(item.id) ?? { correct: false, feedback: "" };
  await recordItemResult(user.userId, item.id, grade.correct);

  if (item.kind === "worked") {
    return { ...base, correct: grade.correct, explanation: "", steps: (item.content as WorkedContent).steps, feedback: grade.feedback };
  }
  return { ...base, correct: grade.correct, explanation: (item.content as ShortContent).explanation, feedback: grade.feedback };
}

// ───────────────────────── progress ─────────────────────────

export interface ProgressRow {
  topicId: string;
  name: string;
  type: TopicType;
  level: Level;
  confidence: number | null;
  latestCheck: CheckScore | null;
  /** Confidence minus latest check, -1 to 1. Positive means overconfident. */
  gap: number | null;
}

export interface Progress {
  readiness: number;
  rows: ProgressRow[];
  /** The topics where confidence and the latest check disagree most. */
  gaps: ProgressRow[];
}

/** Level, confidence and latest check for every topic of a test, with the biggest gaps picked out. */
export function progressOf(state: TestState): Progress {
  const rows: ProgressRow[] = state.topics.map((t) => {
    const latest = t.latestCheck && t.latestCheck.scored > 0 ? { correct: t.latestCheck.correct, scored: t.latestCheck.scored } : null;
    return {
      topicId: t.id,
      name: t.name,
      type: t.type,
      level: t.level,
      confidence: t.confidence,
      latestCheck: latest,
      gap: confidenceGap(t.confidence, latest),
    };
  });
  const flagged = new Set(
    biggestGaps(rows.map((r) => ({ topicId: r.topicId, confidence: r.confidence, latest: r.latestCheck }))).map(
      (g) => g.topicId,
    ),
  );
  // biggestGaps returns them largest first; keep that order.
  const gaps = [...flagged].map((id) => rows.find((r) => r.topicId === id)!);
  return { readiness: state.readiness, rows, gaps };
}

export interface Movement {
  topicId: string;
  topicName: string;
  kind: "session" | "delayed";
  levelBefore: Level;
  levelAfter: Level;
  correct: number;
  scored: number;
  passed: boolean;
}

export interface NextSession {
  testId: string;
  topicId: string;
  topicName: string;
  mode: ModeId;
  minutes: number;
  kind: "learn" | "review";
}

export interface SessionSummary extends Progress {
  testId: string;
  testName: string;
  topicId: string;
  topicName: string;
  /** What each check in this session did to its topic's level. */
  movements: Movement[];
  readinessBefore: number;
  readinessAfter: number;
  /** The next session in today's updated plan for this test, if any. */
  next: NextSession | null;
  /** Sessions left in today's plan after this one. */
  remainingToday: number;
}

/** What a finished (or just-checked) session changed: levels, readiness and what is next. */
export async function summarizeSession(user: UserContext, sessionId: string): Promise<SessionSummary> {
  const session = await getSession(user.userId, sessionId);
  if (!session) throw new NotFoundError("Session not found");
  const view = await getPlanView(user.userId, session.testId, user.today);
  if (!view) throw new NotFoundError("Test not found");
  const names = new Map(view.state.topics.map((t) => [t.id, t.name]));

  const checks = (await listSessionChecks(user.userId, sessionId)).filter((c) => c.status === "submitted");
  const movements: Movement[] = checks.map((c) => ({
    topicId: c.topicId,
    topicName: names.get(c.topicId) ?? "",
    kind: c.kind,
    levelBefore: (c.levelBefore ?? 0) as Level,
    levelAfter: (c.levelAfter ?? 0) as Level,
    correct: c.correct ?? 0,
    scored: c.scored ?? 0,
    passed: c.passed ?? false,
  }));

  const today = view.plan.days.find((d) => d.date === user.today);
  const upNext = today?.sessions[0];
  return {
    ...progressOf(view.state),
    testId: session.testId,
    testName: view.state.test.name,
    topicId: session.topicId,
    topicName: names.get(session.topicId) ?? "",
    movements,
    readinessBefore: session.readinessBefore,
    readinessAfter: view.state.readiness,
    next: upNext
      ? {
          testId: session.testId,
          topicId: upNext.topicId,
          topicName: names.get(upNext.topicId) ?? "",
          mode: upNext.mode,
          minutes: upNext.minutes,
          kind: upNext.kind,
        }
      : null,
    remainingToday: today?.sessions.length ?? 0,
  };
}

/**
 * Finishes a session: saves the session record, stores the student's new
 * confidence rating, and reports what moved. The end-of-session check has to
 * be submitted first, because every session ends with one.
 */
export async function completeSession(
  user: UserContext,
  sessionId: string,
  input: { itemsAttempted: number; itemsCorrect: number; confidence: number },
): Promise<SessionSummary> {
  const session = await getSession(user.userId, sessionId);
  if (!session) throw new NotFoundError("Session not found");

  if (session.status === "active") {
    const checks = await listSessionChecks(user.userId, sessionId);
    if (!checks.some((c) => c.kind === "session" && c.status === "submitted")) {
      throw new InvalidRequestError("Finish the check at the end of the session first.");
    }
    const durationSeconds = Math.min(86_400, Math.max(0, Math.round((Date.now() - session.startedAt.getTime()) / 1000)));
    await saveSessionRecord(sessionId, {
      userId: user.userId,
      testId: session.testId,
      topicId: session.topicId,
      mode: session.mode,
      startedAt: session.startedAt,
      durationSeconds,
      itemsAttempted: input.itemsAttempted,
      itemsCorrect: input.itemsCorrect,
      score: input.itemsAttempted > 0 ? input.itemsCorrect / input.itemsAttempted : 0,
      confidence: input.confidence,
    });
    await updateTopic(user.userId, session.topicId, { confidence: input.confidence });
  }
  return summarizeSession(user, sessionId);
}

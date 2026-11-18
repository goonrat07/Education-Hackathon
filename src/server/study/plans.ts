import "server-only";
import { LEVEL_NAMES } from "@/config/study";
import { longDate } from "@/lib/format";
import { MODES } from "@/lib/modes";
import { buildPlan, planHash, type Plan } from "@/lib/plan";
import { explainPlan } from "@/server/ai/explain";
import type { AiContext } from "@/server/ai/client";
import {
  getStoredPlan,
  storeExplanation,
  storePlan,
} from "@/server/data/plans";
import { getTest, updateTest } from "@/server/data/tests";
import { listTopics, updateTopic } from "@/server/data/topics";
import { InvalidRequestError, NotFoundError } from "@/server/errors";
import { loadTestState, toPlanInput, type TestState } from "./state";

export interface PlanView {
  state: TestState;
  plan: Plan;
  hash: string;
  /** Set on the day a rebuild found planned sessions left undone on earlier days. */
  missed: { sessions: number; on: string } | null;
  /** The explanation written for exactly this plan, when there is one. */
  explanation: string | null;
}

/**
 * Builds today's plan for a test. The plan is always computed fresh from the
 * current state, so it is already up to date after a session or a missed day.
 * The last plan shown is kept only to notice what was missed.
 */
export async function getPlanView(
  userId: string,
  testId: string,
  today: string,
): Promise<PlanView | null> {
  const state = await loadTestState(userId, testId, today);
  if (!state) return null;
  const plan = buildPlan(toPlanInput(state, today));
  const hash = planHash(plan);
  const stored = await getStoredPlan(userId, testId);

  let missedOn = stored?.missedOn ?? null;
  let missedSessions = stored?.missedSessions ?? 0;
  if (stored && stored.computedOn < today) {
    // A new day. The stored plan is refreshed after every session, so the
    // sessions it still lists on earlier days are the ones that were not done.
    let skipped = 0;
    for (const day of (stored.plan as Plan).days) {
      if (day.date >= stored.computedOn && day.date < today)
        skipped += day.sessions.length;
    }
    missedOn = skipped > 0 ? today : null;
    missedSessions = skipped;
  }
  if (missedOn !== today) {
    missedOn = null;
    missedSessions = 0;
  }

  const changed =
    !stored ||
    stored.planHash !== hash ||
    stored.computedOn !== today ||
    stored.missedOn !== missedOn ||
    stored.missedSessions !== missedSessions;
  if (changed) {
    await storePlan(userId, testId, {
      plan,
      planHash: hash,
      computedOn: today,
      missedOn,
      missedSessions,
    });
  }

  return {
    state,
    plan,
    hash,
    missed: missedOn ? { sessions: missedSessions, on: missedOn } : null,
    explanation:
      stored && stored.explanationHash === hash ? stored.explanation : null,
  };
}

/**
 * The facts Claude is given to explain a plan: names and numbers, nothing it
 * could change. Days with nothing planned are counted rather than listed, so
 * a test months away does not send hundreds of empty days.
 */
export function explanationFacts(view: PlanView, today: string) {
  const name = new Map(view.state.topics.map((t) => [t.id, t.name]));
  const { plan, state } = view;
  const studyDays = plan.days.filter((d) => !d.isTestDay);
  return {
    className: state.test.className,
    testName: state.test.name,
    // Dates are written out ("Wednesday, November 18") so the explanation reads the way a student talks.
    today: longDate(today),
    testDate: longDate(state.test.testDate),
    minutesPerDay: state.test.minutesPerDay,
    studyDays: studyDays.length,
    studyDaysWithNothingPlanned: studyDays.filter(
      (d) => d.sessions.length === 0,
    ).length,
    topics: state.topics.map((t) => ({
      name: t.name,
      type: t.type,
      level: LEVEL_NAMES[t.level],
      confidenceOutOf5: t.confidence,
      latestCheck: t.latestCheck
        ? `${t.latestCheck.correct} of ${t.latestCheck.scored}`
        : "none yet",
      sessionsDone: t.sessionsDone,
    })),
    days: plan.days
      .filter((d) => d.sessions.length > 0 || d.isTestDay)
      .map((d) => ({
        date: longDate(d.date),
        isTestDay: d.isTestDay,
        sessions: d.sessions.map((s) => ({
          topic: name.get(s.topicId),
          mode: MODES[s.mode].label,
          minutes: s.minutes,
          kind: s.kind === "learn" ? "first session" : "review",
        })),
      })),
    shortage: plan.shortage
      ? {
          kind:
            plan.shortage.kind === "coverage"
              ? "not every topic fits before the test"
              : "every topic is covered once, but not every topic gets a review",
          minutesAvailable: plan.shortage.minutesAvailable,
          minutesWanted: plan.shortage.minutesWanted,
          topicsLeftOut: plan.shortage.uncovered.map((id) => name.get(id)),
          topicsWithoutReview: plan.shortage.unreviewed.map((id) =>
            name.get(id),
          ),
          prioritized: plan.shortage.prioritized.map((id) => name.get(id)),
        }
      : null,
  };
}

/** Returns the explanation for the current plan, writing a new one only when the plan has changed. */
export async function ensureExplanation(
  ctx: AiContext,
  testId: string,
): Promise<string | null> {
  const view = await getPlanView(ctx.userId, testId, ctx.today);
  if (!view) return null;
  if (view.explanation) return view.explanation;
  if (view.plan.status !== "active" && view.plan.status !== "complete")
    return null;
  const explanation = await explainPlan(ctx, explanationFacts(view, ctx.today));
  await storeExplanation(ctx.userId, testId, view.hash, explanation);
  return explanation;
}

/**
 * Turns a test's plan on: allowed once every topic has a confidence rating.
 *
 * The ratings the student sees on screen are sent along and saved here first.
 * Each rating is also saved when it is clicked, but that save can still be on
 * its way when "Build my plan" is pressed, and the plan must not be refused
 * for a rating the student has already given.
 *
 * @param ratings confidence (1 to 5) by topic id; ids that are not topics of this test are ignored
 */
export async function startPlan(
  user: { userId: string },
  testId: string,
  ratings: Record<string, number> = {},
): Promise<void> {
  const test = await getTest(user.userId, testId);
  if (!test) throw new NotFoundError("Test not found");
  const topics = await listTopics(user.userId, testId);
  if (topics.length === 0) throw new InvalidRequestError("Add at least one topic first.");

  const rated = topics.map((topic) => ({ topic, confidence: ratings[topic.id] ?? topic.confidence }));
  for (const { confidence } of rated) {
    if (confidence !== null && (!Number.isInteger(confidence) || confidence < 1 || confidence > 5)) {
      throw new InvalidRequestError("A confidence rating has to be a whole number from 1 to 5.");
    }
  }
  const unrated = rated.filter((r) => r.confidence === null).length;
  if (unrated > 0) {
    throw new InvalidRequestError(
      `Rate your confidence on ${unrated === 1 ? "the last topic" : `the remaining ${unrated} topics`} first.`,
    );
  }
  for (const { topic, confidence } of rated) {
    if (confidence !== null && confidence !== topic.confidence) {
      await updateTopic(user.userId, topic.id, { confidence });
    }
  }
  if (!test.planReadyAt) await updateTest(user.userId, testId, { planReadyAt: new Date() });
}

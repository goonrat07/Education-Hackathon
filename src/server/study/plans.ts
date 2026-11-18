import "server-only";
import { LEVEL_NAMES } from "@/config/study";
import { MODES } from "@/lib/modes";
import { buildPlan, planHash, type Plan } from "@/lib/plan";
import { explainPlan } from "@/server/ai/explain";
import type { AiContext } from "@/server/ai/client";
import { getStoredPlan, storeExplanation, storePlan } from "@/server/data/plans";
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
export async function getPlanView(userId: string, testId: string, today: string): Promise<PlanView | null> {
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
      if (day.date >= stored.computedOn && day.date < today) skipped += day.sessions.length;
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
    await storePlan(userId, testId, { plan, planHash: hash, computedOn: today, missedOn, missedSessions });
  }

  return {
    state,
    plan,
    hash,
    missed: missedOn ? { sessions: missedSessions, on: missedOn } : null,
    explanation: stored && stored.explanationHash === hash ? stored.explanation : null,
  };
}

/** The facts Claude is given to explain a plan: names and numbers, nothing it could change. */
function explanationFacts(view: PlanView, today: string) {
  const name = new Map(view.state.topics.map((t) => [t.id, t.name]));
  const { plan, state } = view;
  return {
    className: state.test.className,
    testName: state.test.name,
    today,
    testDate: state.test.testDate,
    minutesPerDay: state.test.minutesPerDay,
    topics: state.topics.map((t) => ({
      name: t.name,
      type: t.type,
      level: LEVEL_NAMES[t.level],
      confidenceOutOf5: t.confidence,
      latestCheck: t.latestCheck ? `${t.latestCheck.correct} of ${t.latestCheck.scored}` : "none yet",
      sessionsDone: t.sessionsDone,
    })),
    days: plan.days.map((d) => ({
      date: d.date,
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
          topicsWithoutReview: plan.shortage.unreviewed.map((id) => name.get(id)),
          prioritized: plan.shortage.prioritized.map((id) => name.get(id)),
        }
      : null,
  };
}

/** Returns the explanation for the current plan, writing a new one only when the plan has changed. */
export async function ensureExplanation(ctx: AiContext, testId: string): Promise<string | null> {
  const view = await getPlanView(ctx.userId, testId, ctx.today);
  if (!view) return null;
  if (view.explanation) return view.explanation;
  if (view.plan.status !== "active" && view.plan.status !== "complete") return null;
  const explanation = await explainPlan(ctx, explanationFacts(view, ctx.today));
  await storeExplanation(ctx.userId, testId, view.hash, explanation);
  return explanation;
}

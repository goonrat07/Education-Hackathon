import "server-only";
import type { Level, TopicType } from "@/config/study";
import { readiness, type CheckScore } from "@/lib/levels";
import type { PlanInput } from "@/lib/plan";
import { listSubmittedChecks } from "@/server/data/checks";
import { listCompletedSessions } from "@/server/data/sessions";
import { getTest, type Test } from "@/server/data/tests";
import { listTopics } from "@/server/data/topics";

/** Everything known about one topic right now, gathered from its history. */
export interface TopicState {
  id: string;
  name: string;
  summary: string;
  type: TopicType;
  position: number;
  confidence: number | null;
  level: Level;
  levelSince: string | null;
  passageIds: string[];
  /** The most recent submitted check on this topic. */
  latestCheck: (CheckScore & { passed: boolean; kind: "session" | "delayed"; on: string }) | null;
  /** Local date of the last completed study session. */
  lastStudiedOn: string | null;
  /** Local date of the last session or check. */
  lastActivityOn: string | null;
  sessionsDone: number;
}

export interface TestState {
  test: Test;
  topics: TopicState[];
  /** Planned minutes of the sessions already completed today. */
  minutesDoneToday: number;
  /** 0 to 1, from topic levels. */
  readiness: number;
}

function later(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

/** Loads a test with its topics and their study history. Null when the test is not the caller's. */
export async function loadTestState(userId: string, testId: string, today: string): Promise<TestState | null> {
  const test = await getTest(userId, testId);
  if (!test) return null;
  const [topics, sessions, checks] = await Promise.all([
    listTopics(userId, testId),
    listCompletedSessions(userId, testId),
    listSubmittedChecks(userId, testId),
  ]);

  const sessionsDone = new Map<string, number>();
  const lastStudied = new Map<string, string>();
  let minutesDoneToday = 0;
  for (const session of sessions) {
    sessionsDone.set(session.topicId, (sessionsDone.get(session.topicId) ?? 0) + 1);
    lastStudied.set(session.topicId, later(lastStudied.get(session.topicId) ?? null, session.localDate)!);
    if (session.localDate === today) minutesDoneToday += session.plannedMinutes;
  }

  const latestCheck = new Map<string, TopicState["latestCheck"]>();
  const lastChecked = new Map<string, string>();
  for (const check of checks) {
    // Checks arrive oldest first, so the last one seen for a topic is its latest.
    latestCheck.set(check.topicId, {
      correct: check.correct ?? 0,
      scored: check.scored ?? 0,
      passed: check.passed ?? false,
      kind: check.kind,
      on: check.localDate,
    });
    lastChecked.set(check.topicId, later(lastChecked.get(check.topicId) ?? null, check.localDate)!);
  }

  const states: TopicState[] = topics.map((topic) => {
    const studied = lastStudied.get(topic.id) ?? null;
    return {
      id: topic.id,
      name: topic.name,
      summary: topic.summary,
      type: topic.type,
      position: topic.position,
      confidence: topic.confidence,
      level: topic.level as Level,
      levelSince: topic.levelSince,
      passageIds: topic.passageIds,
      latestCheck: latestCheck.get(topic.id) ?? null,
      lastStudiedOn: studied,
      lastActivityOn: later(studied, lastChecked.get(topic.id) ?? null),
      sessionsDone: sessionsDone.get(topic.id) ?? 0,
    };
  });

  return {
    test,
    topics: states,
    minutesDoneToday,
    readiness: readiness(states.map((t) => t.level)),
  };
}

/** The planner's input for a test as it stands today. */
export function toPlanInput(state: TestState, today: string): PlanInput {
  return {
    today,
    testDate: state.test.testDate,
    minutesPerDay: state.test.minutesPerDay,
    minutesDoneToday: state.minutesDoneToday,
    topics: state.topics.map((t) => ({
      id: t.id,
      position: t.position,
      type: t.type,
      confidence: t.confidence,
      level: t.level,
      latestCheckScore: t.latestCheck && t.latestCheck.scored > 0 ? t.latestCheck.correct / t.latestCheck.scored : null,
      lastStudiedOn: t.lastStudiedOn,
      sessionsDone: t.sessionsDone,
    })),
  };
}

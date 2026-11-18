import "server-only";
import type { Level } from "@/config/study";
import { daysBetween } from "@/lib/dates";
import type { ModeId } from "@/lib/modes";
import { listCompletedSessions } from "@/server/data/sessions";
import { listTests, type Test } from "@/server/data/tests";
import type { UserContext } from "@/server/session";
import { getPlanView } from "./plans";

export interface TodaySession {
  testId: string;
  testLabel: string;
  topicId: string;
  topicName: string;
  mode: ModeId;
  minutes: number;
  kind: "learn" | "review";
}

export interface DoneSession {
  testLabel: string;
  topicName: string;
  mode: string;
  minutes: number;
}

export interface TestCard {
  test: Test;
  daysLeft: number;
  /** Whether the student has built a plan for this test yet. */
  ready: boolean;
  levels: Level[];
  topicCount: number;
  /** Sessions left in today's plan for this test. */
  sessionsToday: number;
  shortage: "coverage" | "review" | null;
}

export interface Dashboard {
  /** Sessions still to do today across every test, soonest test first. */
  today: TodaySession[];
  doneToday: DoneSession[];
  /** Planned sessions that were skipped on earlier days, noticed today. */
  missedSessions: number;
  tests: TestCard[];
}

/** Everything the home screen shows: today's plan and each test's countdown and readiness. */
export async function getDashboard(user: UserContext): Promise<Dashboard> {
  const tests = await listTests(user.userId);
  const today: TodaySession[] = [];
  const doneToday: DoneSession[] = [];
  const cards: TestCard[] = [];
  let missedSessions = 0;

  for (const test of tests) {
    const daysLeft = daysBetween(user.today, test.testDate);
    const label = `${test.className}: ${test.name}`;
    if (!test.planReadyAt) {
      cards.push({ test, daysLeft, ready: false, levels: [], topicCount: 0, sessionsToday: 0, shortage: null });
      continue;
    }
    const view = await getPlanView(user.userId, test.id, user.today);
    if (!view) continue;
    const names = new Map(view.state.topics.map((t) => [t.id, t.name]));
    const planned = view.plan.days.find((d) => d.date === user.today)?.sessions ?? [];
    for (const session of planned) {
      today.push({
        testId: test.id,
        testLabel: label,
        topicId: session.topicId,
        topicName: names.get(session.topicId) ?? "",
        mode: session.mode,
        minutes: session.minutes,
        kind: session.kind,
      });
    }
    if (view.missed) missedSessions += view.missed.sessions;
    for (const done of await listCompletedSessions(user.userId, test.id)) {
      if (done.localDate !== user.today) continue;
      doneToday.push({
        testLabel: label,
        topicName: names.get(done.topicId) ?? "",
        mode: done.mode,
        minutes: done.plannedMinutes,
      });
    }
    cards.push({
      test,
      daysLeft,
      ready: true,
      levels: view.state.topics.map((t) => t.level),
      topicCount: view.state.topics.length,
      sessionsToday: planned.length,
      shortage: view.plan.shortage?.kind ?? null,
    });
  }
  return { today, doneToday, missedSessions, tests: cards };
}

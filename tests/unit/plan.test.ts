import { describe, expect, it } from "vitest";
import type { Level, TopicType } from "@/config/study";
import { MAX_SESSION_MINUTES, MIN_SESSION_MINUTES } from "@/config/study";
import { buildPlan, planHash, weakestFirst, type Plan, type PlanInput, type PlanTopic } from "@/lib/plan";

const TODAY = "2026-11-18";

function topic(id: string, position: number, type: TopicType, confidence: number | null): PlanTopic {
  return {
    id,
    position,
    type,
    confidence,
    level: 0,
    latestCheckScore: null,
    lastStudiedOn: null,
    sessionsDone: 0,
  };
}

/** A studied topic: it has had a session and sits at the given level. */
function studied(base: PlanTopic, level: Level, lastStudiedOn: string, latestCheckScore = 0.75): PlanTopic {
  return { ...base, level, lastStudiedOn, sessionsDone: 1, latestCheckScore };
}

// Weakest to strongest by confidence: B (1), A (2), D (3), C (4).
const A = topic("A", 0, "memorization", 2);
const B = topic("B", 1, "application", 1);
const C = topic("C", 2, "concept", 4);
const D = topic("D", 3, "memorization", 3);
const FOUR = [A, B, C, D];

function input(overrides: Partial<PlanInput>): PlanInput {
  return { today: TODAY, testDate: "2026-11-21", minutesPerDay: 30, minutesDoneToday: 0, topics: FOUR, ...overrides };
}

/** "B learn 10" style summary of a day, for readable assertions. */
function summary(plan: Plan, date: string): string[] {
  const day = plan.days.find((d) => d.date === date);
  if (!day) throw new Error(`no day ${date} in plan`);
  return day.sessions.map((s) => `${s.topicId} ${s.kind} ${s.minutes}`);
}

function allSessions(plan: Plan) {
  return plan.days.flatMap((d) => d.sessions.map((s) => ({ ...s, date: d.date })));
}

describe("weakestFirst", () => {
  it("orders unstudied topics by confidence, lowest first", () => {
    expect(weakestFirst(FOUR).map((t) => t.id)).toEqual(["B", "A", "D", "C"]);
  });

  it("puts a lower level ahead of a lower confidence", () => {
    const learning = studied(topic("X", 0, "concept", 1), 1, TODAY);
    const notStarted = topic("Y", 1, "concept", 5);
    expect(weakestFirst([learning, notStarted]).map((t) => t.id)).toEqual(["Y", "X"]);
  });

  it("lets the latest check outweigh confidence within a level", () => {
    const acedButUnsure = studied(topic("X", 0, "concept", 1), 1, TODAY, 1);
    const flunkedButSure = studied(topic("Y", 1, "concept", 5), 1, TODAY, 0.25);
    expect(weakestFirst([acedButUnsure, flunkedButSure]).map((t) => t.id)).toEqual(["Y", "X"]);
  });

  it("falls back to list order on a tie", () => {
    const first = topic("X", 0, "concept", 3);
    const second = topic("Y", 1, "concept", 3);
    expect(weakestFirst([second, first]).map((t) => t.id)).toEqual(["X", "Y"]);
  });

  it("treats an unrated topic as middling", () => {
    const low = topic("L", 0, "concept", 2);
    const unrated = topic("U", 1, "concept", null);
    const high = topic("H", 2, "concept", 4);
    expect(weakestFirst([high, unrated, low]).map((t) => t.id)).toEqual(["L", "U", "H"]);
  });
});

describe("buildPlan: sessions", () => {
  it("gives memorization topics flashcards and the others practice problems", () => {
    const plan = buildPlan(input({ testDate: "2026-11-28", minutesPerDay: 50 }));
    const modes = new Map(allSessions(plan).map((s) => [s.topicId, s.mode]));
    expect(modes.get("A")).toBe("flashcards");
    expect(modes.get("D")).toBe("flashcards");
    expect(modes.get("B")).toBe("practice");
    expect(modes.get("C")).toBe("practice");
  });

  it("keeps every session between 10 and 15 minutes", () => {
    for (const minutesPerDay of [10, 20, 25, 30, 45, 60, 90]) {
      const plan = buildPlan(input({ minutesPerDay, testDate: "2026-11-24" }));
      for (const session of allSessions(plan)) {
        expect(session.minutes).toBeGreaterThanOrEqual(MIN_SESSION_MINUTES);
        expect(session.minutes).toBeLessThanOrEqual(MAX_SESSION_MINUTES);
      }
    }
  });

  it("uses full-length sessions when everything fits", () => {
    const plan = buildPlan(input({ testDate: "2026-11-25", minutesPerDay: 50 }));
    expect(plan.shortage).toBeNull();
    for (const session of allSessions(plan)) {
      expect(session.minutes).toBe(session.mode === "practice" ? 15 : 10);
    }
  });

  it("shortens the last session of a day to the minutes that are left", () => {
    const p1 = topic("P1", 0, "application", 1);
    const p2 = topic("P2", 1, "application", 2);
    const plan = buildPlan(input({ testDate: "2026-11-19", minutesPerDay: 25, topics: [p1, p2] }));
    expect(summary(plan, TODAY)).toEqual(["P1 learn 15", "P2 learn 10"]);
  });
});

describe("buildPlan: days", () => {
  it("runs from today through test day", () => {
    const plan = buildPlan(input({}));
    expect(plan.days.map((d) => d.date)).toEqual(["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
    expect(plan.days.map((d) => d.isTestDay)).toEqual([false, false, false, true]);
  });

  it("schedules nothing on test day when there are days before it", () => {
    const plan = buildPlan(input({}));
    expect(plan.days.at(-1)?.sessions).toEqual([]);
  });

  it("never plans more minutes than a day has", () => {
    for (const minutesPerDay of [10, 20, 25, 30, 45, 60]) {
      const plan = buildPlan(input({ minutesPerDay, testDate: "2026-11-23" }));
      for (const day of plan.days) {
        const total = day.sessions.reduce((sum, s) => sum + s.minutes, 0);
        expect(day.minutesPlanned).toBe(total);
        expect(total).toBeLessThanOrEqual(day.minutesAvailable);
      }
    }
  });

  it("takes the minutes already studied today off today's total", () => {
    const plan = buildPlan(input({ minutesDoneToday: 15 }));
    expect(plan.days[0].minutesAvailable).toBe(15);
    expect(plan.days[1].minutesAvailable).toBe(30);
  });

  it("uses today when the test is today", () => {
    const plan = buildPlan(input({ testDate: TODAY, minutesPerDay: 30 }));
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].isTestDay).toBe(true);
    expect(plan.days[0].sessions.length).toBeGreaterThan(0);
  });
});

describe("buildPlan: order and review", () => {
  it("starts with the weakest topic", () => {
    const plan = buildPlan(input({}));
    expect(plan.days[0].sessions[0].topicId).toBe("B");
  });

  it("covers new topics weakest first", () => {
    const plan = buildPlan(input({ testDate: "2026-11-28" }));
    const learnOrder = allSessions(plan)
      .filter((s) => s.kind === "learn")
      .map((s) => s.topicId);
    expect(learnOrder).toEqual(["B", "A", "D", "C"]);
  });

  it("brings every topic back for review on a later day when there is room", () => {
    const plan = buildPlan(input({ testDate: "2026-11-28" }));
    expect(plan.shortage).toBeNull();
    const sessions = allSessions(plan);
    for (const id of ["A", "B", "C", "D"]) {
      const learn = sessions.find((s) => s.topicId === id && s.kind === "learn");
      const reviews = sessions.filter((s) => s.topicId === id && s.kind === "review");
      expect(learn).toBeDefined();
      expect(reviews.length).toBeGreaterThanOrEqual(1);
      for (const review of reviews) expect(review.date > learn!.date).toBe(true);
    }
  });

  it("reviews the weakest topic on the last day before the test", () => {
    const plan = buildPlan(input({ testDate: "2026-11-28" }));
    const lastStudyDay = plan.days.at(-2)!;
    expect(lastStudyDay.date).toBe("2026-11-27");
    expect(lastStudyDay.sessions.map((s) => s.topicId)).toContain("B");
  });

  it("spaces a topic out: learn, review the next day, review again before the test", () => {
    const only = topic("M", 0, "memorization", 3);
    const plan = buildPlan(input({ testDate: "2026-11-24", topics: [only] }));
    const dates = allSessions(plan).map((s) => `${s.date} ${s.kind}`);
    expect(dates).toEqual(["2026-11-18 learn", "2026-11-19 review", "2026-11-23 review"]);
    expect(plan.shortage).toBeNull();
  });

  it("puts new topics before reviews within a day, each weakest first", () => {
    const plan = buildPlan(input({}));
    expect(summary(plan, "2026-11-19")).toEqual(["C learn 10", "B review 10", "C review 10"]);
  });
});

describe("buildPlan: worked examples", () => {
  it("shrinks sessions to 10 minutes when full length would leave topics unreviewed", () => {
    const plan = buildPlan(input({}));
    expect(summary(plan, "2026-11-18")).toEqual(["B learn 10", "A learn 10", "D learn 10"]);
    expect(summary(plan, "2026-11-19")).toEqual(["C learn 10", "B review 10", "C review 10"]);
    expect(summary(plan, "2026-11-20")).toEqual(["B review 10", "A review 10", "D review 10"]);
    expect(summary(plan, "2026-11-21")).toEqual([]);
    expect(plan.shortage).toBeNull();
    expect(plan.status).toBe("active");
  });

  it("plans the night before: cover everything once, then review the weakest", () => {
    const plan = buildPlan(input({ testDate: "2026-11-19", minutesPerDay: 60 }));
    expect(summary(plan, TODAY)).toEqual([
      "B learn 10",
      "A learn 10",
      "D learn 10",
      "C learn 10",
      "B review 10",
      "A review 10",
    ]);
    expect(plan.shortage?.kind).toBe("review");
    expect(plan.shortage?.unreviewed).toEqual(["D", "C"]);
    expect(plan.shortage?.uncovered).toEqual([]);
  });
});

describe("buildPlan: not enough time", () => {
  it("says which topics will not fit and which to prioritize", () => {
    const plan = buildPlan(input({ testDate: "2026-11-19", minutesPerDay: 20 }));
    expect(summary(plan, TODAY)).toEqual(["B learn 10", "A learn 10"]);
    expect(plan.shortage?.kind).toBe("coverage");
    expect(plan.shortage?.uncovered).toEqual(["D", "C"]);
    expect(plan.shortage?.prioritized).toEqual(["B", "A"]);
  });

  it("reports the minutes available against the minutes wanted", () => {
    const plan = buildPlan(input({ testDate: "2026-11-19", minutesPerDay: 20 }));
    expect(plan.shortage?.minutesAvailable).toBe(20);
    // Each topic wants a first session and one review: 2 × (15 + 10 + 15 + 10).
    expect(plan.shortage?.minutesWanted).toBe(100);
  });

  it("copes with a day too short for any session", () => {
    const plan = buildPlan(input({ minutesPerDay: 5 }));
    expect(allSessions(plan)).toEqual([]);
    expect(plan.shortage?.kind).toBe("coverage");
    expect(plan.shortage?.uncovered).toEqual(["B", "A", "D", "C"]);
    expect(plan.shortage?.prioritized).toEqual([]);
  });

  it("has no shortage when everything is covered and reviewed", () => {
    const plan = buildPlan(input({ testDate: "2026-11-28" }));
    expect(plan.shortage).toBeNull();
  });
});

describe("buildPlan: progress changes the plan", () => {
  const yesterday = "2026-11-17";

  it("gives a Got it topic exactly one review, close to the test", () => {
    const gotIt = studied(A, 2, yesterday);
    const plan = buildPlan(input({ testDate: "2026-11-24", topics: [gotIt] }));
    expect(allSessions(plan).map((s) => `${s.date} ${s.kind}`)).toEqual(["2026-11-23 review"]);
  });

  it("gives a Locked in topic nothing", () => {
    const lockedIn = studied(A, 3, yesterday);
    const plan = buildPlan(input({ testDate: "2026-11-24", topics: [lockedIn, B] }));
    expect(allSessions(plan).some((s) => s.topicId === "A")).toBe(false);
  });

  it("does not teach a studied topic again as new", () => {
    const learning = studied(B, 1, yesterday);
    const plan = buildPlan(input({ testDate: "2026-11-24", topics: [learning] }));
    expect(allSessions(plan).map((s) => `${s.date} ${s.kind}`)).toEqual([
      "2026-11-18 review",
      "2026-11-23 review",
    ]);
  });

  it("does not review a topic again on the day it was studied when a later day is free", () => {
    const studiedToday = studied(B, 1, TODAY);
    const plan = buildPlan(input({ testDate: "2026-11-24", topics: [studiedToday] }));
    expect(summary(plan, TODAY)).toEqual([]);
    expect(allSessions(plan).map((s) => `${s.date} ${s.kind}`)).toEqual([
      "2026-11-19 review",
      "2026-11-23 review",
    ]);
  });

  it("is complete when every topic is Locked in", () => {
    const plan = buildPlan(input({ topics: [studied(A, 3, yesterday), studied(B, 3, yesterday)] }));
    expect(plan.status).toBe("complete");
    expect(allSessions(plan)).toEqual([]);
    expect(plan.shortage).toBeNull();
  });

  it("rebuilds from today after a missed day", () => {
    const planned = buildPlan(input({ testDate: "2026-11-28" }));
    const dayLater = buildPlan(input({ today: "2026-11-19", testDate: "2026-11-28" }));
    expect(planned.days[0].date).toBe("2026-11-18");
    expect(dayLater.days[0].date).toBe("2026-11-19");
    expect(dayLater.days.every((d) => d.date >= "2026-11-19")).toBe(true);
    const learned = allSessions(dayLater)
      .filter((s) => s.kind === "learn")
      .map((s) => s.topicId);
    expect(learned).toEqual(["B", "A", "D", "C"]);
  });
});

describe("buildPlan: edges", () => {
  it("is past when the test date has gone", () => {
    const plan = buildPlan(input({ testDate: "2026-11-17" }));
    expect(plan.status).toBe("past");
    expect(plan.days).toEqual([]);
    expect(plan.shortage).toBeNull();
  });

  it("is empty with no topics", () => {
    const plan = buildPlan(input({ topics: [] }));
    expect(plan.status).toBe("empty");
    expect(allSessions(plan)).toEqual([]);
    expect(plan.shortage).toBeNull();
  });

  it("handles a long run-up with many topics", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      topic(`T${i}`, i, i % 3 === 0 ? "memorization" : "application", (i % 5) + 1),
    );
    const plan = buildPlan(input({ testDate: "2027-01-17", minutesPerDay: 45, topics: many }));
    expect(plan.days).toHaveLength(61);
    expect(plan.shortage).toBeNull();
    const learned = new Set(
      allSessions(plan)
        .filter((s) => s.kind === "learn")
        .map((s) => s.topicId),
    );
    expect(learned.size).toBe(30);
  });
});

describe("buildPlan: the same inputs always give the same plan", () => {
  it("returns an identical plan when called twice", () => {
    expect(buildPlan(input({}))).toEqual(buildPlan(input({})));
  });

  it("does not depend on the order topics are passed in", () => {
    const shuffled = [D, B, A, C];
    const plan = buildPlan(input({}));
    const other = buildPlan(input({ topics: shuffled }));
    expect(other).toEqual(plan);
    expect(planHash(other)).toBe(planHash(plan));
  });

  it("does not change its input", () => {
    const topics = FOUR.map((t) => ({ ...t }));
    const frozen = JSON.stringify(topics);
    buildPlan(input({ topics }));
    expect(JSON.stringify(topics)).toBe(frozen);
  });

  it("gives different plans different hashes", () => {
    const a = buildPlan(input({}));
    const b = buildPlan(input({ minutesPerDay: 60 }));
    expect(planHash(a)).not.toBe(planHash(b));
  });
});

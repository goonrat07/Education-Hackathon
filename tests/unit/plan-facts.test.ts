import { describe, expect, it } from "vitest";
import { buildPlan } from "@/lib/plan";
import { explanationFacts, type PlanView } from "@/server/study/plans";
import { toPlanInput, type TestState } from "@/server/study/state";

const TODAY = "2026-11-18";

function viewFor(testDate: string): PlanView {
  const state = {
    test: { className: "Chemistry", name: "Unit 4", testDate, minutesPerDay: 30 },
    topics: ["The mole", "Molar mass"].map((name, i) => ({
      id: `t${i}`,
      name,
      summary: "",
      type: i === 0 ? "memorization" : "application",
      position: i,
      confidence: 3,
      level: 0,
      levelSince: null,
      passageIds: ["p"],
      latestCheck: null,
      lastStudiedOn: null,
      lastActivityOn: null,
      sessionsDone: 0,
    })),
    minutesDoneToday: 0,
    readiness: 0,
  } as unknown as TestState;
  return { state, plan: buildPlan(toPlanInput(state, TODAY)), hash: "h", missed: null, explanation: null };
}

describe("the facts Claude is given to explain a plan", () => {
  it("lists only the days that have sessions, plus test day", () => {
    const view = viewFor("2027-03-01"); // more than three months away, two topics
    const facts = explanationFacts(view, TODAY);

    expect(view.plan.days.length).toBeGreaterThan(100);
    expect(facts.days.length).toBeLessThan(10);
    expect(facts.days.every((d) => d.sessions.length > 0 || d.isTestDay)).toBe(true);
    expect(facts.days.at(-1)).toMatchObject({ date: "2027-03-01", isTestDay: true });
  });

  it("says how many study days there are and how many have nothing planned", () => {
    const view = viewFor("2027-03-01");
    const facts = explanationFacts(view, TODAY);
    const studyDays = view.plan.days.filter((d) => !d.isTestDay);
    const empty = studyDays.filter((d) => d.sessions.length === 0);

    expect(facts.studyDays).toBe(studyDays.length);
    expect(facts.studyDaysWithNothingPlanned).toBe(empty.length);
  });

  it("keeps every day of a short plan that is full", () => {
    const view = viewFor("2026-11-20");
    const facts = explanationFacts(view, TODAY);
    expect(facts.days.map((d) => d.date)).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
    expect(facts.studyDaysWithNothingPlanned).toBe(0);
  });
});

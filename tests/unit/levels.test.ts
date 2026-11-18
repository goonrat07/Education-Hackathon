import { describe, expect, it } from "vitest";
import type { Level } from "@/config/study";
import {
  biggestGaps,
  checkPassed,
  confidenceGap,
  dueForDelayedCheck,
  nextLevel,
  pickDelayedCheckTopic,
  readiness,
} from "@/lib/levels";

const ALL_LEVELS: Level[] = [0, 1, 2, 3];
const KINDS = ["session", "delayed"] as const;

describe("checkPassed", () => {
  it.each([
    [3, 3],
    [3, 4],
    [4, 4],
    [4, 5],
    [5, 5],
  ])("passes with %i of %i", (correct, scored) => {
    expect(checkPassed(correct, scored)).toBe(true);
  });

  it.each([
    [2, 3],
    [2, 4],
    [3, 5],
    [0, 4],
  ])("fails with %i of %i", (correct, scored) => {
    expect(checkPassed(correct, scored)).toBe(false);
  });

  it("cannot be passed with fewer than three scored questions", () => {
    expect(checkPassed(2, 2)).toBe(false);
    expect(checkPassed(1, 1)).toBe(false);
  });

  it("cannot be passed with no scored questions", () => {
    expect(checkPassed(0, 0)).toBe(false);
  });
});

describe("nextLevel", () => {
  const since = "2026-11-18";

  it.each(KINDS)("moves Not started to Learning on a passed %s check", (kind) => {
    expect(nextLevel(0, null, { kind, passed: true, takenOn: since })).toBe(1);
  });

  it.each(KINDS)("moves Learning to Got it on a passed %s check", (kind) => {
    expect(nextLevel(1, since, { kind, passed: true, takenOn: since })).toBe(2);
  });

  it("moves only one level per passed check", () => {
    expect(nextLevel(0, null, { kind: "delayed", passed: true, takenOn: "2026-11-25" })).toBe(1);
  });

  it("never moves a level on a failed check", () => {
    for (const level of ALL_LEVELS) {
      for (const kind of KINDS) {
        expect(nextLevel(level, since, { kind, passed: false, takenOn: "2026-11-25" })).toBe(level);
      }
    }
  });

  it("locks in on a delayed check passed the day after reaching Got it", () => {
    expect(nextLevel(2, since, { kind: "delayed", passed: true, takenOn: "2026-11-19" })).toBe(3);
  });

  it("locks in on a delayed check passed several days later", () => {
    expect(nextLevel(2, since, { kind: "delayed", passed: true, takenOn: "2026-11-24" })).toBe(3);
  });

  it("does not lock in on a delayed check passed the same day as reaching Got it", () => {
    expect(nextLevel(2, since, { kind: "delayed", passed: true, takenOn: since })).toBe(2);
  });

  it("does not lock in on an end-of-session check, however much later", () => {
    expect(nextLevel(2, since, { kind: "session", passed: true, takenOn: "2026-11-24" })).toBe(2);
  });

  it("does not lock in when the date Got it was reached is unknown", () => {
    expect(nextLevel(2, null, { kind: "delayed", passed: true, takenOn: "2026-11-24" })).toBe(2);
  });

  it("keeps Locked in after any check", () => {
    for (const kind of KINDS) {
      for (const passed of [true, false]) {
        expect(nextLevel(3, since, { kind, passed, takenOn: "2026-11-24" })).toBe(3);
      }
    }
  });
});

describe("readiness", () => {
  it("is zero with no topics", () => {
    expect(readiness([])).toBe(0);
  });

  it("is zero when nothing has started", () => {
    expect(readiness([0, 0])).toBe(0);
  });

  it("is one when everything is locked in", () => {
    expect(readiness([3, 3])).toBe(1);
  });

  it("averages what each level is worth", () => {
    expect(readiness([1, 2])).toBeCloseTo(0.5, 10);
    expect(readiness([0, 1, 2, 3])).toBeCloseTo(0.5, 10);
    expect(readiness([2, 2, 2])).toBeCloseTo(2 / 3, 10);
  });
});

describe("confidenceGap", () => {
  it("is positive when confidence is higher than the check result", () => {
    expect(confidenceGap(5, { correct: 1, scored: 4 })).toBeCloseTo(0.75, 10);
  });

  it("is negative when the check went better than the student expected", () => {
    expect(confidenceGap(1, { correct: 4, scored: 4 })).toBeCloseTo(-1, 10);
  });

  it("is zero when they match", () => {
    expect(confidenceGap(3, { correct: 2, scored: 4 })).toBeCloseTo(0, 10);
  });

  it("is unknown without a confidence rating", () => {
    expect(confidenceGap(null, { correct: 1, scored: 4 })).toBeNull();
  });

  it("is unknown without a check", () => {
    expect(confidenceGap(4, null)).toBeNull();
  });

  it("is unknown when the check had no scored questions", () => {
    expect(confidenceGap(4, { correct: 0, scored: 0 })).toBeNull();
  });
});

describe("biggestGaps", () => {
  const row = (id: string, confidence: number | null, correct: number, scored: number) => ({
    id,
    confidence,
    latest: scored ? { correct, scored } : null,
  });

  it("lists the largest gaps first, whichever direction they go", () => {
    const rows = [row("a", 5, 2, 4), row("b", 1, 4, 4), row("c", 5, 1, 4)];
    expect(biggestGaps(rows).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("does not call out a student who rated 4 of 5 and then got everything right", () => {
    expect(biggestGaps([row("a", 4, 4, 4)])).toEqual([]);
  });

  it("does not call out a student who rated 5 of 5 and missed one of four", () => {
    expect(biggestGaps([row("a", 5, 3, 4)])).toEqual([]);
  });

  it("leaves out gaps too small to matter", () => {
    const rows = [row("a", 4, 3, 4), row("b", 3, 2, 4)];
    expect(biggestGaps(rows)).toEqual([]);
  });

  it("calls out at most three", () => {
    const rows = [row("a", 5, 0, 4), row("b", 5, 0, 4), row("c", 5, 0, 4), row("d", 5, 0, 4)];
    expect(biggestGaps(rows)).toHaveLength(3);
  });

  it("skips topics with no rating or no check", () => {
    const rows = [row("a", null, 0, 4), row("b", 5, 0, 0)];
    expect(biggestGaps(rows)).toEqual([]);
  });

  it("reports the gap it found", () => {
    const [first] = biggestGaps([row("a", 5, 1, 4)]);
    expect(first.gap).toBeCloseTo(0.75, 10);
  });
});

describe("dueForDelayedCheck", () => {
  const today = "2026-11-20";

  it("is not due for a topic that was never studied", () => {
    expect(dueForDelayedCheck({ level: 0, lastStudiedOn: null, lastActivityOn: null }, today)).toBe(false);
  });

  it("is not due for a topic studied today", () => {
    expect(dueForDelayedCheck({ level: 1, lastStudiedOn: today, lastActivityOn: today }, today)).toBe(false);
  });

  it("is due for a topic studied yesterday", () => {
    expect(
      dueForDelayedCheck({ level: 1, lastStudiedOn: "2026-11-19", lastActivityOn: "2026-11-19" }, today),
    ).toBe(true);
  });

  it("is due for a studied topic that has not passed anything yet", () => {
    expect(
      dueForDelayedCheck({ level: 0, lastStudiedOn: "2026-11-19", lastActivityOn: "2026-11-19" }, today),
    ).toBe(true);
  });

  it("is not due once a topic is Locked in", () => {
    expect(
      dueForDelayedCheck({ level: 3, lastStudiedOn: "2026-11-18", lastActivityOn: "2026-11-19" }, today),
    ).toBe(false);
  });

  it("is not due again on a day it was already checked", () => {
    expect(dueForDelayedCheck({ level: 2, lastStudiedOn: "2026-11-18", lastActivityOn: today }, today)).toBe(
      false,
    );
  });
});

describe("pickDelayedCheckTopic", () => {
  const today = "2026-11-20";
  const topic = (id: string, position: number, level: Level, lastOn: string | null) => ({
    id,
    position,
    level,
    lastStudiedOn: lastOn,
    lastActivityOn: lastOn,
  });

  it("checks the session's own topic when it is due", () => {
    const topics = [topic("a", 0, 1, "2026-11-17"), topic("b", 1, 1, "2026-11-19")];
    expect(pickDelayedCheckTopic(topics, today, "b")).toBe("b");
  });

  it("otherwise picks the topic left alone the longest", () => {
    const topics = [topic("a", 0, 1, "2026-11-19"), topic("b", 1, 1, "2026-11-17"), topic("c", 2, 0, null)];
    expect(pickDelayedCheckTopic(topics, today, "c")).toBe("b");
  });

  it("breaks a tie on dates with the lower level", () => {
    const topics = [topic("a", 0, 2, "2026-11-19"), topic("b", 1, 1, "2026-11-19"), topic("c", 2, 0, null)];
    expect(pickDelayedCheckTopic(topics, today, "c")).toBe("b");
  });

  it("breaks a remaining tie with list order", () => {
    const topics = [topic("a", 1, 1, "2026-11-19"), topic("b", 0, 1, "2026-11-19"), topic("c", 2, 0, null)];
    expect(pickDelayedCheckTopic(topics, today, "c")).toBe("b");
  });

  it("picks nothing when no topic is due", () => {
    const topics = [topic("a", 0, 1, today), topic("b", 1, 3, "2026-11-17"), topic("c", 2, 0, null)];
    expect(pickDelayedCheckTopic(topics, today, "c")).toBeNull();
  });
});

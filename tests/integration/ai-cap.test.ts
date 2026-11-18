import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import {
  AiCeilingError,
  AiLimitError,
  getAiUsage,
  getAiUsageTotal,
  hasBackgroundHeadroom,
  reserveAiCall,
} from "@/server/data/usage";
import { createUser, resetDb } from "../support/db";

const DAY = "2026-11-18";
let student: string;

beforeEach(async () => {
  await resetDb();
  student = await createUser("student");
});

afterAll(async () => {
  await closeDb();
});

describe("the daily AI call limit", () => {
  it("counts each call", async () => {
    expect(await reserveAiCall(student, DAY, 3)).toBe(1);
    expect(await reserveAiCall(student, DAY, 3)).toBe(2);
    expect(await getAiUsage(student, DAY)).toBe(2);
  });

  it("allows calls up to the limit and refuses the next one", async () => {
    await reserveAiCall(student, DAY, 2);
    await reserveAiCall(student, DAY, 2);
    await expect(reserveAiCall(student, DAY, 2)).rejects.toBeInstanceOf(AiLimitError);
  });

  it("does not count a refused call", async () => {
    await reserveAiCall(student, DAY, 1);
    await expect(reserveAiCall(student, DAY, 1)).rejects.toBeInstanceOf(AiLimitError);
    await expect(reserveAiCall(student, DAY, 1)).rejects.toBeInstanceOf(AiLimitError);
    expect(await getAiUsage(student, DAY)).toBe(1);
  });

  it("holds under a burst of simultaneous calls", async () => {
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => reserveAiCall(student, DAY, 5)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(7);
    expect(await getAiUsage(student, DAY)).toBe(5);
  });

  it("is counted separately for each student", async () => {
    const other = await createUser("other");
    await reserveAiCall(student, DAY, 1);
    expect(await reserveAiCall(other, DAY, 1)).toBe(1);
  });

  it("starts again from zero on a new day", async () => {
    await reserveAiCall(student, DAY, 1);
    expect(await reserveAiCall(student, "2026-11-19", 1)).toBe(1);
  });

  it("refuses everything when the limit is zero", async () => {
    await expect(reserveAiCall(student, DAY, 0)).rejects.toBeInstanceOf(AiLimitError);
    expect(await getAiUsage(student, DAY)).toBe(0);
  });
});

describe("the ceiling for all students together", () => {
  const CEILING = (limit: number) => ({ day: DAY, limit });

  it("counts every student's calls in one running total", async () => {
    const other = await createUser("other");
    await reserveAiCall(student, DAY, 10, CEILING(100));
    await reserveAiCall(other, DAY, 10, CEILING(100));
    await reserveAiCall(other, DAY, 10, CEILING(100));
    expect(await getAiUsageTotal(DAY)).toBe(3);
  });

  it("refuses a call once everyone together has reached it, without counting it for the student", async () => {
    const other = await createUser("other");
    await reserveAiCall(student, DAY, 10, CEILING(2));
    await reserveAiCall(other, DAY, 10, CEILING(2));
    await expect(reserveAiCall(student, DAY, 10, CEILING(2))).rejects.toBeInstanceOf(AiCeilingError);
    expect(await getAiUsage(student, DAY)).toBe(1);
    expect(await getAiUsageTotal(DAY)).toBe(2);
  });

  it("does not count a call that the student's own limit refused", async () => {
    await reserveAiCall(student, DAY, 1, CEILING(5));
    await expect(reserveAiCall(student, DAY, 1, CEILING(5))).rejects.toBeInstanceOf(AiLimitError);
    expect(await getAiUsageTotal(DAY)).toBe(1);
  });

  it("holds under a burst from many students at once", async () => {
    const students = await Promise.all(Array.from({ length: 12 }, (_, i) => createUser(`burst${i}`)));
    const results = await Promise.allSettled(students.map((id) => reserveAiCall(id, DAY, 10, CEILING(5))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await getAiUsageTotal(DAY)).toBe(5);
  });

  it("starts again from zero on a new day", async () => {
    await reserveAiCall(student, DAY, 10, CEILING(1));
    await reserveAiCall(student, "2026-11-19", 10, { day: "2026-11-19", limit: 1 });
    expect(await getAiUsageTotal("2026-11-19")).toBe(1);
  });
});

describe("calls kept back for answering and grading", () => {
  it("leaves room for background work while a student has plenty of calls left", async () => {
    await reserveAiCall(student, DAY, 100);
    expect(await hasBackgroundHeadroom(student, DAY, { limit: 100, reserve: 20 })).toBe(true);
  });

  it("stops background work once fewer calls are left than the reserve", async () => {
    for (let i = 0; i < 81; i++) await reserveAiCall(student, DAY, 100);
    expect(await hasBackgroundHeadroom(student, DAY, { limit: 100, reserve: 20 })).toBe(false);
  });
});

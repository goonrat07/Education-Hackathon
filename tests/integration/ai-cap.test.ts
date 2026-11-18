import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { AiLimitError, getAiUsage, reserveAiCall } from "@/server/data/usage";
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
